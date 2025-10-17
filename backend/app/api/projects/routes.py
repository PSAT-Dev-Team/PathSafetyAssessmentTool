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



# —— Reuse your existing service layer —— #
from app.services.project_manager import project_manager, Project   # If the path is different, change to your real package path
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

# Process-level context (replaces Streamlit's session_state)
_CTX = {"ready": False, "pm": None}



def get_ctx():
    """Lazy init: prepare the old-code dependencies the first time and reuse thereafter."""
    if _CTX["ready"]:
        return _CTX

    # === Previously done manually in Streamlit; equivalent init moved to backend ===
    pm = project_manager()                               # Load config and scan project list
    # serializer's BaseTable/parse/serialize do not need extra init; if you have data_loader, try/except
    try:
        serializer.data_loader.initialise()
    except Exception:
        pass

    # CycleRAP resource directory (same as your former src_path/CycleRAP)
    CRI.cycleRAP_interface.initialise(pm.src_path / "CycleRAP")

    _CTX.update({"pm": pm, "ready": True})
    return _CTX

# ───────────────────────── Endpoints ─────────────────────────

@bp.get("")
def list_projects():
    """List project names (equivalent to your original list_names)."""
    ctx = get_ctx()
    names = ctx["pm"].list_names()
    return jsonify({"projects": names})

@bp.get("/<project_name>")
def get_project(project_name: str):
    """Read project metadata and available versions (read-only)."""
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
    """Return the latest attributes.csv (converted to JSON for front-end table rendering)."""
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    df = proj.latest().attributes.df
    return jsonify({"rows": df.to_dict(orient="records")})

@bp.get("/<project_name>/geodata")
def get_geodata(project_name: str):
    """Return the project's GeoData (GeoJSON FeatureCollection)."""
    import json
    ctx = get_ctx()  # Reuse the existing init context
    proj = ctx["pm"].project(project_name)
    gdf = proj.geo_data.df  # GeoPandas GeoDataFrame

    # GeoDataFrame -> GeoJSON string, then to dict for jsonify-friendly output
    geojson_obj = json.loads(gdf.to_json())
    return jsonify(geojson_obj)

@bp.get("/<project_name>/images/<path:filename>")
def get_project_image(project_name: str, filename: str):
    """
    Return an image file under the project's images directory:
    GET /api/projects/<project_name>/images/<filename>
    """
    ctx = get_ctx()
    pm = ctx["pm"]

    # Compute {data}/{project}/images directory
    images_dir: Path = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER).resolve()

    # Directory existence check
    if not images_dir.exists() or not images_dir.is_dir():
        abort(404, description="Images folder not found")

    # Use safe_join to prevent directory traversal
    safe_path = safe_join(str(images_dir), filename)
    if safe_path is None:
        abort(400, description="Invalid image path")

    file_path = Path(safe_path).resolve()
    # Double-check: must be under images_dir
    if not str(file_path).startswith(str(images_dir)):
        abort(400, description="Invalid image path")

    if not file_path.exists() or not file_path.is_file():
        abort(404, description="Image not found")

    # Return via send_from_directory with conditional caching
    resp = send_from_directory(images_dir, file_path.name, conditional=True)
    # Optional: add Cache-Control (adjust as needed for your deployment)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp

@bp.get("/attribute-mappings")
def get_attribute_mappings():
    """
    Return field mappings for Attributes (numeric -> text), e.g.:
    {
      "Area type": {"1":"Inner Urban","2":"Outer Urban","3":"Rural","4":"Industrial"},
      "Facility Type": {"1":"Sidewalk", "2":"Multi-Use Path", ...},
      ...
    }
    Only fields with enumerations are included; continuous values (e.g., AADT, speed) are excluded.
    """
    mappings = {}
    for field, mapping in (serializer.Attributes.CHOICES or {}).items():
        if not mapping:  # None: indicates the field is not an enumeration
            continue
        # Reverse mapping: number -> label; use str keys for front-end convenience
        reverse = {str(code): label for (label, code) in mapping.items()}
        mappings[field] = reverse
    return jsonify(mappings)

@bp.post("/<project_name>/score")
def calculate_score(project_name: str):
    """
    Use Excel macro to calculate scores:
    1) Take the project's latest attributes DataFrame
    2) Call cycleRAP_interface.calculate_cycleRAP_score
    3) Write back results.csv and save
    """
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    ver = proj.latest()

    attrs = ver.attributes.df
    # If the front end POSTs temporarily modified attributes, merge/override them:
    payload = request.get_json(silent=True) or {}
    if "attributes" in payload:
        attrs = serializer.Attributes(values=None)
        attrs.df = serializer.pd.DataFrame(payload["attributes"])  # Keep column names consistent

    # Calculate scores (depends on Windows + Excel macro environment)
    results_df = CRI.cycleRAP_interface.calculate_cycleRAP_score(attrs)

    # Write back and persist
    ver._results = serializer.Results()
    ver.results.df = results_df
    proj.save_all()

    return jsonify({"ok": True, "result_rows": results_df.to_dict(orient="records")})

@bp.post("/<project_name>/treatments")
def evaluate_treatments(project_name: str):
    """
    Use the Excel STM macro to generate treatment suggestions:
    - Requires GeoData + Attributes
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

    # Write to the latest version
    ver = proj.latest()
    ver.attributes.df = pd.DataFrame(rows)
    ver.attributes.df_dirty = True
    proj.save_all()  # If a day rolls over, a new version may be created
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

        # Required GPS tags
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
    # geometry column
    df['geometry'] = [Point(xy) for xy in zip(df.longitude, df.latitude)]
    return gpd.GeoDataFrame(df, geometry='geometry', crs="EPSG:4326")

def get_All_Img_Folder(folder_path, filename_df, imagePath):
    """
    folder_path:      Source folder containing the .jpg files to copy
    filename_df:      DataFrame containing a FILENAME column
    imagePath:        Destination path to save; will be created if not present
    """
    # 1. Validate source folder
    if not os.path.isdir(folder_path):
        raise FileNotFoundError(f"The folder at {folder_path} does not exist or is not a directory.")
    
    # 2. Ensure destination folder exists
    os.makedirs(imagePath, exist_ok=True)
    
    # 3. Copy by names in the FILENAME column
    for img_name in filename_df['FILENAME']:
        src = os.path.join(folder_path, img_name)
        dst = os.path.join(imagePath, img_name)
        
        if os.path.isfile(src):
            shutil.copy2(src, dst)
        else:
            # Similar to the Zip version: record missing files
            print(f"Image {img_name} not found in folder {folder_path}.")
    
    # 4. Return the original DataFrame for downstream use
    return filename_df

@bp.get("/folders")
def list_input_folders():
    """
    List available subfolders under the input root (folders only)
    GET /api/projects/folders
    Response: { items: [ "FolderA", "FolderB", ... ] }
    """
    ctx = get_ctx()                 # ← Use your existing get_ctx()
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
    Create a new project based on an input directory (folder):
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

    ctx = get_ctx()                 # ← Use your existing get_ctx()
    pm = ctx["pm"]
    in_path: Path = pm.in_path
    out_path: Path = pm.des_path

    src_dir: Path = in_path / folder_name
    if not src_dir.exists() or not src_dir.is_dir():
        return fail("folder not found", 404)

    project_path = out_path / project_name
    if project_path.exists():
        return fail("Project already exists", 409)

    # 1) Extract EXIF coordinates
    df = get_image_folder_geo(str(src_dir))
    df = df.rename(columns={"latitude": "LATITUDE", "longitude": "LONGITUDE", "filename": "FILENAME"})

    # 2) Geocoding + sampling
    df = cycleRAP_VA.geoCode(df)
    df = cycleRAP_VA.get_geo_points_by_distance(df, min_distance=10)
    if "geometry" not in df.columns:
        return fail("Missing 'geometry' after geocoding", 500)

    gdf = gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")

    # 3) Convert to LineString
    extracted_geo_data = cycleRAP_VA.convert_points_to_linestrings(gdf)
    
    # 4) Initialize project directory structure (create locally)
    project_path.mkdir(parents=True, exist_ok=True)

    # 5) Copy/link images into the project's images/ directory
    images_dir = project_path / global_var.PROJECT_IMAGES_FOLDER
    images_dir.mkdir(parents=True, exist_ok=True)
    extracted_geo_data = get_All_Img_Folder(src_dir, extracted_geo_data, images_dir)

    # 6) Register project
    pm.create_project(project_name, extracted_geo_data, folder_name)

    return ok({"ok": True, "name": project_name})

@bp.delete("/<project_name>")
def delete_project(project_name: str):
    """
    Delete an entire project (in-memory list + on-disk directory):
    DELETE /api/projects/<project_name>
    """
    ctx = get_ctx()
    pm = ctx["pm"]

    try:
        pm.delete_project(project_name)  # Calls Project._delete() to remove the directory and drop from the list
        return ok({"ok": True, "name": project_name})
    except KeyError:
        return fail("Project not found", 404)
    except Exception as e:
        traceback.print_exc()
        return fail(f"Delete failed: {e}", 500)
    

def _get_ctx_gis():
    """Lazily load GIS into the process context (avoid re-reading SHP each request)."""
    ctx = get_ctx()
    if "gis" not in ctx:
        # In your gis_mapping you typically have LayerStore + GIS; default to read SHP directory
        store = gis.LayerStore.default(base_dir="shp")
        ctx["gis"] = gis.GIS(store)
    return ctx["gis"]

def _resolve_image_path(pm, project_name: str, attrs_row: pd.Series, index: int, gdf: pd.DataFrame | gpd.GeoDataFrame) -> Path:
    """
    Resolve image path under images/ based on GeoData/Attributes and print debug info.
    """
    images_dir: Path = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER).resolve()
    if not images_dir.exists():
        print(f"[autocode] images_dir NOT FOUND: {images_dir}")
        raise FileNotFoundError(f"Images folder not found: {images_dir}")

    tried = []  # record attempted relative filenames/patterns
    candidates = {}

    def _pick(d: dict) -> str | None:
        for k in ["FILENAME", "filename", "Image", "image", "img", "image_file", "image_path", "Frame"]:
            v = d.get(k)
            if isinstance(v, str) and v.strip():
                return Path(v).name
        return None

    # ① Current row from GeoData
    fname_gdf = None
    try:
        geo_row = gdf.iloc[index].to_dict()
        fname_gdf = _pick(geo_row)
    except Exception as e:
        print(f"[autocode] read gdf row error idx={index}: {e}")

    # ② Current row from Attributes
    fname_attr = None
    try:
        fname_attr = _pick(attrs_row.to_dict())
    except Exception as e:
        print(f"[autocode] read attrs row error idx={index}: {e}")

    # Record candidates
    candidates["from_gdf"] = fname_gdf
    candidates["from_attrs"] = fname_attr
    print(f"[autocode] idx={index} candidates={candidates} images_dir={images_dir}")

    # Prefer gdf, then attrs
    for fname in [fname_gdf, fname_attr]:
        if not fname:
            continue
        direct = (images_dir / fname).resolve()
        tried.append(str(direct))
        if direct.exists():
            print(f"[autocode] HIT (direct): {direct}")
            return direct

        # Fuzzy: same name different extension / case-insensitive
        stem = Path(fname).stem
        globs = [f"*{fname}", f"{stem}.*"]
        for pat in globs:
            tried.append(f"[glob]{pat}")
            hits = list(images_dir.glob(pat))
            if hits:
                print(f"[autocode] HIT (glob {pat}): {hits[0]}")
                return hits[0]

    # ③ Index-based fallback
    for base in (f"{index+1:04d}", f"{index:04d}"):
        for ext in (".jpg", ".jpeg", ".png"):
            cand = (images_dir / (base + ext)).resolve()
            tried.append(str(cand))
            if cand.exists():
                print(f"[autocode] HIT (index-pattern): {cand}")
                return cand

    # ④ Print a directory sample to help debugging
    try:
        files = sorted([p.name for p in images_dir.iterdir() if p.is_file()])
        sample = files[:30]
        print(f"[autocode] images_dir file count={len(files)}, sample={sample}")
    except Exception as e:
        print(f"[autocode] listdir error: {e}")
        sample = []

    # Failure
    msg = (
        f"Image for row {index} not found under {images_dir}\n"
        f"candidates={candidates}\n"
        f"tried={tried[:30]}\n"
        f"dir_sample={sample}"
    )
    raise FileNotFoundError(msg)


def _row_start_point(geom) -> Point:
    """
    Get the start point from a LineString in GeoData (you previously required “use only the first point”).
    """
    if geom is None:
        raise ValueError("Missing geometry")
    if isinstance(geom, LineString):
        x, y = list(geom.coords)[0]
        return Point(x, y)
    # If it's already a Point, return it
    if isinstance(geom, Point):
        return geom
    raise TypeError(f"Unsupported geometry type: {type(geom)}")

def _apply_gis_rules(gis_inst, start_pt: Point, updates: dict):
    """
    Apply GIS rules to the attribute dict (keep it lightweight—don’t change your gis_mapping logic, just call it).
    You can add/remove according to your old logic. The following shows typical fields.
    """
    # Note: gis_mapping typically uses EPSG:3414 metric coordinates.
    # If start_pt is WGS84, convert it; if your GeoData is in 4326, convert to 3414:
    try:
        mpt = gis.to_metric_point(start_pt)
    except Exception:
        mpt = start_pt  # If your project geometry is already 3414, this won’t error

    # Area type
    try:
        area = gis_inst.get_area_type(mpt)
        if area is not None:
            updates["Area type"] = area
    except Exception:
        pass

    # Bus stop / bus lane / parking / MRT etc.
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
    Auto-code a single row (current page):
    POST /api/projects/<project_name>/autocode
    body: { "index": number, "save": boolean }
    returns: { ok, index, updates, newRow }
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

    # Fetch current row from attributes + geodata
    attrs_df: pd.DataFrame = ver.attributes.df
    if idx < 0 or idx >= len(attrs_df):
        return fail("index out of range", 400)
    row = attrs_df.iloc[idx]

    gdf = proj.geo_data.df
    if idx >= len(gdf):
        return fail("geodata index out of range", 400)

    geom = gdf.geometry.iloc[idx] if hasattr(gdf, "geometry") else gdf.iloc[idx]["geometry"]
    start_pt = _row_start_point(geom)

    # Resolve image path
    try:
        img_path = _resolve_image_path(pm, project_name, row, idx, gdf)
    except Exception as e:
        return fail(f"Resolve image failed: {e}", 400)

    # 1) CV model auto-code (do not change prediction.py interface)
    try:
        cv_updates: dict = cv_pred.CycleRAP_Coding_Helper.autocode(str(img_path))
    except Exception as e:
        return fail(f"CV autocode failed: {e}", 500)

    updates = dict(cv_updates or {})

    # 2) GIS overrides/supplements
    try:
        gis_inst = _get_ctx_gis()
        _apply_gis_rules(gis_inst, start_pt, updates)
    except Exception:
        # GIS failure is non-fatal
        pass

    # 3) Merge into the current row
    new_row = row.copy()
    for k, v in updates.items():
        if k in new_row.index:
            new_row[k] = v
        else:
            # If the new field does not exist in the table, choose to ignore or add
            pass

    # 4) Persist (optional)
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
    Auto-code all rows (batch):
    POST /api/projects/<project_name>/autocode/all
    body: { "save": boolean }
    Returns update stats for each row
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
