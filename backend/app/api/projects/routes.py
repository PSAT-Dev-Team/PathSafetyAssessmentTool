# app/api/projects/routes.py
from flask import Blueprint, jsonify, request, send_from_directory, abort, make_response
from pathlib import Path
import traceback
from . import bp
from werkzeug.utils import safe_join
from pathlib import Path
import app.services.global_var as global_var
import pandas as pd
import os
import exifread
from shapely.geometry import Point,LineString 
import geopandas as gpd
import shutil



# —— 复用你现有的服务层 —— #
from app.services.project_manager import project_manager, Project   # 若路径不同，按你的真实包路径改
import app.services.serializer as serializer
import app.services.cycleRAP_interface as CRI
import app.services.cycleRAP_VA as cycleRAP_VA
# --- Auto-code API (single & bulk) ---

from app.services import prediction as cv_pred
from app.services import gis_mapping as gis


# util
def ok(data, code=200):
    return jsonify(data), code

def fail(message, code=400):
    return jsonify({"error": message}), code

# 进程级上下文（替代 streamlit 的 session_state）
_CTX = {"ready": False, "pm": None}



def get_ctx():
    """Lazy 初始化：首次调用时把旧代码依赖都准备好；之后复用。"""
    if _CTX["ready"]:
        return _CTX

    # === 原来在 Streamlit 里手动做的 init，这里等价放到后端 ===
    pm = project_manager()                               # 载入配置与扫描项目列表
    # serializer 的 BaseTable/parse/serialize 不需要额外 init；若你有 data_loader，可 try/except
    try:
        serializer.data_loader.initialise()
    except Exception:
        pass

    # CycleRAP 资源目录（按你以前用的 src_path/CycleRAP）
    CRI.cycleRAP_interface.initialise(pm.src_path / "CycleRAP")

    _CTX.update({"pm": pm, "ready": True})
    return _CTX

# ───────────────────────── Endpoints ─────────────────────────

@bp.get("")
def list_projects():
    """列出项目名称（等价你原先 list_names）。"""
    ctx = get_ctx()
    names = ctx["pm"].list_names()
    return jsonify({"projects": names})

@bp.get("/<project_name>")
def get_project(project_name: str):
    """读取项目的元数据、可用版本等（只读）。"""
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    ver = proj.latest()
    return jsonify({
        "name": proj.metadata.project_name,
        "versions": [v.path.name for v in proj.versions],
        "latest": ver.path.name
    })

@bp.get("/<project_name>/versions/latest/attributes")
def get_latest_attributes(project_name: str):
    """返回最新版 attributes.csv（转成 JSON 给前端表格渲染）。"""
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    df = proj.latest().attributes.df
    return jsonify({"rows": df.to_dict(orient="records")})

@bp.get("/<project_name>/geodata")
def get_geodata(project_name: str):
    """返回项目的 GeoData（GeoJSON FeatureCollection）。"""
    import json
    ctx = get_ctx()  # 复用现有的 init 上下文
    proj = ctx["pm"].project(project_name)
    gdf = proj.geo_data.df  # GeoPandas GeoDataFrame

    # GeoDataFrame -> GeoJSON 字符串，再转成 dict 让 jsonify 友好输出
    geojson_obj = json.loads(gdf.to_json())
    return jsonify(geojson_obj)

@bp.get("/<project_name>/images/<path:filename>")
def get_project_image(project_name: str, filename: str):
    """
    返回指定项目下 images 目录里的图片文件：
    GET /api/projects/<project_name>/images/<filename>
    """
    ctx = get_ctx()
    pm = ctx["pm"]

    # 计算 {data}/{project}/images 目录
    images_dir: Path = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER).resolve()

    # 目录存在性检查
    if not images_dir.exists() or not images_dir.is_dir():
        abort(404, description="Images folder not found")

    # 使用 safe_join 防止目录穿越
    safe_path = safe_join(str(images_dir), filename)
    if safe_path is None:
        abort(400, description="Invalid image path")

    file_path = Path(safe_path).resolve()
    # 仍旧双保险校验：必须在 images_dir 之下
    if not str(file_path).startswith(str(images_dir)):
        abort(400, description="Invalid image path")

    if not file_path.exists() or not file_path.is_file():
        abort(404, description="Image not found")

    # 使用 send_from_directory 返回，带条件缓存
    resp = send_from_directory(images_dir, file_path.name, conditional=True)
    # 可选：加一点 Cache-Control（视你的部署需要调整）
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp

@bp.get("/attribute-mappings")
def get_attribute_mappings():
    """
    返回 Attributes 的字段映射（数字 -> 文字），例如：
    {
      "Area type": {"1":"Inner Urban","2":"Outer Urban","3":"Rural","4":"Industrial"},
      "Facility Type": {"1":"Sidewalk", "2":"Multi-Use Path", ...},
      ...
    }
    仅为有枚举映射的字段生成，连续数值（如 AADT、速度）不包含在内。
    """
    mappings = {}
    for field, mapping in (serializer.Attributes.CHOICES or {}).items():
        if not mapping:  # None：表示该字段不是枚举
            continue
        # 反转：数字 -> 文字；转成 str key 方便前端用
        reverse = {str(code): label for (label, code) in mapping.items()}
        mappings[field] = reverse
    return jsonify(mappings)

@bp.post("/<project_name>/score")
def calculate_score(project_name: str):
    """
    用 Excel 宏算分：
    1) 取项目最新版 attributes DataFrame
    2) 调用 cycleRAP_interface.calculate_cycleRAP_score
    3) 写回 results.csv 并保存
    """
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    ver = proj.latest()

    attrs = ver.attributes.df
    # 如果前端 POST 传了临时修改过的 attributes，可合并覆盖：
    payload = request.get_json(silent=True) or {}
    if "attributes" in payload:
        attrs = serializer.Attributes(values=None)
        attrs.df = serializer.pd.DataFrame(payload["attributes"])  # 保持列名一致

    # 计算分数（依赖 Windows + Excel 宏环境）
    results_df = CRI.cycleRAP_interface.calculate_cycleRAP_score(attrs)

    # 写回并持久化
    ver._results = serializer.Results()
    ver.results.df = results_df
    proj.save_all()

    return jsonify({"ok": True, "result_rows": results_df.to_dict(orient="records")})

@bp.post("/<project_name>/treatments")
def evaluate_treatments(project_name: str):
    """
    用 Excel 的 STM 宏生成治理建议：
    - 需要 GeoData + Attributes
    """
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    ver = proj.latest()

    gdf = proj.geo_data.df
    attrs = ver.attributes.df

    treatment_tbl = CRI.cycleRAP_interface.evaluate_treatment_suggestions(gdf, attrs)
    ver._treatment = treatment_tbl
    proj.save_all()

    return jsonify({"ok": True, "rows": treatment_tbl.df.to_dict(orient="records")})

@bp.put("/<string:name>/attributes")
def update_attributes(name: str):
    ctx = get_ctx()
    pm = ctx["pm"]
    proj = pm.project(name)
    if not proj:
        return fail("Project not found", 404)

    data = request.get_json(silent=True) or {}
    rows = data.get("rows")
    if not isinstance(rows, list):
        return fail("Invalid payload", 400)

    # 写入到最新版本
    ver = proj.latest()
    ver.attributes.df = pd.DataFrame(rows)
    ver.attributes.df_dirty = True
    proj.save_all()  # 若跨天会新建新版本
    return ok({"ok": True})

#-----------------------------------------------------------------------------------

def dms_to_decimal(dms, ref):
    deg = dms[0].num / dms[0].den
    minute = dms[1].num / dms[1].den
    sec = dms[2].num / dms[2].den
    dec = deg + minute/60 + sec/3600
    return -dec if ref in ['S','W'] else dec

def get_image_folder_geo(folder_path):
    records = []
    for fname in sorted(os.listdir(folder_path)):
        if not fname.lower().endswith(('.jpg', '.jpeg')):
            continue
        img_path = os.path.join(folder_path, fname)
        with open(img_path, 'rb') as f:
            tags = exifread.process_file(f, details=False)

        # 必要的 GPS tag
        if {'GPS GPSLatitude', 'GPS GPSLongitude',
            'GPS GPSLatitudeRef', 'GPS GPSLongitudeRef'}.issubset(tags):
            
            lat = dms_to_decimal(tags['GPS GPSLatitude'].values,
                                tags['GPS GPSLatitudeRef'].printable)
            lon = dms_to_decimal(tags['GPS GPSLongitude'].values,
                                tags['GPS GPSLongitudeRef'].printable)
            
            records.append({
                'latitude':  lat,
                'longitude': lon,
                'filename':  fname
            })

    df = pd.DataFrame(records)
    # geometry 列
    df['geometry'] = [Point(xy) for xy in zip(df.longitude, df.latitude)]
    return gpd.GeoDataFrame(df, geometry='geometry', crs="EPSG:4326")

def get_All_Img_Folder(folder_path, filename_df, imagePath):
    """
    folder_path:      源文件夹，里面有你要拷贝的 .jpg
    filename_df:      包含 FILENAME 列的 DataFrame
    imagePath:        目标保存路径，会自动创建
    """
    # 1. 校验源文件夹
    if not os.path.isdir(folder_path):
        raise FileNotFoundError(f"The folder at {folder_path} does not exist or is not a directory.")
    
    # 2. 确保目标文件夹存在
    os.makedirs(imagePath, exist_ok=True)
    
    # 3. 按 FILENAME 列里的名字去拷贝
    for img_name in filename_df['FILENAME']:
        src = os.path.join(folder_path, img_name)
        dst = os.path.join(imagePath, img_name)
        
        if os.path.isfile(src):
            shutil.copy2(src, dst)
        else:
            # 跟 Zip 版里类似，记录一下未找到的文件
            print(f"Image {img_name} not found in folder {folder_path}.")
    
    # 4. 返回原 DataFrame 以便后续流程
    return filename_df

@bp.get("/folders")
def list_input_folders():
    """
    列出输入根目录下可用的子目录（folder-only）
    GET /api/projects/folders
    响应: { items: [ "FolderA", "FolderB", ... ] }
    """
    ctx = get_ctx()                 # ← 用你已有的 get_ctx()
    pm = ctx["pm"]
    in_path: Path = pm.in_path

    if not in_path.exists():
        return ok({"items": []})

    items = [f for f in os.listdir(in_path) if (in_path / f).is_dir()]
    items.sort()
    return ok({"items": items})

@bp.post("/folders")
def create_project_from_folder():
    """
    根据输入目录（folder）创建新项目：
    Body: { "project_name": "My Project", "folder_name": "SomeFolder" }
    """
    data = request.get_json(silent=True) or {}
    project_name = (data.get("project_name") or "").strip()
    folder_name = data.get("folder_name")

    if not project_name:
        return fail("project_name is required", 400)
    if "_" in project_name:
        return fail("Project name cannot contain underscores (_)", 400)
    if not folder_name:
        return fail("folder_name is required", 400)

    ctx = get_ctx()                 # ← 用你已有的 get_ctx()
    pm = ctx["pm"]
    in_path: Path = pm.in_path
    out_path: Path = pm.des_path

    src_dir: Path = in_path / folder_name
    if not src_dir.exists() or not src_dir.is_dir():
        return fail("folder not found", 404)

    project_path = out_path / project_name
    if project_path.exists():
        return fail("Project already exists", 409)

    # 1) EXIF 提取坐标
    df = get_image_folder_geo(str(src_dir))
    df = df.rename(columns={"latitude": "LATITUDE", "longitude": "LONGITUDE", "filename": "FILENAME"})

    # 2) 地理编码 + 采样
    df = cycleRAP_VA.geoCode(df)
    df = cycleRAP_VA.get_geo_points_by_distance(df, min_distance=10)
    if "geometry" not in df.columns:
        return fail("Missing 'geometry' after geocoding", 500)

    gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")

    # 3) 转 LineString
    extracted_geo_data = cycleRAP_VA.convert_points_to_linestrings(gdf)
    
    # 4) 初始化项目目录结构（本地创建即可）
    project_path.mkdir(parents=True, exist_ok=True)

    # 5) 拷贝/链接图片到项目 images/ 目录
    images_dir = project_path / global_var.PROJECT_IMAGES_FOLDER
    images_dir.mkdir(parents=True, exist_ok=True)
    extracted_geo_data = get_All_Img_Folder(src_dir, extracted_geo_data, images_dir)

    # 6) 注册项目
    pm.create_project(project_name, extracted_geo_data, folder_name)

    return ok({"ok": True, "name": project_name})

@bp.delete("/<project_name>")
def delete_project(project_name: str):
    """
    删除整个项目（内存列表 + 磁盘目录）：
    DELETE /api/projects/<project_name>
    """
    ctx = get_ctx()
    pm = ctx["pm"]

    try:
        pm.delete_project(project_name)  # 会调用 Project._delete() 删除目录，并从列表移除
        return ok({"ok": True, "name": project_name})
    except KeyError:
        return fail("Project not found", 404)
    except Exception as e:
        traceback.print_exc()
        return fail(f"Delete failed: {e}", 500)
    

def _get_ctx_gis():
    """在进程上下文里懒加载 GIS（避免每次请求都重新读 shp）。"""
    ctx = get_ctx()
    if "gis" not in ctx:
        # 你的 gis_mapping 里通常有 LayerStore + GIS，默认读取 shp 目录
        store = gis.LayerStore.default(base_dir="shp")
        ctx["gis"] = gis.GIS(store)
    return ctx["gis"]

def _resolve_image_path(pm, project_name: str, attrs_row: pd.Series, index: int, gdf: pd.DataFrame | gpd.GeoDataFrame) -> Path:
    """
    根据 GeoData/Attributes 解析 images 下的图片路径，并打印调试信息。
    """
    images_dir: Path = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER).resolve()
    if not images_dir.exists():
        print(f"[autocode] images_dir NOT FOUND: {images_dir}")
        raise FileNotFoundError(f"Images folder not found: {images_dir}")

    tried = []  # 记录尝试过的相对文件名/通配
    candidates = {}

    def _pick(d: dict) -> str | None:
        for k in ["FILENAME", "filename", "Image", "image", "img", "image_file", "image_path", "Frame"]:
            v = d.get(k)
            if isinstance(v, str) and v.strip():
                return Path(v).name
        return None

    # ① GeoData 当前行
    fname_gdf = None
    try:
        geo_row = gdf.iloc[index].to_dict()
        fname_gdf = _pick(geo_row)
    except Exception as e:
        print(f"[autocode] read gdf row error idx={index}: {e}")

    # ② Attributes 当前行
    fname_attr = None
    try:
        fname_attr = _pick(attrs_row.to_dict())
    except Exception as e:
        print(f"[autocode] read attrs row error idx={index}: {e}")

    # 记录候选名
    candidates["from_gdf"] = fname_gdf
    candidates["from_attrs"] = fname_attr
    print(f"[autocode] idx={index} candidates={candidates} images_dir={images_dir}")

    # 优先 gdf，然后 attrs
    for fname in [fname_gdf, fname_attr]:
        if not fname:
            continue
        direct = (images_dir / fname).resolve()
        tried.append(str(direct))
        if direct.exists():
            print(f"[autocode] HIT (direct): {direct}")
            return direct

        # 模糊：同名不同扩展名 / 不区分大小写
        stem = Path(fname).stem
        globs = [f"*{fname}", f"{stem}.*"]
        for pat in globs:
            tried.append(f"[glob]{pat}")
            hits = list(images_dir.glob(pat))
            if hits:
                print(f"[autocode] HIT (glob {pat}): {hits[0]}")
                return hits[0]

    # ③ 序号兜底
    for base in (f"{index+1:04d}", f"{index:04d}"):
        for ext in (".jpg", ".jpeg", ".png"):
            cand = (images_dir / (base + ext)).resolve()
            tried.append(str(cand))
            if cand.exists():
                print(f"[autocode] HIT (index-pattern): {cand}")
                return cand

    # ④ 打印目录样本，帮助排查
    try:
        files = sorted([p.name for p in images_dir.iterdir() if p.is_file()])
        sample = files[:30]
        print(f"[autocode] images_dir file count={len(files)}, sample={sample}")
    except Exception as e:
        print(f"[autocode] listdir error: {e}")
        sample = []

    # 失败
    msg = (
        f"Image for row {index} not found under {images_dir}\n"
        f"candidates={candidates}\n"
        f"tried={tried[:30]}\n"
        f"dir_sample={sample}"
    )
    raise FileNotFoundError(msg)


def _row_start_point(geom) -> Point:
    """
    从 GeoData 的 LineString 取起点（你之前也要求“只用最开始的点”）
    """
    if geom is None:
        raise ValueError("Missing geometry")
    if isinstance(geom, LineString):
        x, y = list(geom.coords)[0]
        return Point(x, y)
    # 若是点，就直接返回
    if isinstance(geom, Point):
        return geom
    raise TypeError(f"Unsupported geometry type: {type(geom)}")

def _apply_gis_rules(gis_inst, start_pt: Point, updates: dict):
    """
    把 GIS 规则应用到属性字典里（这里保持轻量——不改你的 gis_mapping 逻辑，只调用它）。
    你可以按旧逻辑增删。以下示例仅展示典型字段。
    """
    # 注意：gis_mapping 内部一般使用 EPSG:3414 的米制坐标。
    # 如果 start_pt 是 WGS84，请转换；如果你的 GeoData 已经是 4326，需要转到 3414：
    try:
        mpt = gis.to_metric_point(start_pt)
    except Exception:
        mpt = start_pt  # 如果你的项目几何已经在 3414，这行就不会出错

    # Area type
    try:
        area = gis_inst.get_area_type(mpt)
        if area is not None:
            updates["Area type"] = area
    except Exception:
        pass

    # Bus stop / bus lane / parking / MRT 等
    try:
        if gis_inst.is_bus_stop(mpt):
            updates["Peak pedestrian flow along or across facility"] = 2
    except Exception:
        pass

    try:
        if gis_inst.is_bus_lane(mpt):
            updates["Heavy vehicle flow"] = 2
    except Exception:
        pass

    try:
        if gis_inst.is_parking(mpt):
            updates["Adjacent Vehicle Parking 0-1m"] = 1
    except Exception:
        pass

    try:
        if gis_inst.is_mrt(mpt):
            updates["Peak pedestrian flow along or across facility"] = 3
    except Exception:
        pass

@bp.post("/<project_name>/autocode")
def autocode_row(project_name: str):
    """
    Auto-code 单张（当前页）：
    POST /api/projects/<project_name>/autocode
    body: { "index": number, "save": boolean }
    返回：{ ok, index, updates, newRow }
    """
    payload = request.get_json(silent=True) or {}
    if "index" not in payload:
        return fail("Missing 'index'", 400)
    idx = int(payload["index"])
    save = bool(payload.get("save", True))

    ctx = get_ctx()
    pm = ctx["pm"]
    proj = pm.project(project_name)
    ver = proj.latest()

    # 取当前行 attributes + geodata
    attrs_df: pd.DataFrame = ver.attributes.df
    if idx < 0 or idx >= len(attrs_df):
        return fail("index out of range", 400)
    row = attrs_df.iloc[idx]

    gdf = proj.geo_data.df
    if idx >= len(gdf):
        return fail("geodata index out of range", 400)

    geom = gdf.geometry.iloc[idx] if hasattr(gdf, "geometry") else gdf.iloc[idx]["geometry"]
    start_pt = _row_start_point(geom)

    # 找图片路径
    try:
        img_path = _resolve_image_path(pm, project_name, row, idx, gdf)
    except Exception as e:
        return fail(f"Resolve image failed: {e}", 400)

    # 1) CV 模型自动编码（不改 prediction.py 的接口）
    try:
        cv_updates: dict = cv_pred.CycleRAP_Coding_Helper.autocode(str(img_path))
    except Exception as e:
        return fail(f"CV autocode failed: {e}", 500)

    updates = dict(cv_updates or {})

    # 2) GIS 覆写/补充
    try:
        gis_inst = _get_ctx_gis()
        _apply_gis_rules(gis_inst, start_pt, updates)
    except Exception:
        # GIS 失败不致命
        pass

    # 3) 合并到当前行
    new_row = row.copy()
    for k, v in updates.items():
        if k in new_row.index:
            new_row[k] = v
        else:
            # 若新字段在表里不存在，你可以选择忽略或新增
            pass

    # 4) 落盘（可选）
    if save:
        ver.attributes.df.iloc[idx] = new_row
        ver.attributes.df_dirty = True
        proj.save_all()

    return ok({
        "ok": True,
        "index": idx,
        "updates": updates,
        "newRow": new_row.to_dict(),
    })

@bp.post("/<project_name>/autocode/all")
def autocode_all(project_name: str):
    """
    Auto-code 全部（批量）：
    POST /api/projects/<project_name>/autocode/all
    body: { "save": boolean }
    返回每行的更新统计
    """
    payload = request.get_json(silent=True) or {}
    save = bool(payload.get("save", True))

    ctx = get_ctx()
    pm = ctx["pm"]
    proj = pm.project(project_name)
    ver = proj.latest()

    attrs_df: pd.DataFrame = ver.attributes.df
    gdf = proj.geo_data.df

    updates_list = []
    gis_inst = _get_ctx_gis()

    for idx in range(min(len(attrs_df), len(gdf))):
        row = attrs_df.iloc[idx]
        geom = gdf.geometry.iloc[idx] if hasattr(gdf, "geometry") else gdf.iloc[idx]["geometry"]
        try:
            start_pt = _row_start_point(geom)
            img_path = _resolve_image_path(pm, project_name, row, idx, gdf)
            cv_updates: dict = cv_pred.CycleRAP_Coding_Helper.autocode(str(img_path))
            updates = dict(cv_updates or {})
            _apply_gis_rules(gis_inst, start_pt, updates)

            # merge
            new_row = row.copy()
            for k, v in updates.items():
                if k in new_row.index:
                    new_row[k] = v
            updates_list.append({"index": idx, "ok": True, "updates": updates})
            if save:
                ver.attributes.df.iloc[idx] = new_row
        except Exception as e:
            updates_list.append({"index": idx, "ok": False, "error": str(e)})

    if save:
        ver.attributes.df_dirty = True
        proj.save_all()

    return ok({"ok": True, "items": updates_list})
