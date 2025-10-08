# app/api/projects/routes.py
from flask import Blueprint, jsonify, request
from pathlib import Path
import traceback
from . import bp

# —— 复用你现有的服务层 —— #
from app.services.project_manager import project_manager, Project   # 若路径不同，按你的真实包路径改
import app.services.serializer as serializer
import app.services.cycleRAP_interface as CRI

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
