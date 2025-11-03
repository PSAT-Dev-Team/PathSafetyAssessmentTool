# app/api/projects/routes.py
from flask import (
    Blueprint,
    jsonify,
    request,
    send_from_directory,
    abort,
    make_response,
    current_app,     # ✅ 一次性在顶层导入
)
from pathlib import Path
import traceback
from . import bp
from werkzeug.utils import safe_join
import app.services.global_var as global_var
import pandas as pd
import os
import exifread
from shapely.geometry import Point,LineString 
import geopandas as gpd
import shutil
# ---- init guards (thread-safe & error memo) ----
import threading
from werkzeug.exceptions import ServiceUnavailable

_INIT_LOCK = threading.Lock()
_INIT_ERR = {"cv": None, "gis": None}
_MODELS_READY = {"cv": False, "gis": False}






# —— Reuse your existing service layer —— #
from app.services.project_manager import project_manager, Project   # If the path is different, change to your real package path
import app.services.serializer as serializer
import app.services.cycleRAP_interface as CRI
import app.services.cycleRAP_VA as cycleRAP_VA

from pathlib import Path
from app.services import prediction as cv_pred
from app.services import gis_mapping as gis
import app.services.global_var as global_var


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

_MODELS_READY = {"cv": False, "gis": False}

def _ensure_models_ready():
    """Load CV / GIS only once (thread-safe). Memoize init errors as 503."""
    with _INIT_LOCK:
        # If CV init failed before, short-circuit with 503
        if _INIT_ERR["cv"]:
            raise ServiceUnavailable(_INIT_ERR["cv"])

        if not _MODELS_READY["cv"]:
            try:
                ctx = get_ctx()
                pm = ctx["pm"]

                # Model dir resolution:
                # 1) env: MODEL_DIR
                # 2) common dirs near repo/backend/src
                from os import getenv
                from pathlib import Path as _P

                candidates = []
                env_dir = getenv("MODEL_DIR")
                if env_dir:
                    candidates.append(_P(env_dir))

                repo_root = _P(__file__).resolve().parents[3]  # .../backend
                candidates += [
                    repo_root / "model",
                    repo_root / "models",
                    pm.src_path.parent / "model",
                    pm.src_path.parent / "models",
                ]

                model_dir = None
                for d in candidates:
                    if (d / "path_seg.pt").exists():
                        model_dir = d.resolve()
                        break

                if model_dir is None:
                    tried = "\n".join(str(p) for p in candidates)
                    raise RuntimeError(f"Cannot find model_dir (missing path_seg.pt). Tried:\n{tried}")

                # YOLO models load
                cv_pred.CycleRAP_Coding_Helper.initialise(model_dir)
                _MODELS_READY["cv"] = True

            except Exception as e:
                _INIT_ERR["cv"] = f"CV init failed: {e}"
                # Next calls will short-circuit quickly
                raise ServiceUnavailable(_INIT_ERR["cv"])

        # GIS 部分一般是惰性读取（LayerStore.default 内部），这里只做标记
        if not _MODELS_READY["gis"]:
            _MODELS_READY["gis"] = True




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
    
@bp.post("/<project_name>/autocode/image")
def autocode_image(project_name: str):
    try:
        _ensure_models_ready()

        ctx = get_ctx()
        pm = ctx["pm"]
        payload = request.get_json(force=True, silent=True) or {}
        image_ref = payload.get("imageRef")
        if not image_ref:
            return fail("imageRef is required", 400)

        img_path = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER / image_ref).resolve()
        if not img_path.exists():
            return fail(f"image not found: {img_path.name}", 404)

        updates = cv_pred.CycleRAP_Coding_Helper.autocode(img_path)  # returns dict
        updates = {k: v for k, v in (updates or {}).items() if v is not None}

        # Return both updates and changed_fields for change tracking/highlighting in UI
        # changed_fields: list of field names that were updated by CV model
        return ok({"updates": updates, "changed_fields": list(updates.keys())})

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"autocode_image error: {e}", 500)


@bp.post("/<project_name>/autocode/gis")
def autocode_gis(project_name: str):
    try:
        _ensure_models_ready()

        payload = request.get_json(force=True, silent=True) or {}
        coords = payload.get("coords")  # [[lon, lat], ...]
        if not coords or not isinstance(coords, list) or not isinstance(coords[0], list):
            return fail("coords (LineString) is required", 400)

        # 起点（WGS84）
        start_lon, start_lat = coords[0]
        from shapely.geometry import Point
        pt = Point(start_lon, start_lat)

        # backend/shapefiles 作为基准目录
        backend_root = Path(__file__).resolve().parents[3]  # .../backend
        shp_dir = (backend_root / "shapefiles").resolve()
        if not shp_dir.exists():
            return fail(f"Shapefile base dir not found: {shp_dir}", 500)

        layer_store = gis.LayerStore.default(base_dir=str(shp_dir))
        _gis = gis.GIS(layer_store)

        updates: dict[str, int | float] = {}

        # Rules
        if _gis.is_mrt(pt):
            updates["Peak pedestrian flow along or across facility"] = 3
        if _gis.is_bus_lane(pt):
            updates["Heavy vehicle flow"] = 2
        if _gis.is_parking(pt):
            updates["Adjacent Vehicle Parking 0-1m"] = 1
        if _gis.is_bus_stop(pt):
            # overrides 3 → 2
            updates["Peak pedestrian flow along or across facility"] = 2

        area = _gis.get_area_type(pt)
        updates["Area type"] = int(area)

        updates["Road AADT"] = 5000

        res = _gis.get_peak_pedestrian_flow(pt, dist=10)
        bpks = (res or {}).get("before_peaks")
        spks = (res or {}).get("sensor_peaks")

        def apply_peak(peaks):
            if not peaks:
                return
            if int(peaks.get("MICROMOBILITY", 0)) > 50:
                updates["Peak bicycle/LV traffic flow"] = 2
            if int(peaks.get("OTHER", 0)) > 50:
                updates["Peak pedestrian flow along or across facility"] = 3

        if spks:
            apply_peak(spks)
        elif bpks:
            apply_peak(bpks)

        # Return both updates and changed_fields for change tracking/highlighting in UI
        # changed_fields: list of field names that were updated by GIS rules
        return ok({"updates": updates, "changed_fields": list(updates.keys())})

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"autocode_gis error: {e}", 500)



@bp.post("/<project_name>/autocode/all")
def autocode_all(project_name: str):
    """
    Modes:
      A) Single (backward-compatible):
         Body: { imageRef: "...", coords: [[lon,lat],...], index?: int }
      B) Bulk - all rows:
         Body: { all: true }  (optionally { save: true } to persist)
      C) Bulk - selected indices:
         Body: { indices: [0,2,5], save?: true }

    Returns:
      - For single: { updates: {...}, saved: bool }
      - For bulk: {
          saved: bool,
          total: N,
          ok: K,
          fail: M,
          errors: [{ index, reason }],
        }
    """
    try:
        payload = request.get_json(force=True, silent=True) or {}

        # ---------- detect mode ----------
        run_all: bool = bool(payload.get("all"))
        indices = payload.get("indices")
        has_single_fields = ("imageRef" in payload) or ("coords" in payload) or ("index" in payload)

        # Always ensure models/layers first
        _ensure_models_ready()

        ctx = get_ctx()
        pm = ctx["pm"]
        proj = pm.project(project_name)
        ver = proj.latest()

        # ---------- helpers to resolve per-row data ----------
        import math
        from shapely.geometry import LineString as _LS

        def _resolve_image_ref(idx: int) -> str | None:
            """
            Resolve the image filename for a given row index.

            This function looks for image references in the correct location:
            1. Primary source: geo_data.df (where project_manager stores image refs during creation)
            2. Fallback: attributes.df (in case user manually added it there)

            It also verifies that the referenced image file actually exists on disk.

            Args:
                idx: Row index in the attributes/geo_data tables

            Returns:
                str: Image filename if found and exists, None otherwise
            """
            # Primary source: geo_data (where image references are stored during project creation)
            # See project_manager.py:453 where image_ref is stored in geo_tbl
            if 0 <= idx < len(proj.geo_data.df):
                geo_row = proj.geo_data.df.iloc[idx]
                # Try multiple possible column names for compatibility
                for key in ("Image Reference", "Image_Reference", "image", "img", "FILENAME"):
                    if key in geo_row and pd.notna(geo_row[key]) and str(geo_row[key]).strip():
                        img_ref = str(geo_row[key]).strip()
                        # Verify file exists before returning
                        img_path = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER / img_ref).resolve()
                        if img_path.exists():
                            return img_ref

            # Fallback: attributes table (in case it was copied there)
            if 0 <= idx < len(ver.attributes.df):
                attr_row = ver.attributes.df.iloc[idx]
                for key in ("Image Reference", "Image_Reference", "image", "img", "FILENAME"):
                    if key in attr_row and pd.notna(attr_row[key]) and str(attr_row[key]).strip():
                        img_ref = str(attr_row[key]).strip()
                        # Verify file exists before returning
                        img_path = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER / img_ref).resolve()
                        if img_path.exists():
                            return img_ref
            return None

        def _resolve_coords(idx: int):
            if 0 <= idx < len(proj.geo_data.df):
                geom = proj.geo_data.df.geometry.iloc[idx]
                if geom is not None and isinstance(geom, _LS) and not geom.is_empty:
                    # shapely coords -> [[lon,lat], ...]
                    return [list(c) for c in list(geom.coords)]
            return None

        def _call_autocode_pair(image_ref: str, coords):
            """
            Call both CV and GIS autocoding for a single image and merge results.

            This function orchestrates the complete auto-coding process:
            1. Calls autocode_image (CV model) to analyze the photo
            2. Calls autocode_gis (GIS rules) to analyze the location
            3. Merges updates (GIS overrides CV if both set the same field)
            4. Tracks the source (CV or GIS) for each updated field

            Args:
                image_ref: Image filename (e.g., "ProjectName_IMG_001.jpg")
                coords: LineString coordinates as [[lon, lat], ...] for GIS analysis

            Returns:
                tuple: (merged_updates, sources, error)
                    - merged_updates: dict of {field_name: code_value}
                    - sources: dict of {field_name: "CV" or "GIS"}
                    - error: None if success, error message string if failed
            """
            # Call CV auto-coding endpoint
            with current_app.test_request_context(method="POST", json={"imageRef": image_ref}):
                img_resp, img_code = autocode_image(project_name)
            if img_code >= 400:
                return None, None, img_resp.get_json().get("error", f"/image {img_code}")

            # Call GIS auto-coding endpoint
            with current_app.test_request_context(method="POST", json={"coords": coords}):
                gis_resp, gis_code = autocode_gis(project_name)
            if gis_code >= 400:
                return None, None, gis_resp.get_json().get("error", f"/gis {gis_code}")

            img_data = img_resp.get_json() or {}
            gis_data = gis_resp.get_json() or {}

            img_updates = img_data.get("updates", {})
            gis_updates = gis_data.get("updates", {})

            # Merge updates: GIS overrides CV if both set the same field
            # Example: If CV sets "Area type"=2 and GIS sets "Area type"=1, final value is 1
            merged = {**img_updates, **gis_updates}

            # Track which fields came from CV vs GIS for UI highlighting badges
            sources = {}
            for field in img_updates:
                sources[field] = "CV"
            for field in gis_updates:
                sources[field] = "GIS"  # GIS overrides CV source if both set the same field

            return merged, sources, None

        # ========================================================================
        # SINGLE MODE: Auto-code one image (backward compatible)
        # ========================================================================
        # Used by the single "Auto-code" button in the UI
        # Payload: { imageRef: "...", coords: [[lon,lat],...], index?: int }
        if has_single_fields and not run_all and not indices:
            image_ref = payload.get("imageRef")
            coords = payload.get("coords")
            if not image_ref or not coords:
                return fail("imageRef and coords are required", 400)

            # Call CV + GIS autocoding
            merged, sources, err = _call_autocode_pair(image_ref, coords)
            if err:
                return fail(err, 500)

            # Optional write-back to attributes table if index is provided
            idx = payload.get("index")
            if isinstance(idx, int) and 0 <= idx < len(ver.attributes.df):
                changed_fields = []  # Only fields that actually changed value
                field_sources = {}   # Source (CV/GIS) for each changed field

                for field, code in (merged or {}).items():
                    # Check if value actually changed (not just set to same value)
                    old_val = ver.attributes.df.at[idx, field] if field in ver.attributes.df.columns else None
                    if old_val != code:
                        changed_fields.append(field)
                        field_sources[field] = sources.get(field, "Unknown")
                    # Update the DataFrame
                    ver.attributes.df.at[idx, field] = code

                # Save immediately for single-image autocoding
                ver.save_all()

                return ok({
                    "updates": merged,
                    "saved": True,
                    "changed_fields": changed_fields,      # For UI highlighting
                    "field_sources": field_sources         # For CV/GIS badges
                })

            # No index provided - return updates without saving
            return ok({
                "updates": merged,
                "saved": False,
                "changed_fields": list(merged.keys()),
                "field_sources": sources
            })

        # ========================================================================
        # BULK MODE: Auto-code multiple/all images
        # ========================================================================
        # Used by the "Auto-code all" button in the UI
        # Payload options:
        #   - { all: true, save?: false }              -> Process all rows
        #   - { indices: [0,2,5], save?: false }       -> Process specific rows

        # Determine which rows to process
        if not indices:
            # Process all rows in the project
            indices = list(range(len(ver.attributes.df)))
        else:
            # Sanitize provided indices (remove invalid values)
            indices = [i for i in indices if isinstance(i, int) and 0 <= i < len(ver.attributes.df)]

        # Check if we should save to disk (default: True, but UI passes False for temp changes)
        save = bool(payload.get("save", True))

        # Tracking variables
        errors = []           # List of {index, reason} for failed rows
        ok_count = 0          # Number of successfully processed rows
        changed_by_row = {}   # {row_index: [field_names]} - which fields changed per row
        sources_by_row = {}   # {row_index: {field_name: "CV"|"GIS"}} - source per field per row

        # Pre-compute images directory path for performance
        images_dir = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER).resolve()

        # Process each row
        for idx in indices:
            try:
                # Resolve image filename and coordinates for this row
                image_ref = _resolve_image_ref(idx)
                coords = _resolve_coords(idx)

                # Validate we have the required data
                if not image_ref:
                    # Provide detailed error message for debugging
                    geo_row = proj.geo_data.df.iloc[idx] if idx < len(proj.geo_data.df) else None
                    if geo_row is not None:
                        img_col = "Image Reference"
                        img_val = geo_row.get(img_col) if img_col in geo_row else None
                        errors.append({"index": idx, "reason": f"missing or invalid imageRef (geo_data['{img_col}'] = {repr(img_val)})"})
                    else:
                        errors.append({"index": idx, "reason": "missing imageRef (row not in geo_data)"})
                    continue

                if not coords:
                    errors.append({"index": idx, "reason": "missing LineString coords"})
                    continue

                # Run CV + GIS autocoding for this row
                merged, sources, err = _call_autocode_pair(image_ref, coords)
                if err:
                    errors.append({"index": idx, "reason": err})
                    continue

                # Track which fields actually changed (for UI highlighting)
                changed_fields = []  # List of field names that changed
                field_sources = {}   # {field_name: "CV"|"GIS"} for changed fields

                for field, code in (merged or {}).items():
                    # Get the old value before autocoding
                    old_val = ver.attributes.df.at[idx, field] if field in ver.attributes.df.columns else None

                    # Only track as "changed" if value actually differs
                    if old_val != code:
                        changed_fields.append(field)
                        field_sources[field] = sources.get(field, "Unknown")

                    # Update the DataFrame with new value
                    ver.attributes.df.at[idx, field] = code

                # Store tracking info for this row
                changed_by_row[idx] = changed_fields
                sources_by_row[idx] = field_sources
                ok_count += 1

            except Exception as e:
                # Catch and log any unexpected errors
                traceback.print_exc()
                errors.append({"index": idx, "reason": str(e)})

        # Save to disk only if requested and at least one row succeeded
        # Note: UI typically passes save=False to keep changes temporary until user clicks Save
        if save and ok_count > 0:
            ver.save_all()

        # Return the updated attributes DataFrame so frontend can update UI without refetching
        # This enables temporary (in-memory) changes that aren't persisted until Save is clicked
        updated_attributes = ver.attributes.df.to_dict(orient="records")

        return ok({
            "saved": bool(save and ok_count > 0),      # Whether changes were persisted to disk
            "total": len(indices),                      # Total rows attempted
            "ok": ok_count,                             # Number of rows successfully processed
            "fail": len(errors),                        # Number of rows that failed
            "errors": errors,                           # Detailed error info: [{index, reason}, ...]
            "changed_by_row": changed_by_row,          # {row_idx: [field_names]} for UI highlighting
            "sources_by_row": sources_by_row,          # {row_idx: {field: "CV"|"GIS"}} for badges
            "updated_attributes": updated_attributes,   # Complete attributes table with updates applied
        })

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"autocode_all error: {e}", 500)
