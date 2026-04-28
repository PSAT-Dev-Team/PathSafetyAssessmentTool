# app/api/projects/routes.py
from __future__ import annotations
from flask import (
    Blueprint,
    jsonify,
    request,
    send_from_directory,
    abort,
    send_file,
    make_response,
    current_app,
    Response,
    stream_with_context,
)
import zipfile
import io
from pathlib import Path
import urllib.parse
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
import datetime
import math
from app.services.cyclerap_scoring import calculate_cyclerap_score_native
# ---- init guards (thread-safe & error memo) ----
import threading
from werkzeug.exceptions import ServiceUnavailable

_INIT_LOCK = threading.Lock()
_INIT_ERR = {"cv": None}

_GIS_INSTANCE: "gis.GIS | None" = None

def _get_gis() -> "gis.GIS":
    global _GIS_INSTANCE
    if _GIS_INSTANCE is not None:
        return _GIS_INSTANCE
    with _INIT_LOCK:
        if _GIS_INSTANCE is None:
            # backend/app/api/projects/routes.py -> backend is parents[3]
            shp_dir = (Path(__file__).resolve().parents[3] / "shapefiles").resolve()
            print(f"[GIS] Initializing with shp_dir: {shp_dir}")
            if not shp_dir.exists():
                print(f"[GIS] ERROR: Shapefile directory NOT FOUND at {shp_dir}")
                # Try fallback parent logic if needed, but resolve() should be correct
                raise FileNotFoundError(f"Shapefile directory not found: {shp_dir}")
            _GIS_INSTANCE = gis.GIS(gis.LayerStore.default(base_dir=str(shp_dir)))
            print(f"[GIS] Instance created successfully.")
    return _GIS_INSTANCE


def warmup_gis() -> None:
    """Pre-warm the GIS singleton in a background thread at app startup.

    Called once from create_app() so shapefiles are loaded before the first
    real request arrives, eliminating the cold-start penalty for end users.
    Any error is logged but never raised — the app remains fully functional,
    _get_gis() will just re-attempt construction on first use.
    """
    import threading

    def _warm():
        try:
            g = _get_gis()
            # Pre-load all registered layers so the first toggle is instant
            g.store.reload()
        except Exception as exc:  # pragma: no cover
            import logging
            logging.getLogger(__name__).warning("GIS warmup failed: %s", exc)

    t = threading.Thread(target=_warm, name="gis-warmup", daemon=True)
    t.start()

# Counts nested inference scopes.  PATCH handlers check this and
# return immediately (no-op 200) so they don't hold the GIL during inference.
_INFERENCE_DEPTH = 0


# —— Reuse your existing service layer —— #
from app.services.project_manager import project_manager, Project   # If the path is different, change to your real package path
import app.services.serializer as serializer
import app.services.cycleRAP_interface as CRI
import app.services.cycleRAP_VA as cycleRAP_VA

from pathlib import Path
from app.services import prediction as cv_pred
from app.services import gis_mapping as gis
import app.services.global_var as global_var


# ===== Treatment Definitions (must match frontend exactly) =====
TREATMENTS = [
    {
        "id": 1,
        "name": "Upgrade to on-road bicycle lane with light segregation",
        "triggers": [
            {"Facility Type": [5], "Light Segregation": [2]},
            {"Facility Type": [6], "Light Segregation": [2]},
            {"Facility Type": [1, 2], "Number of lanes – adjacent road": [1], "Peak pedestrian flow along or across facility": [3]},
            {"Facility Type": [1, 2], "Number of lanes – adjacent road": [1]},
        ],
        "effects": {"Facility Type": 4, "Light Segregation": 1, "Facility access": 1}
    },
    {
        "id": 2,
        "name": "Safety barrier (Adjacent road 0-1m)",
        "triggers": [
            {"Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Intersection or Road Crossing": [2]},
            {"Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Curvature": [1], "Intersection or Road Crossing": [2]},
            {"Facility Type": [3, 4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Intersection or Road Crossing": [2]},
        ],
        "effects": {"Adjacent Road Lane 0-1m": 2, "Facility access": 1}
    },
    {
        "id": 3,
        "name": "Safety barrier (Adjacent road 1-3m)",
        "triggers": [
            {"Facility Type": [4, 5, 6], "Adjacent Road Lane 1-3m": [1], "Intersection or Road Crossing": [2]},
            {"Facility Type": [3, 4, 5, 6], "Adjacent Road Lane 1-3m": [1], "Intersection or Road Crossing": [2]},
        ],
        "effects": {"Adjacent Road Lane 1-3m": 2, "Facility access": 1}
    },
    {
        "id": 4,
        "name": "Upgrade to cycling-priority street",
        "triggers": [
            {"Facility Type": [1, 2, 5, 6], "Property Access": [1]},
        ],
        "effects": {"Facility access": 1}
    },
    {
        "id": 5,
        "name": "Upgrade to multi-use path",
        "triggers": [
            {"Facility Type": [1, 2, 5, 6], "Property Access": [1]},
        ],
        "effects": {"Facility Type": 2, "Facility Width per Direction": 3, "Facility access": 1}
    },
    {
        "id": 6,
        "name": "Upgrade to off-road bicycle path",
        "triggers": [
            {"Facility Type": [1, 2, 5, 6], "Property Access": [1]},
        ],
        "effects": {"Facility Type": 3, "Facility access": 1}
    },
    {
        "id": 7,
        "name": "Convert to one-way facility",
        "triggers": [
            {"Facility Type": [4, 5, 6], "Flow Direction": [2]},
        ],
        "effects": {"Flow Direction": 1, "Facility access": 1}
    },
    {
        "id": 8,
        "name": "Improve surface conditions",
        "triggers": [
            {"Loose or slippery surface": [1]},
        ],
        "effects": {"Loose or slippery surface": 2, "Major Surface Deformation or Drain Opening": 2}
    },
    {
        "id": 9,
        "name": "Install light segregation",
        "triggers": [
            {"Light Segregation": [2]},
        ],
        "effects": {"Light Segregation": 1}
    },
    {
        "id": 10,
        "name": "Install street lighting",
        "triggers": [
            {"Street Lighting": [2]},
        ],
        "effects": {"Street Lighting": 1}
    },
    {
        "id": 11,
        "name": "Remove fixed obstacles",
        "triggers": [
            {"Fixed Obstacle on Facility": [1]},
        ],
        "effects": {"Fixed Obstacle on Facility": 2}
    },
    {
        "id": 12,
        "name": "Remove non-fixed obstacles",
        "triggers": [
            {"Non-Fixed Obstacle on Facility": [1]},
        ],
        "effects": {"Non-Fixed Obstacle on Facility": 2}
    },
    {
        "id": 13,
        "name": "Remove width restriction",
        "triggers": [
            {"Width Restriction": [1]},
        ],
        "effects": {"Width Restriction": 2}
    },
    {
        "id": 14,
        "name": "Improve facility access",
        "triggers": [
            {"Facility access": [2]},
        ],
        "effects": {"Facility access": 1}
    },
    {
        "id": 15,
        "name": "Redesign sharp curves",
        "triggers": [
            {"Curvature": [1]},
        ],
        "effects": {"Curvature": 2}
    },
    {
        "id": 16,
        "name": "Widen the facility",
        "triggers": [
            {"Facility Width per Direction": [1, 2]},
        ],
        "effects": {"Facility Width per Direction": 3}
    },
    {
        "id": 17,
        "name": "Install protective barrier",
        "triggers": [
            {"Adjacent Severe Hazard 0-1m": [1]},
        ],
        "effects": {"Adjacent Severe Hazard 0-1m": 2}
    },
    {
        "id": 18,
        "name": "Improve delineation",
        "triggers": [
            {"Delineation": [2]},
        ],
        "effects": {"Delineation": 1}
    },
    {
        "id": 19,
        "name": "Review intersection approach",
        "triggers": [
            {"Intersection Approach": [1]},
        ],
        "effects": {"Intersection Approach": 2}
    },
    {
        "id": 20,
        "name": "Improve crossing facility",
        "triggers": [
            {"Crossing Facility": [2]},
        ],
        "effects": {"Crossing Facility": 1}
    },
    {
        "id": 21,
        "name": "Evaluate grade separation",
        "triggers": [
            {"Intersection or Road Crossing": [1]},
        ],
        "effects": {"Intersection or Road Crossing": 2}
    },
    {
        "id": 22,
        "name": "Reconfigure/remove parking",
        "triggers": [
            {"Adjacent Vehicle Parking 0-1m": [1]},
        ],
        "effects": {"Adjacent Vehicle Parking 0-1m": 2}
    },
    {
        "id": 23,
        "name": "Review tram/train rails",
        "triggers": [
            {"Tram or Train Rails": [1]},
        ],
        "effects": {"Tram or Train Rails": 2}
    },
    {
        "id": 24,
        "name": "Install traffic calming",
        "triggers": [
            {"Facility Type": [4], "Intersection or Road Crossing": [2], "Adjacent Road Lane 0-1m": [1]},
        ],
        "effects": {}
    },
    {
        "id": 25,
        "name": "Bicycle speed control",
        "triggers": [
            {"Bicycle/LV speed – average": [2]},
        ],
        "effects": {"Bicycle/LV speed – average": 1}
    },
]

# util
def ok(data, code=200):
    return jsonify(data), code

def fail(message, code=400):
    return jsonify({"error": message}), code

def df_to_records(df) -> list:
    """Convert a DataFrame to JSON-safe records, replacing NaN/Inf with None."""
    records = df.to_dict(orient="records")
    sanitized = []
    for row in records:
        clean = {}
        for k, v in row.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                clean[k] = None
            else:
                clean[k] = v
        sanitized.append(clean)
    return sanitized

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

_MODELS_READY = {"cv": False}

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
                    if (d / "path_segmentation_v2.pt").exists():
                        model_dir = d.resolve()
                        break

                if model_dir is None:
                    tried = "\n".join(str(p) for p in candidates)
                    raise RuntimeError(f"Cannot find model_dir (missing path_segmentation_v2.pt). Tried:\n{tried}")

                # YOLO models load
                print(f"[Autocode] Loading CV models from {model_dir} — this may take several minutes on CPU...", flush=True)
                cv_pred.CycleRAP_Coding_Helper.initialise(model_dir)
                _MODELS_READY["cv"] = True
                print("[Autocode] CV models loaded successfully.", flush=True)

            except Exception as e:
                _INIT_ERR["cv"] = f"CV init failed: {e}"
                print(f"[Autocode] ERROR: CV model init failed: {e}", flush=True)
                # Next calls will short-circuit quickly
                raise ServiceUnavailable(_INIT_ERR["cv"])


def _warmup_models_in_background():
    """Daemon thread: pre-load CV + GIS at server startup so the first autocode request is fast."""
    import time
    from concurrent.futures import ThreadPoolExecutor, as_completed
    # Small delay to let Flask finish starting up before we hammer the CPU
    time.sleep(2)
    print("[Autocode] Background warmup: starting model pre-load...", flush=True)
    try:
        _ensure_models_ready()
        print("[Autocode] Background warmup: CV models ready.", flush=True)
    except Exception as e:
        print(f"[Autocode] Background warmup (CV) failed: {e}", flush=True)

    # Pre-load GIS shapefiles in parallel threads (I/O + C extensions release GIL)
    try:
        print("[GIS] Background warmup: loading shapefiles in parallel...", flush=True)
        t_total = time.perf_counter()
        _inst = _get_gis()
        layer_names = list(_inst.store.paths.keys())

        def _load_one(name):
            t0 = time.perf_counter()
            _inst.store.get(name)
            return time.perf_counter() - t0

        with ThreadPoolExecutor(max_workers=6, thread_name_prefix="gis-load") as pool:
            futs = {pool.submit(_load_one, n): n for n in layer_names}
            for fut in as_completed(futs):
                name = futs[fut]
                try:
                    elapsed = fut.result()
                    print(f"[GIS] Loaded: {name} ({elapsed:.1f}s)", flush=True)
                except Exception as exc:
                    print(f"[GIS] Warning: {name}: {exc}", flush=True)

        elapsed_total = time.perf_counter() - t_total
        print(f"[GIS] Background warmup complete ({elapsed_total:.1f}s total).", flush=True)
    except Exception as e:
        print(f"[GIS] Background warmup failed: {e}", flush=True)


# Kick off background warmup immediately when this module is imported (server start)
_warmup_thread = threading.Thread(target=_warmup_models_in_background, daemon=True, name="model-warmup")
_warmup_thread.start()


# ───────────────────────── Gradient lookup (module-level) ─────────────────────
# Loaded once and cached for the lifetime of the server process.
# Works for any project — the CSV accumulates entries across all project areas.

_GRADIENT_LOOKUP: "dict | None" = None


def _load_gradient_lookup() -> dict:
    """Load (and cache) the gradient lookup CSV. Returns {} if unavailable."""
    global _GRADIENT_LOOKUP
    if _GRADIENT_LOOKUP is not None:
        return _GRADIENT_LOOKUP
    lookup_path = Path(__file__).resolve().parents[3] / "shapefiles" / "gradient_lookup.csv"
    if not lookup_path.exists():
        _GRADIENT_LOOKUP = {}
        return _GRADIENT_LOOKUP
    try:
        import csv as _csv
        result = {}
        with open(lookup_path, newline="", encoding="utf-8") as f:
            reader = _csv.DictReader(f)
            if "Image Reference" not in (reader.fieldnames or []):
                print("[Gradient] WARNING: gradient_lookup.csv missing 'Image Reference' column — skipping")
                _GRADIENT_LOOKUP = {}
                return _GRADIENT_LOOKUP
            for row in reader:
                try:
                    img = row.get("Image Reference", "").strip()
                    grade_pct_raw = row.get("gradient_pct", "").strip()
                    grade_coded_raw = row.get("Grade", "").strip()
                    if img and grade_coded_raw:
                        grade_coded = int(float(grade_coded_raw))
                        grade_pct = float(grade_pct_raw) if grade_pct_raw else float("nan")
                        result[img] = (grade_coded, grade_pct)
                except (ValueError, TypeError):
                    continue
        _GRADIENT_LOOKUP = result
        print(f"[Gradient] Loaded {len(_GRADIENT_LOOKUP)} entries from gradient_lookup.csv")
    except Exception as _e:
        print(f"[Gradient] WARNING: could not load gradient_lookup.csv: {_e} — Grade will not be set")
        _GRADIENT_LOOKUP = {}
    return _GRADIENT_LOOKUP


def _inject_grade(image_ref: str, updates: dict, sources: "dict | None" = None,
                   project_name: str = "") -> "float | None":
    """Inject Grade from the gradient lookup into *updates* (in-place).
    Returns grade_pct if found, else None.
    """
    try:
        lookup = _load_gradient_lookup()
        if not lookup:
            return None
        key = image_ref
        if key not in lookup and project_name:
            prefix = project_name + "_"
            if key.startswith(prefix):
                key = key[len(prefix):]

        import os
        key_stem = os.path.splitext(key)[0]
        
        matched_key = None
        if key in lookup:
            matched_key = key
        else:
            # Check by exact stem (extension-agnostic)
            for k in lookup:
                if os.path.splitext(k)[0] == key_stem:
                    matched_key = k
                    break

        if not matched_key:
            # Last resort: find any CSV entry whose stem is a suffix
            bare = key.split("_", 1)[-1] if "_" in key else key
            bare_stem = os.path.splitext(bare)[0]
            for k in lookup:
                k_stem = os.path.splitext(k)[0]
                if key_stem.endswith(k_stem) or k_stem.endswith(bare_stem):
                    matched_key = k
                    break

        if not matched_key:
            print(f"[Gradient] no entry for '{image_ref}' — skipping", flush=True)
            return None
            
        grade_coded, grade_pct = lookup[matched_key]
        print(f"[Gradient] {image_ref}: {grade_pct:+.2f}% → Grade {grade_coded}", flush=True)
        if grade_coded not in (1, 2):
            print(f"[Gradient] WARNING: unexpected Grade value {grade_coded!r} for {image_ref} — skipping")
            return None
        updates["Grade"] = grade_coded
        updates["Gradient %"] = round(grade_pct, 2)
        if sources is not None:
            sources["Grade"] = "LAZ"
            sources["Gradient %"] = "LAZ"
        return grade_pct
    except Exception as _e:
        print(f"[Gradient] WARNING: error injecting Grade for {image_ref}: {_e}")
        return None


# ───────────────────────── Endpoints ─────────────────────────

@bp.before_request
def _log_incoming():
    print(f"[Flask] >>> {request.method} {request.path}", flush=True)

@bp.get("")
def list_projects():
    """List projects with metadata including tags, date_created, last_updated, and verification segment counts."""
    ctx = get_ctx()
    pm = ctx["pm"]
    names = pm.list_names()

    # Build list with metadata
    projects = []
    for name in names:
        try:
            proj = pm.project(name)
            # Get total segment count from latest version's attributes
            ver = proj.latest()
            total_segments = 0
            if ver.attributes and hasattr(ver.attributes, 'df'):
                df = ver.attributes.df
                if df is not None and len(df) > 0:
                    total_segments = len(df)

            project_data = {
                "name": name,
                "tags": proj.metadata.tags or [],
                "verified": getattr(proj.metadata, 'verified', False),
                "verified_segment_count": getattr(proj.metadata, 'verified_segment_count', 0),
                "autocoded_segment_count": getattr(proj.metadata, 'autocoded_segment_count', 0),
                "total_segments": total_segments
            }

            # Add date_created if available
            if hasattr(proj.metadata, 'date_created') and proj.metadata.date_created:
                project_data["date_created"] = proj.metadata.date_created.isoformat()

            # Add last_updated if available
            if hasattr(proj.metadata, 'last_updated') and proj.metadata.last_updated:
                project_data["last_updated"] = proj.metadata.last_updated.isoformat()

            projects.append(project_data)
        except Exception as e:
            # If metadata fails to load, return project with empty tags and no dates
            import traceback
            traceback.print_exc()
            projects.append({
                "name": name,
                "tags": [],
                "verified": False,
                "verified_segment_count": 0,
                "autocoded_segment_count": 0,
                "total_segments": 0
            })

    return jsonify({"projects": projects})

@bp.post("/<project_name>/segments/delete-batch")
def delete_segments_batch(project_name):
    """
    Batch delete segments from a project at user-specified indices.
    POST body: { "indices": [0, 1, 5] }
    """
    ctx = get_ctx()
    pm = ctx["pm"]
    project = pm.project(project_name)
    if project is None:
        abort(404, description="Project not found")

    data = request.get_json()
    if not data or "indices" not in data:
        abort(400, description="Missing 'indices' in request body")

    indices = data["indices"]
    if not isinstance(indices, list):
        abort(400, description="'indices' must be a list of integers")

    # Sort indices in descending order to avoid index shifting issues if we were doing iterative deletion
    # But for batch drop it doesn't matter as much, still good practice
    # Actuallly, df.drop handles list of indices regardless of order.
    # However, for consistency and logging:
    indices = sorted(indices, reverse=True)

    try:
        project.delete_segments(indices)
    except Exception as e:
        traceback.print_exc()
        abort(500, description=f"Failed to delete segments: {e}")

    # Return updated metadata
    meta = project.metadata.to_dict() if project.metadata else {}
    return jsonify(meta)

@bp.post("/check-collisions")
def check_collisions():
    try:
        data = request.json
        source_name = urllib.parse.unquote(data.get("sourceProject"))
        target_name = data.get("targetProject")
        indices = data.get("indices", [])
        
        ctx = get_ctx()
        pm = ctx["pm"]
        
        source_proj = pm.project(source_name)
        
        # Check if target exists
        exists = any(p.metadata.project_name == target_name for p in pm.projects)
        
        if not exists:
            # New project, no collisions possible
            return jsonify({"ok": True, "collisions": []})
            
        target_proj = pm.project(target_name)
        collisions = source_proj.check_collisions(indices, target_proj)
        
        return jsonify({
            "ok": True,
            "collisions": collisions
        })
    except Exception as e:
        traceback.print_exc()
        return fail(f"Check collisions failed: {str(e)}", 500)


@bp.post("/copy-segments")
def copy_segments():
    """
    Copy segments from a source project to a target project.
    
    POST body:
    {
        "sourceProject": "Project A",
        "targetProject": "Project B",
        "indices": [0, 1, 2],
        "createTarget": boolean  # If true, create Project B if it doesn't exist (using template)
    }
    """
    try:
        data = request.json
        if not data:
            return fail("Missing request body", 400)
            
        source_name = urllib.parse.unquote(data.get("sourceProject"))
        target_name = data.get("targetProject") 
        # targetProject coming from frontend is just the name string (new or existing)
        
        indices = data.get("indices", [])
        create_target = data.get("createTarget", False)
        replace = data.get("replace", False)
        tags = data.get("tags", [])
        
        if not source_name or not target_name:
            return fail("Missing sourceProject or targetProject", 400)
            
        ctx = get_ctx()
        pm = ctx["pm"]
        
        # Get Source Project
        try:
            source_proj = pm.project(source_name)
        except KeyError:
            return fail(f"Source project '{source_name}' not found", 404)
            
        # Get or Create Target Project
        target_proj = None
        try:
            target_proj = pm.project(target_name)
        except KeyError:
            if create_target:
                # Create rudimentary/empty project
                # We can reuse create_project but we need geodataframe... 
                # Actually, copy_segments will populate it.
                # So we can create an empty structure manually or use create_project with empty data
                
                # Let's try to use pm.create_project with dummy data and then clear it?
                # Or better: just instantiate Project at new path and initialize empty
                
                target_path = pm.des_path / target_name
                if target_path.exists():
                     return fail(f"Target path {target_path} already exists but project not loaded? Restart server.", 500)
                
                # Initialize empty structure
                target_path.mkdir(parents=True)
                (target_path / global_var.PROJECT_IMAGES_FOLDER).mkdir()
                
                new_proj = Project(target_path)
                # Manually initialize metadata to avoid trying to read from non-existent file
                new_proj._metadata = serializer.ProjectMetadata()
                
                # Set basic metadata
                new_proj.metadata.project_name = target_name
                new_proj.metadata.date_created = datetime.datetime.now()
                new_proj.metadata.last_updated = datetime.datetime.now()
                new_proj.metadata.created_by = "copy_segments"
                new_proj.metadata.tags = tags
                new_proj.metadata.dataset = source_proj.metadata.dataset # Inherit dataset type?
                new_proj.metadata.size = 0
                
                # Initialize empty tables
                new_proj.geo_data = serializer.ProjectGeoData(0)
                new_proj.create_new_version() # Creates subfolder and empty tables
                
                # Save just to register it
                new_proj.save_all()
                new_proj.metadata.serialize(new_proj.project_path)
                pm.projects.append(new_proj)
                target_proj = new_proj
            else:
                 return fail(f"Target project '{target_name}' not found", 404)
        
        # Perform Copy
        count = source_proj.copy_segments(indices, target_proj, replace=replace)
        
        return jsonify({
            "ok": True, 
            "message": f"Copied {count} segments to {target_name}",
            "targetProject": target_name,
            "count": count
        })

    except Exception as e:
        traceback.print_exc()
        return fail(f"Copy segments failed: {str(e)}", 500)


@bp.delete("/<project_name>/segments/<int:segment_index>")
def delete_segment(project_name: str, segment_index: int):
    """
    Delete a specific segment (point) from the project.
    """
    try:
        ctx = get_ctx()
        pm = ctx["pm"]
        proj = pm.project(project_name)
        
        # Verify index is within bounds
        # Check latest attributes for size
        current_size = len(proj.latest().attributes.df)
        if segment_index < 0 or segment_index >= current_size:
            return fail(f"Segment index {segment_index} out of bounds (0-{current_size-1})", 400)

        proj.delete_segment(segment_index)
        
        return jsonify({
            "ok": True,
            "message": f"Segment {segment_index} deleted successfully",
            "remaining_segments": current_size - 1
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error deleting segment: {str(e)}", 500)

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

@bp.get("/<project_name>/metadata")
def get_project_metadata(project_name: str):
    """Get project metadata including verified status and verified segment count."""
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    return jsonify({
        "name": proj.metadata.project_name,
        "tags": proj.metadata.tags or [],
        "verified": getattr(proj.metadata, 'verified', False),
        "verified_segment_count": getattr(proj.metadata, 'verified_segment_count', 0),
        "autocoded_segment_count": getattr(proj.metadata, 'autocoded_segment_count', 0),
        "date_created": proj.metadata.date_created.isoformat() if hasattr(proj.metadata, 'date_created') and proj.metadata.date_created else None,
        "last_updated": proj.metadata.last_updated.isoformat() if hasattr(proj.metadata, 'last_updated') and proj.metadata.last_updated else None
    })

@bp.get("/<project_name>/versions/latest/attributes")
def get_latest_attributes(project_name: str):
    """Return the latest attributes.csv (converted to JSON for front-end table rendering).

    Also includes calculated band values (VB Band, BB Band, SB Band, BP Band) if they exist
    in the results, so filtering can use these calculated values.
    """
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    ver = proj.latest()

    attrs_df = ver.attributes.df

    # If results exist, merge the band values into attributes for filtering capability
    if ver.results and ver.results.df is not None and len(ver.results.df) > 0:
        results_df = ver.results.df
        band_columns = ["VB Band", "BB Band", "SB Band", "BP Band", "Overall Risk Level Band"]

        # Only include band columns that exist in results
        available_bands = [col for col in band_columns if col in results_df.columns]

        if available_bands and len(attrs_df) == len(results_df):
            # Create a copy of attributes to avoid modifying the original
            attrs_df = attrs_df.copy()
            # Merge band values into attributes
            for col in available_bands:
                attrs_df[col] = results_df[col].values

    return jsonify({"rows": df_to_records(attrs_df)})

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

@bp.post("/download-images")
def download_images():
    """
    Generate a ZIP file containing filtered images for multiple projects.
    
    Request body:
        {
            "projects": {
                "ProjectName1": ["img1.jpg", "img2.jpg", ...],
                "ProjectName2": ["imgA.jpg", "imgB.jpg", ...],
                ...
            }
        }
    """
    data = request.get_json() or {}
    projects_images = data.get("projects", {})

    if not projects_images:
        return fail("No images specified", 400)
    
    if not isinstance(projects_images, dict):
        return fail("projects must be a dictionary of project_name -> image_list", 400)

    ctx = get_ctx()
    pm = ctx["pm"]
    
    # Create in-memory zip file
    memory_file = io.BytesIO()
    
    try:
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            for project_name, image_files in projects_images.items():
                if not image_files or not isinstance(image_files, list):
                    continue
                
                # Check dir path without calling pm.project() which might be slow or fail if race
                # But safer to just construct path if we trust pm.des_path
                # project_manager usually ensures des_path is valid
                
                try:
                    images_dir = (pm.des_path / project_name / global_var.PROJECT_IMAGES_FOLDER).resolve()
                    
                    if not images_dir.exists() or not images_dir.is_dir():
                        continue
                        
                    # Add requested images to zip
                    for img_filename in image_files:
                        img_filename = str(img_filename) # Ensure string
                        # Basic security check - prevent traversal
                        if ".." in img_filename or "/" in img_filename or "\\" in img_filename:
                            continue
                            
                        img_path = images_dir / img_filename
                        # Verify file exists
                        if img_path.exists() and img_path.is_file():
                            # Path inside zip: "{project_name} images/{img_filename}"
                            zip_path = f"{project_name} images/{img_filename}"
                            zf.write(str(img_path), zip_path)
                            
                except Exception as e:
                    continue
                    
    except Exception as e:
        return fail(f"Failed to create zip file: {str(e)}", 500)
        
    memory_file.seek(0)
    
    return send_file(
        memory_file,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"filtered_images_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    )

@bp.get("/attribute-mappings")
def get_attribute_mappings():
    """
    Return field mappings for Attributes (numeric -> text), e.g.:
    {
      "Area type": {"1":"Urban","2":"Suburban","3":"Rural","4":"Industrial"},
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

def _convert_attribute_types(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convert attribute values to appropriate types for scoring.

    Frontend sends all values as strings via JSON. This function converts them to:
    - int for lookup-based attributes (most of them)
    - float for numeric attributes (ROAD_AADT, speeds)
    """
    df_copy = df.copy()

    # Attributes that should be integers (lookup table keys)
    # These are used for lookups in the scoring algorithm
    integer_attrs = [
        'Area type',
        'Facility Type',
        'Facility access',
        'Line of Sight',
        'Loose or slippery surface',
        'Tram or Train Rails',
        'Major Surface Deformation or Drain Opening',
        'Fixed Obstacle on Facility',
        'Non-Fixed Obstacle on Facility',
        'Delineation',
        'Light Segregation',
        'Facility Width per Direction',
        'Flow Direction',
        'Width Restriction',
        'Adjacent Road Lane 0-1m',
        'Adjacent Vehicle Parking 0-1m',
        'Adjacent Severe Hazard 0-1m',
        'Adjacent object or level change 0-1m',
        'Adjacent Sidewalk 0-1m',
        'Adjacent Road Lane 1-3m',
        'Adjacent Vehicle Parking 1-3m',
        'Adjacent Severe Hazard 1-3m',
        'Adjacent object or level change 1-3m',
        'Adjacent Sidewalk 1-3m',
        'Grade',
        'Curvature',
        'Street Lighting',
        'Pedestrian Crossing',
        'Intersecting Bicycle Facility',
        'Intersection Approach',
        'Intersection or Road Crossing',
        'Crossing Facility',
        'Number of lanes – adjacent road',
        'Number of lanes – intersecting road',
        'Property Access',
        'Peak pedestrian flow along or across facility',
        'Peak bicycle/LV traffic flow',
        'Observed proportion of cargo bikes and mopeds',
        'Bicycle/LV speed – average',
        'Bicycle/LV speed differential',
        'Heavy vehicle flow',
    ]

    # Attributes that should be floats (numeric values)
    float_attrs = ['Road AADT', 'Road speed limit', 'Road operating speed (mean)']

    for col in df_copy.columns:
        if col in integer_attrs:
            # Convert string to int, handling None/NaN values
            df_copy[col] = pd.to_numeric(df_copy[col], errors='coerce').fillna(1).astype(int)
        elif col in float_attrs:
            # Convert string to float, handling None/NaN values
            if col == 'Road AADT':
                df_copy[col] = pd.to_numeric(df_copy[col], errors='coerce').fillna(6000)
            elif col == 'Road speed limit':
                # Handle "NA" as a valid value; convert numeric strings to float, use "NA" as fallback for empty/null
                df_copy[col] = df_copy[col].apply(
                    lambda x: x if x == 'NA' else (pd.to_numeric(x, errors='coerce') if pd.notna(x) else 'NA')
                ).fillna('NA')
            else:
                df_copy[col] = pd.to_numeric(df_copy[col], errors='coerce').fillna(50)

    return df_copy


@bp.post("/<project_name>/score")
def calculate_score(project_name: str):
    """
    Calculate cycleRAP scores using native Python implementation (no Excel dependency).

    This endpoint:
    1) Loads the project's latest attributes DataFrame from disk
    2) Optionally accepts modified attributes from the request body
    3) Calculates BB, BP, SB, VB, and composite Overall Risk Levels
    4) Saves the results back to disk
    5) Returns the calculated scores to the frontend

    Request body (optional):
        {
            "attributes": [
                {"field1": value1, "field2": value2, ...},  // Row 1
                {"field1": value1, "field2": value2, ...},  // Row 2
                ...
            ]
        }

    Response:
        {
            "ok": true,
            "result_rows": [
                {
                    "BB": 60.0,
                    "BB Band": 3,
                    "BP": 0.0,
                    "BP Band": 0,
                    "SB": 80.0,
                    "SB Band": 4,
                    "VB": 85.0,
                    "VB Band": 4,
                    "Overall Risk Level": 61.5,
                    "CycleRAP score Band": 3
                },
                ...
            ]
        }

    NOTE: The scoring algorithm in cyclerap_scoring.py is currently a MOCK implementation.
          Replace with actual cycleRAP formulas when available.
    """
    # Get project context and latest version
    ctx = get_ctx()
    proj: Project = ctx["pm"].project(project_name)
    ver = proj.latest()

    # Load attributes from disk (or use provided attributes from request)
    attrs_df = ver.attributes.df
    payload = request.get_json(silent=True) or {}
    is_single_row_calculation = False

    if "attributes" in payload:
        # Frontend sent modified attributes - use those instead
        attrs_df = serializer.pd.DataFrame(payload["attributes"])
        # Convert string values to appropriate types for scoring
        attrs_df = _convert_attribute_types(attrs_df)
        # Check if this is a single row calculation (for real-time score updates)
        is_single_row_calculation = len(payload["attributes"]) == 1



    # ==========================================
    # MAIN CALCULATION: Native Python scoring
    # ==========================================
    # This replaces the old Excel COM automation approach:
    # OLD: results_df = CRI.cycleRAP_interface.calculate_cycleRAP_score(attrs)
    # NEW: Cross-platform native Python implementation
    results_df = calculate_cyclerap_score_native(attrs_df)



    # ==========================================
    # PERSIST RESULTS: Save to disk (only if full calculation)
    # ==========================================
    # Only save to disk if this is a full project calculation, not a single-row real-time update
    if not is_single_row_calculation:
        ver._results = serializer.Results()
        ver.results.df = results_df
        proj.save_all()


        # Update last_updated
        proj.metadata.last_updated = datetime.datetime.now()
        proj.metadata.serialize(proj.project_path)
    # Return results to frontend
    return jsonify({"ok": True, "result_rows": df_to_records(results_df)})

@bp.get("/<project_name>/results")
def get_results(project_name: str):
    """
    Retrieve the latest Overall Risk Levels for a project.
    Returns the calculated results from the latest version.
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        # Get results if they exist
        if ver.results and ver.results.df is not None and len(ver.results.df) > 0:
            return jsonify({
                "ok": True,
                "result_rows": df_to_records(ver.results.df)
            })
        else:
            # No results yet
            return jsonify({
                "ok": True,
                "result_rows": []
            })
    except Exception as e:
        return jsonify({
            "ok": False,
            "error": str(e)
        }), 500

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

    return jsonify({"ok": True, "rows": df_to_records(treatment_tbl.df)})


@bp.post("/<project_name>/treatments/apply")
def apply_treatments(project_name: str):
    """
    Apply selected treatments to a specific segment.

    Request body:
        {
            "segment_index": 5,
            "treatment_ids": [1, 9, 14],
            "image_ref": "FERNVALE_001.jpg"  // Optional, for tracking
        }

    Response:
        {
            "ok": true,
            "segment_index": 5,
            "treatments_applied": "1,9,14",
            "modified_attributes": { "Facility Type": 4, ... },
            "before_scores": { "BB": 2.5, "BP": 1.2, "SB": 3.1, "VB": 5.8, "Overall Risk Level": 12.6 },
            "after_scores": { "BB": 1.8, "BP": 0.9, "SB": 2.2, "VB": 3.5, "Overall Risk Level": 8.4 }
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        data = request.get_json(silent=True) or {}
        segment_index = data.get("segment_index")
        treatment_ids = data.get("treatment_ids", [])
        image_ref = data.get("image_ref", "")

        if segment_index is None:
            return fail("Missing segment_index", 400)

        if not isinstance(treatment_ids, list):
            return fail("treatment_ids must be a list", 400)

        # Load original attributes
        attrs_df = ver.attributes.df
        if segment_index >= len(attrs_df):
            return fail(f"Segment index {segment_index} out of range", 400)

        original_row = dict(attrs_df.iloc[segment_index])

        # Apply treatment effects
        modified_row = original_row.copy()
        for treatment_id in treatment_ids:
            if not (1 <= treatment_id <= 25):
                return fail(f"Invalid treatment ID: {treatment_id}", 400)
            treatment = TREATMENTS[treatment_id - 1]  # Convert 1-based to 0-based
            for attr_name, new_value in treatment['effects'].items():
                modified_row[attr_name] = new_value

        # Calculate before scores (from original attributes)
        original_df = pd.DataFrame([original_row])
        before_scores_df = calculate_cyclerap_score_native(original_df)
        before_scores = {
            "BB": float(before_scores_df["BB"].iloc[0]),
            "BP": float(before_scores_df["BP"].iloc[0]),
            "SB": float(before_scores_df["SB"].iloc[0]),
            "VB": float(before_scores_df["VB"].iloc[0]),
            "Overall Risk Level": float(before_scores_df["Overall Risk Level"].iloc[0])
        }

        # Calculate after scores (from modified attributes)
        modified_df = pd.DataFrame([modified_row])
        after_scores_df = calculate_cyclerap_score_native(modified_df)
        after_scores = {
            "BB": float(after_scores_df["BB"].iloc[0]),
            "BP": float(after_scores_df["BP"].iloc[0]),
            "SB": float(after_scores_df["SB"].iloc[0]),
            "VB": float(after_scores_df["VB"].iloc[0]),
            "Overall Risk Level": float(after_scores_df["Overall Risk Level"].iloc[0])
        }

        # Convert modified_row values to JSON-serializable types
        serializable_modified_row = {}
        for col, val in modified_row.items():
            if pd.notna(val):
                try:
                    if hasattr(val, 'item'):  # numpy/pandas scalar
                        serializable_modified_row[col] = val.item()
                    else:
                        serializable_modified_row[col] = val
                except (ValueError, TypeError):
                    serializable_modified_row[col] = None
            else:
                serializable_modified_row[col] = None

        # Update or create treatment.csv
        treatment_df = ver.treatment.df

        # Ensure treatment dataframe has all attribute columns
        for col in attrs_df.columns:
            if col not in treatment_df.columns:
                treatment_df[col] = ""

        # Ensure the treatment.csv has enough rows
        if len(treatment_df) <= segment_index:
            # Need to expand the dataframe
            new_rows = [treatment_df.iloc[0].copy() if len(treatment_df) > 0 else {}] * (segment_index - len(treatment_df) + 1)
            treatment_df = pd.concat([treatment_df, pd.DataFrame(new_rows)], ignore_index=True)

        # Update the row with modified attributes
        for col in modified_row.keys():
            if col in treatment_df.columns:
                treatment_df.at[segment_index, col] = modified_row[col]

        # Update "Treatments Applied" column
        if "Treatments Applied" not in treatment_df.columns:
            treatment_df.insert(0, "Treatments Applied", "")

        if treatment_ids:
            treatment_df.at[segment_index, "Treatments Applied"] = ",".join(str(tid) for tid in treatment_ids)
        else:
            treatment_df.at[segment_index, "Treatments Applied"] = ""

        # Save updated treatment.csv
        ver._treatment = serializer.Treatment()
        ver.treatment.df = treatment_df
        ver.treatment.df_dirty = True
        proj.save_all()

        # Update last_updated
        proj.metadata.last_updated = datetime.datetime.now()
        proj.metadata.serialize(proj.project_path)

        return jsonify({
            "ok": True,
            "segment_index": segment_index,
            "treatments_applied": ",".join(str(tid) for tid in treatment_ids),
            "modified_attributes": serializable_modified_row,
            "before_scores": before_scores,
            "after_scores": after_scores
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error applying treatments: {str(e)}", 500)


@bp.post("/<project_name>/treatments/preview")
def preview_treatments(project_name: str):
    """
    Preview selected treatments for a specific segment without saving.
    
    Request body:
        {
            "segment_index": 5,
            "treatment_ids": [1, 9, 14]
        }

    Response:
        {
            "ok": true,
            "segment_index": 5,
            "modified_attributes": { "Facility Type": 4, ... },
            "before_scores": { "BB": 2.5, ... },
            "after_scores": { "BB": 1.8, ... }
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        data = request.get_json(silent=True) or {}
        segment_index = data.get("segment_index")
        treatment_ids = data.get("treatment_ids", [])

        if segment_index is None:
            return fail("Missing segment_index", 400)

        if not isinstance(treatment_ids, list):
            return fail("treatment_ids must be a list", 400)

        # Load original attributes
        attrs_df = ver.attributes.df
        if segment_index >= len(attrs_df):
            return fail(f"Segment index {segment_index} out of range", 400)

        original_row = dict(attrs_df.iloc[segment_index])

        # Apply treatment effects
        modified_row = original_row.copy()
        for treatment_id in treatment_ids:
            if not (1 <= treatment_id <= 25):
                return fail(f"Invalid treatment ID: {treatment_id}", 400)
            treatment = TREATMENTS[treatment_id - 1]  # Convert 1-based to 0-based
            for attr_name, new_value in treatment['effects'].items():
                modified_row[attr_name] = new_value

        # Calculate before scores (from original attributes)
        original_df = pd.DataFrame([original_row])
        before_scores_df = calculate_cyclerap_score_native(original_df)
        before_scores = {
            "BB": float(before_scores_df["BB"].iloc[0]),
            "BP": float(before_scores_df["BP"].iloc[0]),
            "SB": float(before_scores_df["SB"].iloc[0]),
            "VB": float(before_scores_df["VB"].iloc[0]),
            "Overall Risk Level": float(before_scores_df["Overall Risk Level"].iloc[0])
        }

        # Calculate after scores (from modified attributes)
        modified_df = pd.DataFrame([modified_row])
        after_scores_df = calculate_cyclerap_score_native(modified_df)
        after_scores = {
            "BB": float(after_scores_df["BB"].iloc[0]),
            "BP": float(after_scores_df["BP"].iloc[0]),
            "SB": float(after_scores_df["SB"].iloc[0]),
            "VB": float(after_scores_df["VB"].iloc[0]),
            "Overall Risk Level": float(after_scores_df["Overall Risk Level"].iloc[0])
        }

        # Convert modified_row values to JSON-serializable types
        serializable_modified_row = {}
        for col, val in modified_row.items():
            if pd.notna(val):
                try:
                    if hasattr(val, 'item'):  # numpy/pandas scalar
                        serializable_modified_row[col] = val.item()
                    else:
                        serializable_modified_row[col] = val
                except (ValueError, TypeError):
                    serializable_modified_row[col] = None
            else:
                serializable_modified_row[col] = None

        return jsonify({
            "ok": True,
            "segment_index": segment_index,
            "modified_attributes": serializable_modified_row,
            "before_scores": before_scores,
            "after_scores": after_scores
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error previewing treatments: {str(e)}", 500)


@bp.post("/<project_name>/treatments/effectiveness")
def treatment_effectiveness(project_name: str):
    """
    Count, per treatment, how many segments in the project would have their
    Overall Risk Level Band *improve* (band decreases) if that treatment
    were applied in isolation. Used by the frontend to rank the
    "By Treatment" list top-down by effectiveness.

    Request body (optional):
        { "treatment_ids": [1, 2, 3, ...] }   # defaults to all 25

    Response:
        {
            "ok": true,
            "total_segments": 412,
            "counts": { "1": 180, "2": 0, "3": 45, ... }
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        data = request.get_json(silent=True) or {}
        requested_ids = data.get("treatment_ids")
        if requested_ids is None:
            requested_ids = [t["id"] for t in TREATMENTS]
        if not isinstance(requested_ids, list):
            return fail("treatment_ids must be a list", 400)

        attrs_df = ver.attributes.df
        n = len(attrs_df)
        if n == 0:
            return jsonify({"ok": True, "total_segments": 0, "counts": {str(tid): 0 for tid in requested_ids}})

        # Baseline scoring once
        before_df = calculate_cyclerap_score_native(attrs_df)
        before_band = before_df["Overall Risk Level Band"].to_numpy()

        treatment_map = {t["id"]: t for t in TREATMENTS}
        counts: dict[str, int] = {}

        for tid in requested_ids:
            if tid not in treatment_map:
                counts[str(tid)] = 0
                continue
            treatment = treatment_map[tid]

            # Applicability mask (vectorized): OR of trigger sets, AND within a set
            mask = pd.Series(False, index=attrs_df.index)
            for trigger_set in treatment.get("triggers", []):
                set_mask = pd.Series(True, index=attrs_df.index)
                for attr_name, valid_values in trigger_set.items():
                    if attr_name not in attrs_df.columns:
                        set_mask = pd.Series(False, index=attrs_df.index)
                        break
                    set_mask &= attrs_df[attr_name].isin(valid_values)
                mask |= set_mask

            if not mask.any():
                counts[str(tid)] = 0
                continue

            modified = attrs_df.copy()
            for attr_name, new_value in treatment.get("effects", {}).items():
                if attr_name in modified.columns:
                    modified.loc[mask, attr_name] = new_value
                else:
                    modified[attr_name] = None
                    modified.loc[mask, attr_name] = new_value

            after_df = calculate_cyclerap_score_native(modified)
            after_band = after_df["Overall Risk Level Band"].to_numpy()

            improved = ((after_band < before_band) & mask.to_numpy()).sum()
            counts[str(tid)] = int(improved)

        return jsonify({
            "ok": True,
            "total_segments": int(n),
            "counts": counts,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error computing treatment effectiveness: {str(e)}", 500)


@bp.get("/<project_name>/treatments/effectiveness/segment/<int:segment_index>")
def treatment_segment_effectiveness(project_name: str, segment_index: int):
    """
    For a single segment, compute the Overall Risk Level score drop for each
    treatment applied in isolation. Used by the frontend to rank the
    "By Segment" treatment list top-down by per-segment effectiveness.

    Response:
        {
            "ok": true,
            "score_drops": { "1": 4.2, "3": 0.0, ... }
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        attrs_df = ver.attributes.df
        n = len(attrs_df)
        if segment_index < 0 or segment_index >= n:
            return fail(f"segment_index {segment_index} out of range [0, {n})", 400)

        row_df = attrs_df.iloc[[segment_index]]
        before_score = float(calculate_cyclerap_score_native(row_df)["Overall Risk Level"].iloc[0])

        score_drops: dict[str, float] = {}
        for treatment in TREATMENTS:
            tid = treatment["id"]

            applicable = True
            for trigger_set in treatment.get("triggers", []):
                set_ok = True
                for attr_name, valid_values in trigger_set.items():
                    if attr_name not in row_df.columns:
                        set_ok = False
                        break
                    if row_df[attr_name].iloc[0] not in valid_values:
                        set_ok = False
                        break
                if set_ok:
                    break
            else:
                applicable = False

            if not applicable:
                score_drops[str(tid)] = 0.0
                continue

            modified = row_df.copy()
            for attr_name, new_value in treatment.get("effects", {}).items():
                if attr_name in modified.columns:
                    modified[attr_name] = new_value
                else:
                    modified[attr_name] = new_value

            after_score = float(calculate_cyclerap_score_native(modified)["Overall Risk Level"].iloc[0])
            score_drops[str(tid)] = round(before_score - after_score, 4)

        return jsonify({"ok": True, "score_drops": score_drops})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error computing segment treatment effectiveness: {str(e)}", 500)


@bp.get("/<project_name>/treatments/all")
def get_all_treatments(project_name: str):
    """
    Return treatment state for every segment in one call.

    Reads treatment.csv once and returns which segments have treatments and
    what modified attributes are stored.  Does NOT re-score — scores are
    calculated lazily per segment on demand.

    Response:
        {
            "ok": true,
            "segments": {
                "3":  { "has_treatments": true,  "treatments_applied": [1, 9], "modified_attributes": {...} },
                "17": { "has_treatments": true,  "treatments_applied": [5],    "modified_attributes": {...} }
            }
        }
    Only segments that actually have treatments are included.
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        treatment_df = ver.treatment.df
        attrs_df = ver.attributes.df

        segments: dict = {}

        if treatment_df is None or treatment_df.empty or "Treatments Applied" not in treatment_df.columns:
            return jsonify({"ok": True, "segments": segments})

        for idx, row in treatment_df.iterrows():
            treatments_str = row.get("Treatments Applied", "")
            if not treatments_str or pd.isna(treatments_str) or str(treatments_str).strip() == "":
                continue

            try:
                treatment_ids = [int(x.strip()) for x in str(treatments_str).split(",") if x.strip()]
            except ValueError:
                continue

            if not treatment_ids:
                continue

            modified_attributes: dict = {}
            for col in attrs_df.columns:
                if col in treatment_df.columns and col != "Treatments Applied":
                    val = row.get(col)
                    if pd.notna(val):
                        try:
                            modified_attributes[col] = val.item() if hasattr(val, 'item') else val
                        except (ValueError, TypeError):
                            modified_attributes[col] = None
                    else:
                        modified_attributes[col] = None

            segments[str(idx)] = {
                "has_treatments": True,
                "treatments_applied": treatment_ids,
                "modified_attributes": modified_attributes,
            }

        if segments:
            # Vectorized calculation of after_scores for all segments with treatments
            modified_rows = [v["modified_attributes"] for v in segments.values()]
            idx_keys = list(segments.keys())
            modified_df = pd.DataFrame(modified_rows)
            after_scores_df = calculate_cyclerap_score_native(modified_df)
            
            for i, idx_str in enumerate(idx_keys):
                after_scores = {
                    "BB": float(after_scores_df["BB"].iloc[i].item() if hasattr(after_scores_df["BB"].iloc[i], 'item') else after_scores_df["BB"].iloc[i]),
                    "BP": float(after_scores_df["BP"].iloc[i].item() if hasattr(after_scores_df["BP"].iloc[i], 'item') else after_scores_df["BP"].iloc[i]),
                    "SB": float(after_scores_df["SB"].iloc[i].item() if hasattr(after_scores_df["SB"].iloc[i], 'item') else after_scores_df["SB"].iloc[i]),
                    "VB": float(after_scores_df["VB"].iloc[i].item() if hasattr(after_scores_df["VB"].iloc[i], 'item') else after_scores_df["VB"].iloc[i]),
                    "Overall Risk Level": float(after_scores_df["Overall Risk Level"].iloc[i].item() if hasattr(after_scores_df["Overall Risk Level"].iloc[i], 'item') else after_scores_df["Overall Risk Level"].iloc[i])
                }
                segments[idx_str]["after_scores"] = after_scores

        return jsonify({"ok": True, "segments": segments})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error retrieving all treatments: {str(e)}", 500)


@bp.get("/<project_name>/treatments/segment/<int:segment_index>")
def get_segment_treatments(project_name: str, segment_index: int):
    """
    Get treatment state for a specific segment.

    Response:
        {
            "ok": true,
            "segment_index": 5,
            "has_treatments": true,
            "treatments_applied": [1, 9, 14],
            "modified_attributes": { "Facility Type": 4, ... },
            "after_scores": { "BB": 1.8, "BP": 0.9, "SB": 2.2, "VB": 3.5, "Overall Risk Level": 8.4 }
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        treatment_df = ver.treatment.df

        # Check if segment exists in treatment.csv
        if segment_index >= len(treatment_df):
            return jsonify({
                "ok": True,
                "segment_index": segment_index,
                "has_treatments": False,
                "treatments_applied": []
            })

        row = treatment_df.iloc[segment_index]

        # Check if "Treatments Applied" column exists and has data
        treatments_str = ""
        if "Treatments Applied" in treatment_df.columns:
            treatments_str = row.get("Treatments Applied", "")

        # If no treatments applied, return early
        if not treatments_str or pd.isna(treatments_str) or treatments_str.strip() == "":
            return jsonify({
                "ok": True,
                "segment_index": segment_index,
                "has_treatments": False,
                "treatments_applied": []
            })

        # Parse treatment IDs
        try:
            treatment_ids = [int(x.strip()) for x in treatments_str.split(",") if x.strip()]
        except ValueError:
            return jsonify({
                "ok": True,
                "segment_index": segment_index,
                "has_treatments": False,
                "treatments_applied": []
            })

        # Extract modified attributes from row
        modified_attributes = {}
        attrs_df = ver.attributes.df
        original_row = dict(attrs_df.iloc[segment_index])

        for col in attrs_df.columns:
            val_treatment = None
            if col in treatment_df.columns and col != "Treatments Applied":
                val_treatment = row.get(col)
                
            # If value in treatment_df is not null and not empty string, use it
            if pd.notna(val_treatment) and str(val_treatment).strip() != "":
                # Convert pandas types to Python native types for JSON serialization
                try:
                    if hasattr(val_treatment, 'item'):  # numpy/pandas scalar
                        val_treatment = val_treatment.item()
                    # Ensure we get a Python native type
                    if isinstance(val_treatment, (int, float, bool)):
                        modified_attributes[col] = val_treatment
                    else:
                        modified_attributes[col] = float(val_treatment)
                except (ValueError, TypeError):
                    modified_attributes[col] = original_row.get(col)
            else:
                # Fallback to the original baseline attributes if this column was untouched
                modified_attributes[col] = original_row.get(col)

        # Calculate after scores from modified attributes
        modified_df = pd.DataFrame([modified_attributes])
        after_scores_df = calculate_cyclerap_score_native(modified_df)

        # Extract scores safely with explicit type conversion
        after_scores = {
            "BB": float(after_scores_df["BB"].iloc[0].item() if hasattr(after_scores_df["BB"].iloc[0], 'item') else after_scores_df["BB"].iloc[0]),
            "BP": float(after_scores_df["BP"].iloc[0].item() if hasattr(after_scores_df["BP"].iloc[0], 'item') else after_scores_df["BP"].iloc[0]),
            "SB": float(after_scores_df["SB"].iloc[0].item() if hasattr(after_scores_df["SB"].iloc[0], 'item') else after_scores_df["SB"].iloc[0]),
            "VB": float(after_scores_df["VB"].iloc[0].item() if hasattr(after_scores_df["VB"].iloc[0], 'item') else after_scores_df["VB"].iloc[0]),
            "Overall Risk Level": float(after_scores_df["Overall Risk Level"].iloc[0].item() if hasattr(after_scores_df["Overall Risk Level"].iloc[0], 'item') else after_scores_df["Overall Risk Level"].iloc[0])
        }

        return jsonify({
            "ok": True,
            "segment_index": segment_index,
            "has_treatments": True,
            "treatments_applied": [int(x) if hasattr(x, 'item') else int(x) for x in treatment_ids],
            "modified_attributes": modified_attributes,
            "after_scores": after_scores
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error retrieving treatment state: {str(e)}", 500)


@bp.post("/<project_name>/treatments/apply-all")
def apply_all_treatments(project_name: str):
    """
    Apply all applicable recommended treatments to all segments within a project.

    This endpoint analyzes each segment, identifies applicable treatments,
    and applies all recommended treatments to it.

    Response:
        {
            "ok": true,
            "total_segments": 50,
            "segments_treated": 48,
            "segments_skipped": 2,
            "details": [
                {
                    "segment_index": 0,
                    "treatment_ids": [1, 9, 14],
                    "before_scores": { "BB": 2.5, ... },
                    "after_scores": { "BB": 1.8, ... }
                },
                ...
            ]
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        # Load attributes and treatment dataframes
        attrs_df = ver.attributes.df
        treatment_df = ver.treatment.df.copy()

        # Ensure treatment dataframe has all attribute columns
        for col in attrs_df.columns:
            if col not in treatment_df.columns:
                # Initialize column with None for all rows
                treatment_df[col] = None  # Use None first for proper pandas handling

        # Ensure treatment dataframe has same number of rows as attributes dataframe
        if len(treatment_df) < len(attrs_df):
            # Expand treatment dataframe to match attributes size
            new_rows = [treatment_df.iloc[0].copy() if len(treatment_df) > 0 else {}] * (len(attrs_df) - len(treatment_df))
            treatment_df = pd.concat([treatment_df, pd.DataFrame(new_rows)], ignore_index=True)

        # Helper function to get applicable treatments for a segment
        def get_applicable_treatments(attr_row):
            # Recreate the trigger logic from frontend
            applicable = []
            for treatment in TREATMENTS:
                for trigger_set in treatment.get("triggers", []):
                    # Check if all conditions in this trigger set are met
                    all_match = True
                    for attr_name, required_values in trigger_set.items():
                        if attr_name not in attr_row:
                            all_match = False
                            break
                        if attr_row[attr_name] not in required_values:
                            all_match = False
                            break

                    if all_match:
                        applicable.append(treatment)
                        break  # Only need one trigger set to match
            return applicable

        # Process each segment
        details = []
        total_treated = 0

        for segment_index in range(len(attrs_df)):
            try:
                original_row = dict(attrs_df.iloc[segment_index])

                # Get applicable treatments for this segment
                applicable_treatments = get_applicable_treatments(original_row)

                if not applicable_treatments:
                    continue  # Skip if no applicable treatments

                # Collect all treatment IDs for this segment
                treatment_ids = [t["id"] for t in applicable_treatments]

                # Apply treatment effects
                modified_row = original_row.copy()
                for treatment in applicable_treatments:
                    for attr_name, new_value in treatment['effects'].items():
                        modified_row[attr_name] = new_value

                # Calculate before scores
                original_df = pd.DataFrame([original_row])
                before_scores_df = calculate_cyclerap_score_native(original_df)
                before_scores = {
                    "BB": float(before_scores_df["BB"].iloc[0]),
                    "BP": float(before_scores_df["BP"].iloc[0]),
                    "SB": float(before_scores_df["SB"].iloc[0]),
                    "VB": float(before_scores_df["VB"].iloc[0]),
                    "Overall Risk Level": float(before_scores_df["Overall Risk Level"].iloc[0])
                }

                # Calculate after scores
                modified_df = pd.DataFrame([modified_row])
                after_scores_df = calculate_cyclerap_score_native(modified_df)
                after_scores = {
                    "BB": float(after_scores_df["BB"].iloc[0]),
                    "BP": float(after_scores_df["BP"].iloc[0]),
                    "SB": float(after_scores_df["SB"].iloc[0]),
                    "VB": float(after_scores_df["VB"].iloc[0]),
                    "Overall Risk Level": float(after_scores_df["Overall Risk Level"].iloc[0])
                }

                # Update treatment dataframe
                if len(treatment_df) <= segment_index:
                    new_rows = [treatment_df.iloc[0].copy() if len(treatment_df) > 0 else {}] * (segment_index - len(treatment_df) + 1)
                    treatment_df = pd.concat([treatment_df, pd.DataFrame(new_rows)], ignore_index=True)

                # Update the row with modified attributes
                for col in modified_row.keys():
                    if col in treatment_df.columns:
                        treatment_df.at[segment_index, col] = modified_row[col]

                # Update "Treatments Applied" column
                if "Treatments Applied" not in treatment_df.columns:
                    treatment_df.insert(0, "Treatments Applied", "")

                treatment_df.at[segment_index, "Treatments Applied"] = ",".join(str(tid) for tid in treatment_ids)

                # Record details
                details.append({
                    "segment_index": segment_index,
                    "treatment_ids": treatment_ids,
                    "before_scores": before_scores,
                    "after_scores": after_scores
                })

                total_treated += 1

            except Exception:
                continue

        # Mark treatment dataframe as dirty but don't save yet
        # User must click "Save" button to persist changes
        # Directly assign to the existing treatment object's df property
        # This sets df_dirty=True via the property setter
        ver.treatment.df = treatment_df
        # NOTE: NOT calling proj.save_all() here - changes will be saved only when user clicks Save

        return jsonify({
            "ok": True,
            "total_segments": int(len(attrs_df)),
            "segments_treated": int(total_treated),
            "segments_skipped": int(len(attrs_df) - total_treated),
            "details": details
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error applying all treatments: {str(e)}", 500)


@bp.post("/<project_name>/treatments/apply-specific")
def apply_specific_treatment(project_name: str):
    """
    Apply a specific treatment to all applicable segments within a project.

    This endpoint analyzes each segment, checks if the given treatment_id is applicable,
    and applies it if so.

    Response:
        {
            "ok": true,
            "total_segments": 50,
            "segments_treated": 48,
            "segments_skipped": 2,
            "details": [ ... ]
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()
        
        data = request.get_json(silent=True) or {}
        target_treatment_id = data.get("treatment_id")
        if not target_treatment_id:
            return fail("Missing treatment_id", 400)
            
        target_treatment = next((t for t in TREATMENTS if t["id"] == target_treatment_id), None)
        if not target_treatment:
            return fail(f"Invalid treatment_id: {target_treatment_id}", 400)

        attrs_df = ver.attributes.df
        treatment_df = ver.treatment.df.copy()

        if len(treatment_df) < len(attrs_df):
            new_rows = [{}] * (len(attrs_df) - len(treatment_df))
            treatment_df = pd.concat([treatment_df, pd.DataFrame(new_rows)], ignore_index=True)

        def is_treatment_applicable(attr_row, treatment):
            for trigger_set in treatment.get("triggers", []):
                all_match = True
                for attr_name, required_values in trigger_set.items():
                    if attr_name not in attr_row:
                        all_match = False
                        break
                    if attr_row[attr_name] not in required_values:
                        all_match = False
                        break
                if all_match:
                    return True
            return False

        for col in attrs_df.columns:
            if col not in treatment_df.columns:
                treatment_df[col] = None

        details = []
        total_treated = 0

        if "Treatments Applied" not in treatment_df.columns:
            treatment_df.insert(0, "Treatments Applied", "")

        for segment_index in range(len(attrs_df)):
            try:
                original_row = dict(attrs_df.iloc[segment_index])
                
                if not is_treatment_applicable(original_row, target_treatment):
                    continue
                
                existing_treatments_str = treatment_df.at[segment_index, "Treatments Applied"]
                existing_treatment_ids = []
                if pd.notna(existing_treatments_str) and str(existing_treatments_str).strip():
                    try:
                        existing_treatment_ids = [int(x.strip()) for x in str(existing_treatments_str).split(",") if x.strip()]
                    except ValueError:
                        pass
                
                if target_treatment_id in existing_treatment_ids:
                    continue # Already applied
                
                treatment_ids = existing_treatment_ids + [target_treatment_id]
                
                modified_row = original_row.copy()
                for tid in treatment_ids:
                    t_obj = next((t for t in TREATMENTS if t["id"] == tid), None)
                    if t_obj:
                        for attr_name, new_value in t_obj['effects'].items():
                            modified_row[attr_name] = new_value

                original_df = pd.DataFrame([original_row])
                before_scores_df = calculate_cyclerap_score_native(original_df)
                before_scores = {
                    "BB": float(before_scores_df["BB"].iloc[0]),
                    "BP": float(before_scores_df["BP"].iloc[0]),
                    "SB": float(before_scores_df["SB"].iloc[0]),
                    "VB": float(before_scores_df["VB"].iloc[0]),
                    "Overall Risk Level": float(before_scores_df["Overall Risk Level"].iloc[0])
                }

                modified_df = pd.DataFrame([modified_row])
                after_scores_df = calculate_cyclerap_score_native(modified_df)
                after_scores = {
                    "BB": float(after_scores_df["BB"].iloc[0]),
                    "BP": float(after_scores_df["BP"].iloc[0]),
                    "SB": float(after_scores_df["SB"].iloc[0]),
                    "VB": float(after_scores_df["VB"].iloc[0]),
                    "Overall Risk Level": float(after_scores_df["Overall Risk Level"].iloc[0])
                }

                for col in modified_row.keys():
                    if col in treatment_df.columns:
                        treatment_df.at[segment_index, col] = modified_row[col]

                treatment_df.at[segment_index, "Treatments Applied"] = ",".join(str(tid) for tid in treatment_ids)

                details.append({
                    "segment_index": segment_index,
                    "treatment_ids": treatment_ids,
                    "before_scores": before_scores,
                    "after_scores": after_scores
                })

                total_treated += 1

            except Exception:
                continue

        ver.treatment.df = treatment_df

        return jsonify({
            "ok": True,
            "total_segments": int(len(attrs_df)),
            "segments_treated": int(total_treated),
            "segments_skipped": int(len(attrs_df) - total_treated),
            "details": details
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error applying specific treatment: {str(e)}", 500)


@bp.post("/<project_name>/treatments/reset-all")
def reset_all_treatments(project_name: str):
    """
    Clear all applied treatments for all segments in a project.

    Response:
        {
            "ok": true,
            "total_segments": 50,
            "segments_reset": 48,
            "message": "All treatments have been reset"
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        # Load treatment dataframe
        treatment_df = ver.treatment.df.copy()

        # Ensure treatment dataframe has same number of rows as attributes dataframe
        attrs_df = ver.attributes.df
        if len(treatment_df) < len(attrs_df):
            # Expand treatment dataframe to match attributes size
            new_rows = [{}] * (len(attrs_df) - len(treatment_df))
            treatment_df = pd.concat([treatment_df, pd.DataFrame(new_rows)], ignore_index=True)

        # Count how many segments had treatments
        if "Treatments Applied" in treatment_df.columns:
            # fillna("") ensures NaNs become empty strings. astype(str) ensures everything is string.
            # str.strip() removes distinct whitespace.
            # Then we check if length > 0.
            # This handles: NaN, None, "", "   ".
            # It counts ANY row that has non-empty treatment string.
            applied_col = treatment_df["Treatments Applied"].fillna("").astype(str).str.strip()
            segments_reset = int((applied_col != "").sum())
        else:
            segments_reset = 0

        # Clear "Treatments Applied" column for all rows
        if "Treatments Applied" in treatment_df.columns:
            treatment_df["Treatments Applied"] = ""

        # Reset all attribute columns to original values from attributes.csv
        attrs_df = ver.attributes.df
        for col in treatment_df.columns:
            if col != "Treatments Applied" and col in attrs_df.columns:
                # Copy original attribute values from attributes.csv
                if col in attrs_df.columns:
                    treatment_df[col] = attrs_df[col].values

        # Mark treatment dataframe as dirty but don't save yet
        # User must click "Save" button to persist changes
        # Directly assign to the existing treatment object's df property
        # This sets df_dirty=True via the property setter
        ver.treatment.df = treatment_df
        # NOTE: NOT calling proj.save_all() here - changes will be saved only when user clicks Save

        return jsonify({
            "ok": True,
            "total_segments": int(len(treatment_df)),
            "segments_reset": segments_reset,
            "message": "All treatments have been reset"
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error resetting treatments: {str(e)}", 500)


@bp.post("/<project_name>/treatments/save")
def save_treatments(project_name: str):
    """
    Save all pending treatment changes to treatment.csv

    Response:
        {
            "ok": true,
            "message": "Treatments saved successfully"
        }
    """
    try:
        ctx = get_ctx()
        proj: Project = ctx["pm"].project(project_name)
        ver = proj.latest()

        # Save all pending changes
        proj.save_all()

        # Update last_updated
        proj.metadata.last_updated = datetime.datetime.now()
        proj.metadata.serialize(proj.project_path)

        return jsonify({
            "ok": True,
            "message": "Treatments saved successfully"
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return fail(f"Error saving treatments: {str(e)}", 500)


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

    # Convert incoming rows to DataFrame
    new_attrs_df = pd.DataFrame(rows)

    # Get latest version for updating
    ver = proj.latest()

    # --- INJECTED LOGIC: Calculate Scores & Persist Bands ---
    try:
        # 1. Convert types for scoring
        scoring_df = _convert_attribute_types(new_attrs_df)
        
        # 2. Calculate scores (native Python implementation)
        results_df = calculate_cyclerap_score_native(scoring_df)

        # --- FIX: Persist numeric scores to results.csv ---
        # The previous code calculated scores but only used them to update "Bands" in attributes.csv.
        # It failed to save the actual numeric scores to results.csv, causing the frontend to show old data.
        if ver._results is None:
            ver._results = serializer.Results()
        
        ver.results.df = results_df
             
        # --------------------------------------------------

        # 3. Extract Band columns
        # We want to keep "Overall Risk Level Band" and individual bands like "BB Band", "VB Band", etc.
        band_cols = [col for col in results_df.columns if col.endswith(" Band")]
        
        # 4. Merge/Overwrite bands in the main attributes DataFrame
        # We assume strict row alignment index-by-index (0 to N-1)
        if len(results_df) == len(new_attrs_df):
            for col in band_cols:
                new_attrs_df[col] = results_df[col].values
        else:
            pass  # row count mismatch: skip band persistence
            
    except Exception:
        traceback.print_exc()
        # Non-blocking: proceed to save attributes even if scoring fails
    # --------------------------------------------------------

    # Write to the latest version
    ver.attributes.df = new_attrs_df
    ver.attributes.df_dirty = True
    proj.save_all()  # If a day rolls over, a new version may be created

    # Update last_updated
    proj.metadata.last_updated = datetime.datetime.now()
    proj.metadata.serialize(proj.project_path)

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
    Body: { "project_name": "My Project", "folder_name": "SomeFolder", "tags": ["tag1", "tag2"] }
    """
    data = request.get_json(silent=True) or {}
    project_name = (data.get("project_name") or "").strip()
    folder_name = data.get("folder_name")
    tags = data.get("tags", [])

    if not project_name:
        return fail("project_name is required", 400)
    if "_" in project_name:
        return fail("Project name cannot contain underscores (_)", 400)
    if not folder_name:
        return fail("folder_name is required", 400)

    # Validate tags is a list
    if not isinstance(tags, list):
        return fail("tags must be an array", 400)

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
    pm.create_project(project_name, extracted_geo_data, folder_name, tags=tags)

    return ok({"ok": True, "name": project_name})

@bp.post("/folders/upload-images")
def upload_images_to_source_folder():
    """
    Upload images to a source folder in the /in directory.
    POST /api/projects/folders/upload-images
    """
    ctx = get_ctx()
    pm = ctx["pm"]

    try:
        # Get folder name from request
        folder_name = request.form.get('folder_name')
        if not folder_name or not folder_name.strip():
            return fail("Folder name is required", 400)

        folder_name = folder_name.strip()

        # Get the source folder path (in directory)
        source_dir: Path = pm.in_path / folder_name
        source_dir.mkdir(parents=True, exist_ok=True)

        # Get uploaded files
        if 'images' not in request.files:
            return fail("No image files provided", 400)

        uploaded_files = request.files.getlist('images')
        if not uploaded_files:
            return fail("No image files provided", 400)

        count = 0
        errors = []

        # Allowed image extensions
        allowed_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'}

        for file in uploaded_files:
            if file.filename == '':
                errors.append("Empty filename")
                continue

            # Validate file extension
            file_ext = Path(file.filename).suffix.lower()
            if file_ext not in allowed_extensions:
                errors.append(f"Invalid file type: {file.filename}")
                continue

            try:
                # To prevent directory traversal attacks, resolve relative paths securely
                # file.filename could be "folder/img.jpg" or just "img.jpg"
                clean_path = Path(file.filename)
                
                # Check for malicious paths (e.g. ones with '..')
                if '..' in clean_path.parts or clean_path.is_absolute():
                    errors.append(f"Invalid file path: {file.filename}")
                    continue

                # Save file to source folder, preserving any subdirectories
                file_path = source_dir / clean_path
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file.save(str(file_path))
                count += 1
            except Exception as e:
                errors.append(f"Failed to save {file.filename}: {str(e)}")

        return ok({
            "count": count,
            "errors": errors,
            "message": f"Uploaded {count} image(s) to folder '{folder_name}'"
        })

    except Exception as e:
        traceback.print_exc()
        return fail(f"Error uploading images: {e}", 500)

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

@bp.patch("/<project_name>")
def update_project_metadata(project_name: str):
    """
    Update project metadata (name, tags, verified status, and/or verified segment count):
    PATCH /api/projects/<project_name>
    Body: { "new_name": "...", "tags": [...], "verified": true/false, "verified_segment_count": 0 }
    """
    ctx = get_ctx()
    pm = ctx["pm"]

    try:
        payload = request.get_json(force=True, silent=True) or {}
        new_name = payload.get("new_name")
        new_tags = payload.get("tags")
        new_verified = payload.get("verified")
        new_verified_segment_count = payload.get("verified_segment_count")
        new_autocoded_segment_count = payload.get("autocoded_segment_count")

        # While YOLO inference is running, skip all disk I/O to avoid holding
        # the GIL and slowing down inference (10-20x overhead observed).
        # Name renames are never batched by the frontend during autocode, so
        # it is safe to defer counter/tag updates until inference finishes.
        if _INFERENCE_DEPTH > 0 and new_name is None:
            return ok({"ok": True, "deferred": True})

        # Get the project
        try:
            proj = pm.project(project_name)
        except KeyError:
            return fail("Project not found", 404)

        # Check if any metadata needs updating
        metadata_updated = False

        # Update tags if provided
        if new_tags is not None:
            if not isinstance(new_tags, list):
                return fail("Tags must be an array", 400)
            proj.metadata.tags = new_tags
            metadata_updated = True

        # Update verified status if provided
        if new_verified is not None:
            proj.metadata.verified = bool(new_verified)
            metadata_updated = True

        # Update verified segment count if provided
        if new_verified_segment_count is not None:
            proj.metadata.verified_segment_count = int(new_verified_segment_count)
            metadata_updated = True

        # Update autocoded segment count if provided
        if new_autocoded_segment_count is not None:
            proj.metadata.autocoded_segment_count = int(new_autocoded_segment_count)
            metadata_updated = True

        # Serialize once after all metadata updates
        if metadata_updated:
            proj.metadata.last_updated = datetime.datetime.now()
            proj.metadata.serialize(proj.project_path)

        # Update name if provided (requires renaming directory)
        if new_name and new_name != project_name:
            if not new_name.strip():
                return fail("New name cannot be empty", 400)

            # Check if new name already exists
            if new_name in pm.list_names():
                return fail(f"Project '{new_name}' already exists", 400)

            # Rename the directory
            old_path = proj.project_path
            new_path = old_path.parent / new_name

            try:
                old_path.rename(new_path)

                # Rename images inside the project folder
                try:
                    import re
                    images_dir = new_path / global_var.PROJECT_IMAGES_FOLDER
                    if images_dir.exists() and images_dir.is_dir():
                        for img_file in images_dir.iterdir():
                            if img_file.is_file():
                                match = re.search(r"(?:^|_)(Cam\d+.*)", img_file.name, re.IGNORECASE)
                                if match:
                                    suffix = match.group(1)
                                    new_filename = f"{new_name}_{suffix}"
                                    
                                    if new_filename != img_file.name:
                                        img_file.rename(images_dir / new_filename)
                except Exception:
                    pass

                # Update metadata
                proj.project_path = new_path
                proj.metadata.project_name = new_name

                # --- Update Internal Paths & Image References ---
                # 1. Update paths for all versions so they point to the new directory
                if proj.versions:
                    for v in proj.versions:
                        # v.path is absolute, so we must rebase it to the new project path
                        # Current v.path: .../OldName/versions/YYYYMMDD
                        # New v.path:     .../NewName/versions/YYYYMMDD
                        v.path = new_path / "versions" / v.path.name

                # 2. Update Image References in DataFrames to match new filenames
                def update_image_ref_in_df(df, col_name):
                    if col_name not in df.columns:
                        return False
                    
                    def _update_ref(ref):
                        if not isinstance(ref, str): return ref
                        # Use same regex as file renaming
                        match = re.search(r"(?:^|_)(Cam\d+.*)", ref, re.IGNORECASE)
                        if match:
                            suffix = match.group(1)
                            new_ref = f"{new_name}_{suffix}"
                            return new_ref
                        return ref
                    
                    # Check if any change is needed to avoid unnecessary writes
                    # But easiest is just to apply
                    df[col_name] = df[col_name].apply(_update_ref)
                    return True

                try:
                    # A. Attributes (Latest Version)
                    latest_ver = proj.latest()
                    if update_image_ref_in_df(latest_ver.attributes.df, "Image reference"):
                         latest_ver.attributes.df_dirty = True
                    
                    # B. Treatment (Latest Version)
                    if update_image_ref_in_df(latest_ver.treatment.df, "Image Reference"):
                        latest_ver.treatment.df_dirty = True
                    
                    # C. Geo Data (Project Level)
                    # Force load geo_data from the new path
                    if update_image_ref_in_df(proj.geo_data.df, "Image Reference"):
                        proj.geo_data.df_dirty = True
                        
                    # Save all changes
                    proj.save_all()
                    
                except Exception as data_e:
                    traceback.print_exc()

                proj.metadata.last_updated = datetime.datetime.now()
                proj.metadata.serialize(new_path)

                # Reload the project list to reflect the changes
                pm.projects = [
                    Project(p) for p in pm.des_path.iterdir() if p.is_dir()
                ]

            except Exception as e:
                return fail(f"Failed to rename project: {e}", 500)

        return ok({
            "ok": True,
            "name": new_name if new_name else project_name,
            "tags": proj.metadata.tags or [],
            "verified": proj.metadata.verified,
            "verified_segment_count": proj.metadata.verified_segment_count,
            "autocoded_segment_count": proj.metadata.autocoded_segment_count
        })

    except Exception as e:
        traceback.print_exc()
        return fail(f"Update failed: {e}", 500)

@bp.post("/<project_name>/autocode/image")
def autocode_image(project_name: str):
    print(f"[Autocode] >>> autocode_image called for project='{project_name}'", flush=True)
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

        skip_obstacles = bool(payload.get("skipObstacles", False))
        print(f"[Autocode] CV inference: {image_ref} (skip_obstacles={skip_obstacles})", flush=True)
        global _INFERENCE_DEPTH
        _INFERENCE_DEPTH += 1
        try:
            updates = cv_pred.CycleRAP_Coding_Helper.autocode(img_path, skip_obstacles=skip_obstacles) or {}
        finally:
            _INFERENCE_DEPTH -= 1
        updates = {k: v for k, v in updates.items() if v is not None}
        print(f"[Autocode] CV done: {image_ref} → {len(updates)} field(s) set", flush=True)

        # Inject Grade from pre-computed LAZ gradient lookup (no-op if not available)
        gradient_pct = _inject_grade(image_ref, updates, project_name=project_name)

        # Return both updates and changed_fields for change tracking/highlighting in UI
        # changed_fields: list of field names that were updated by CV model
        resp: dict = {"updates": updates, "changed_fields": list(updates.keys())}
        if gradient_pct is not None:
            resp["gradient_pct"] = round(gradient_pct, 3)
        return ok(resp)

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"autocode_image error: {e}", 500)


@bp.post("/<project_name>/autocode/gis")
def autocode_gis(project_name: str):
    try:
        payload = request.get_json(force=True, silent=True) or {}
        coords = payload.get("coords")  # [[lon, lat], ...]

        if not coords or not isinstance(coords, list) or not isinstance(coords[0], list):
            return fail("coords (LineString) is required", 400)

        # Segment starting point (WGS84) - first coordinate of the segment
        start_lon, start_lat = coords[0]
        from shapely.geometry import Point
        pt = Point(start_lon, start_lat)

        # Optional field filter: when provided (bulk per-attribute mode), skip GIS queries
        # whose output field is not in the set. None means run everything (full autocode,
        # single-segment manual button from the frontend).
        fields_filter = payload.get("fields")
        if fields_filter and not isinstance(fields_filter, list):
            fields_filter = None
        _needs = lambda *flds: not fields_filter or any(f in fields_filter for f in flds)

        _gis = _get_gis()

        updates: dict[str, int | float] = {}

        # Rules
        if _needs("Peak pedestrian flow along or across facility") and _gis.is_mrt(pt):
            updates["Peak pedestrian flow along or across facility"] = 3
        if _needs("Heavy vehicle flow") and _gis.is_bus_lane(pt):
            updates["Heavy vehicle flow"] = 2
        if _needs("Adjacent Vehicle Parking 0-1m") and _gis.is_parking(pt):
            updates["Adjacent Vehicle Parking 0-1m"] = 1
        if _needs("Peak pedestrian flow along or across facility") and _gis.is_bus_stop(pt):
            # overrides 3 → 2
            updates["Peak pedestrian flow along or across facility"] = 2

        # Pedestrian Crossing Detection
        # Set to Present (1) if within 5m of bus stop OR road crossing
        if _needs("Pedestrian Crossing") and (
            _gis.is_bus_stop(pt, dist=10)
            or _gis.is_road_crossing(pt, dist=10)
            or _gis.is_mrt(pt, dist=10)
        ):
            updates["Pedestrian Crossing"] = 1  # 1 = Present

        # Bicycle Crossing Facility Detection
        # Set Crossing Facility = Present (1) and Crossing Type = "Bicycle Crossing"
        # if within 2m of a known bicycle crossing point (AMG_BC2025_shp)
        if _needs("Crossing Facility", "Crossing Type") and _gis.is_bicycle_crossing(pt, dist=2):
            updates["Crossing Facility"] = 1          # 1 = Present
            updates["Crossing Type"] = "Bicycle Crossing"

        # Intersecting Bicycle Facility Detection
        # Present (1) if within 5m of a road crossing; Not Present (2) otherwise.
        # CV will override to Not Present (2) if a dominant traffic/zebra crossing mask is detected.
        if _needs("Intersecting Bicycle Facility"):
            if _gis.is_road_crossing(pt, dist=5):
                updates["Intersecting Bicycle Facility"] = 1  # 1 = Present
            else:
                updates["Intersecting Bicycle Facility"] = 2  # 2 = Not Present

        if _needs("Area type"):
            area = _gis.get_area_type(pt)
            updates["Area type"] = int(area)

        if _needs("Road AADT"):
            updates["Road AADT"] = 6000

        if _needs("Peak bicycle/LV traffic flow", "Peak pedestrian flow along or across facility"):
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

        # Added for Road Operating Speed (mean)
        # Calculate road operating speed based on nearest road link
        if _needs("Road operating speed (mean)"):
            road_speed = _gis.get_road_operating_speed(pt, buffer_dist=20, max_dist=30, default_speed=30.0)
            updates["Road operating speed (mean)"] = road_speed

        # Added for Road Speed Limit
        # Calculate road speed limit based on nearest speed limit segment
        if _needs("Road speed limit"):
            speed_limit = _gis.get_road_speed_limit(pt, buffer_dist=20, max_dist=30, default_limit=10)
            updates["Road speed limit"] = speed_limit

        # Added for Heavy Vehicle Flow
        # Calculate heavy vehicle flow based on proximity to bus lanes
        if _needs("Heavy vehicle flow"):
            heavy_vehicle_flow = _gis.get_heavy_vehicle_flow(pt, buffer_dist=15, max_dist=15, default_value=1)
            updates["Heavy vehicle flow"] = heavy_vehicle_flow

        # Added for Curvature
        # Calculate curvature using actual path centerline shapefiles
        # Uses two-stage process from original PathAssignmentTool:
        #   Stage 1: Expanding ring (1m→5m) to find nearest path
        #   Stage 2: Fixed 5m window to calculate curvature from that path
        if _needs("Curvature", "Curvature Sub-category"):
            curvature, curvature_subcat = _gis.get_curvature(pt, sharp_turn_threshold=10.0, default_value=2)
            updates["Curvature"] = curvature
            if curvature_subcat is not None:
                updates["Curvature Sub-category"] = curvature_subcat

        # Added for Facility Width per Direction
        # Calculate facility width using expanding ring search on path centerline shapefiles
        if _needs("Facility Width per Direction", "Facility Width Sub-category"):
            facility_width, width_subcat = _gis.get_facility_width(pt, start_radius=2.0, max_radius=10.0, step_size=2.0, default_value=2)
            updates["Facility Width per Direction"] = facility_width
            if width_subcat is not None:
                updates["Facility Width Sub-category"] = width_subcat

        # Added for Number of lanes – adjacent road
        # Look up the LANES attribute from the nearest kerb line within 20 m
        if _needs("Number of lanes – adjacent road"):
            nol = _gis.get_number_of_lane(pt, dist=20)
            if nol is not None:
                updates["Number of lanes – adjacent road"] = nol

        # Return both updates and changed_fields for change tracking/highlighting in UI
        # changed_fields: list of field names that were updated by GIS rules
        return ok({"updates": updates, "changed_fields": list(updates.keys())})

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"autocode_gis error: {e}", 500)


@bp.post("/<project_name>/curvature/visualize")
def get_curvature_visualization(project_name: str):
    """
    Generate visualization data for curvature analysis at a specific segment.

    This endpoint returns all the data needed to display an interactive map showing:
    - The analysis point (segment starting location)
    - The 5-meter analysis window (circular buffer)
    - Path centerlines within the window (color-coded by type)
    - Calculated curvature radius and path width values

    Request body:
        {
            "coords": [[lon, lat], ...],  // Segment LineString coordinates
            "index": 0  // Optional: segment index for reference
        }

    Response:
        {
            "ok": true,
            "point": {
                "lon": 103.8198,
                "lat": 1.3521
            },
            "radius": 8.3,  // Minimum curvature radius in meters (null if not found)
            "width": 2.5,   // Path width in meters (null if not found)
            "curvature": 1, // Curvature category (1=Sharp Turn, 2=No Sharp Turn)
            "circle_geojson": {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[lon, lat], ...]]
                },
                "properties": {
                    "radius_m": 5.0,
                    "style": {"color": "#000000", "weight": 2, "fill": false}
                }
            },
            "paths": [
                {
                    "type": "cycling",
                    "color": [0, 180, 0],
                    "coordinates": [[lon, lat], ...],
                    "is_analysis_layer": true
                },
                ...
            ],
            "layer_used": "cycling",  // Which layer provided the data
            "analysis_window_m": 5.0
        }

    Error Response:
        {
            "error": "coords (LineString) is required"
        }
    """
    try:
        payload = request.get_json(force=True, silent=True) or {}
        coords = payload.get("coords")  # [[lon, lat], ...]

        if not coords or not isinstance(coords, list) or not isinstance(coords[0], list):
            return fail("coords (LineString) is required", 400)

        # Segment starting point (WGS84) - first coordinate of the segment
        start_lon, start_lat = coords[0]
        from shapely.geometry import Point
        pt = Point(start_lon, start_lat)

        _gis = _get_gis()

        # Generate visualization data
        viz_data = _gis.get_curvature_visualization(pt, collect_radius=5.0)

        # Calculate curvature category for display
        curvature = 2  # Default: No Sharp Turn
        if viz_data["radius"] is not None and viz_data["radius"] < 10.0:
            curvature = 1  # Sharp Turn Present

        # Add curvature category to response
        viz_data["curvature"] = curvature
        viz_data["ok"] = True

        return ok(viz_data)

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"curvature visualization error: {e}", 500)


@bp.post("/<project_name>/width/visualize")
def get_width_visualization(project_name: str):
    """
    Generate visualization data for facility width analysis at a specific segment.

    This endpoint returns all the data needed to display an interactive map showing:
    - The analysis point (segment starting location)
    - Expanding ring search pattern (1m to 10m radii)
    - Path centerlines within view (color-coded by type)
    - Which radius found the width value
    - Calculated width value and category

    Request body:
        {
            "coords": [[lon, lat], ...],  // Segment LineString coordinates
            "index": 0  // Optional: segment index for reference
        }

    Response:
        {
            "ok": true,
            "point": {"lon": 103.8198, "lat": 1.3521},
            "width": 2.5,  // Width in meters (null if not found)
            "width_category": 2,  // 1=Very Narrow, 2=Narrow, 3=Wide
            "search_info": {
                "found_at_radius": 2.0,  // meters
                "layer_used": "cycling",
                "total_radii_checked": 5
            },
            "search_rings": [
                {
                    "radius": 2.0,
                    "center": [lon, lat],
                    "candidates_by_layer": {"cycling": 1, "shared": 0, "footpath": 0},
                    "width_locked": true
                },
                ...
            ],
            "paths": [
                {
                    "type": "cycling",
                    "color": [0, 180, 0],
                    "coordinates": [[lon, lat], ...],
                    "is_analysis_layer": true,
                    "width_value": 2.5
                },
                ...
            ],
            "width_distribution": {
                "cycling": {"min": 0.5, "max": 9.0, "count": 1437},
                "shared": {"min": 0.4, "max": 11.3, "count": 4531},
                "footpath": {"min": 0.04, "max": 33.3, "count": 179483}
            }
        }
    """
    try:
        payload = request.get_json(force=True, silent=True) or {}
        coords = payload.get("coords")  # [[lon, lat], ...]

        if not coords or not isinstance(coords, list) or not isinstance(coords[0], list):
            return fail("coords (LineString) is required", 400)

        # Segment starting point (WGS84)
        start_lon, start_lat = coords[0]
        pt = Point(start_lon, start_lat)

        _gis = _get_gis()

        # Generate visualization data
        viz_data = _gis.get_width_visualization(pt, start_radius=1.0, max_radius=10.0, step=1.0)

        viz_data["ok"] = True
        return ok(viz_data)

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"width visualization error: {e}", 500)


@bp.post("/<project_name>/gis/layers")
def get_gis_layers(project_name: str):
    """
    Fetch GIS layer paths near a point for map visualization on the coding page.

    This endpoint provides cycling paths, footpaths, shared paths, and road crossings within
    a specified radius of a point to show GIS layer context on the coding map.
    NOTE: This endpoint uses GIS only — no CV models are required.

    Request body:
        {
            "point": [lon, lat],  // Center point (WGS84)
            "radius": 100,        // Search radius in meters (default: 100m)
            "layers": ["cycling", "shared", "footpath", "roadcrossing"]  // Optional: which layers to fetch
        }

    Response:
        {
            "ok": true,
            "point": {"lon": 103.8198, "lat": 1.3521},
            "radius": 100,
            "layers": {
                "cycling": [
                    {
                        "coordinates": [[lon, lat], ...],  // LineString in WGS84
                        "properties": {"width": 2.5}  // if available
                    },
                    ...
                ],
                "shared": [...],
                "footpath": [...],
                "roadcrossing": [...]
            }
        }
    """
    try:
        payload = request.get_json(force=True, silent=True) or {}
        point_coords = payload.get("point", [])
        radius = payload.get("radius", 200)  # Default 200m radius
        requested_layers = payload.get("layers", ["cycling", "shared", "footpath"])

        if not point_coords or len(point_coords) != 2:
            return fail("point [lon, lat] is required", 400)

        lon, lat = point_coords
        pt = Point(lon, lat)

        _gis = _get_gis()
        pt_metric = _gis.store.to_metric_point(pt)

        # Create buffer for spatial query
        buffer_geom = pt_metric.buffer(radius)

        # Layer name mapping
        layer_names = {
            "cycling": "cycling_path",
            "shared": "shared_path",
            "footpath": "footpath",
            "roadcrossing": "roadcrossing",
            "mrt_exit": "mrt",
            "bus_stop": ["bus_stop", "bus_shelter"], # Try both
            "bus_lane": "bus_lane",
            "parking_lot": "parking",
            "kerb_line": "kerb_line",
            "bicycle_crossing": "bicycle_crossing"
        }

        result_layers = {}

        for layer_key in requested_layers:
            if layer_key not in layer_names:
                continue

            layer_targets = layer_names[layer_key]
            if not isinstance(layer_targets, list):
                layer_targets = [layer_targets]

            all_features = []
            for layer_name in layer_targets:
                try:
                    gdf = _gis.store.get(layer_name)
                    if gdf is None or gdf.empty:
                        print(f"[GIS] Layer '{layer_key}' sub-layer '{layer_name}': empty or None — skipped")
                        continue

                    # Spatial query using the CACHED sindex (fast, read-only)
                    candidate_indices = list(gdf.sindex.intersection(buffer_geom.bounds))

                    if not candidate_indices:
                        print(f"[GIS] Layer '{layer_key}' sub-layer '{layer_name}': 0 candidates in spatial index (total features: {len(gdf)})")
                        continue

                    candidates = gdf.iloc[candidate_indices]
                    intersecting = candidates[candidates.geometry.notna() & candidates.intersects(buffer_geom)]

                    print(f"[GIS] Layer '{layer_key}' sub-layer '{layer_name}': {len(intersecting)} intersecting features found (candidates: {len(candidates)})")

                    if intersecting.empty:
                        continue

                    # Copy only the small result set, then convert to WGS84
                    intersecting_wgs84 = intersecting.copy().to_crs("EPSG:4326")

                    for _, feature in intersecting_wgs84.iterrows():
                        geom = feature.geometry
                        if geom is None or geom.is_empty:
                            continue

                        # Strip Z if present (on single geometry, negligible cost)
                        if geom.has_z:
                            try:
                                geom = gis.GIS._remove_z_coordinate(geom)
                            except Exception:
                                pass

                        # Extract properties
                        props = {}
                        if "WIDTH" in feature.index:
                            width_val = feature["WIDTH"]
                            if width_val is not None and not (isinstance(width_val, float) and math.isnan(width_val)):
                                props["width"] = float(width_val)
                        
                        for col in feature.index:
                            if col not in ["geometry", "WIDTH"]:
                                val = feature[col]
                                if val is not None and not (isinstance(val, float) and math.isnan(val)):
                                    props[col] = str(val)

                        # Extract coordinates based on geometry type
                        geom_output_type = None
                        coords = []
                        
                        if geom.geom_type == "LineString":
                            coords = [[float(x), float(y)] for x, y in geom.coords]
                            geom_output_type = "line"
                        elif geom.geom_type == "MultiLineString":
                            for line in geom.geoms:
                                all_features.append({
                                    "coordinates": [[float(x), float(y)] for x, y in line.coords],
                                    "properties": props,
                                    "geometry_type": "line"
                                })
                            continue
                        elif geom.geom_type == "Point":
                            coords = [[float(geom.x), float(geom.y)]]
                            geom_output_type = "point"
                        elif geom.geom_type == "MultiPoint":
                            for pt_geom in geom.geoms:
                                all_features.append({
                                    "coordinates": [[float(pt_geom.x), float(pt_geom.y)]],
                                    "properties": props,
                                    "geometry_type": "point"
                                })
                            continue
                        elif geom.geom_type == "Polygon":
                            coords = [[float(x), float(y)] for x, y in geom.exterior.coords]
                            geom_output_type = "polygon"
                        elif geom.geom_type == "MultiPolygon":
                            for poly in geom.geoms:
                                all_features.append({
                                    "coordinates": [[float(x), float(y)] for x, y in poly.exterior.coords],
                                    "properties": props,
                                    "geometry_type": "polygon"
                                })
                            continue
                        else:
                            continue

                        if geom_output_type and coords:
                            all_features.append({
                                "coordinates": coords,
                                "geometry_type": geom_output_type,
                                "properties": props
                            })

                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    print(f"Error processing sub-layer '{layer_name}': {e}")

            result_layers[layer_key] = all_features

        # Build response
        layer_summary = {k: len(v) for k, v in result_layers.items()}
        print(f"[GIS] Response: {layer_summary}")

        response = {
            "ok": True,
            "point": {"lon": lon, "lat": lat},
            "radius": radius,
            "layers": result_layers
        }

        return ok(response)

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"GIS layers error: {e}", 500)

@bp.route("/<projectName>/gis/detect", methods=["POST"])
def detect_nearby_gis(projectName):
    """
    Diagnostic endpoint to auto-detect nearby bus stops and bus lanes within 200m.
    """
    try:
        data = request.json
        lon, lat = data.get("point", [0, 0])
        search_radius = 200  # 200m as requested
        
        _gis = _get_gis()
        from shapely.geometry import Point
        import pyproj
        
        # Project to SVY21
        transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3414", always_xy=True)
        svy21_x, svy21_y = transformer.transform(lon, lat)
        current_pt = Point(svy21_x, svy21_y)
        buffer_geom = current_pt.buffer(search_radius)

        results = {
            "bus_stop": {"found": False, "distance": None},
            "bus_lane": {"found": False, "distance": None}
        }

        # Bus Stops
        for layer_name in ["bus_stop", "bus_shelter"]:
            gdf = _gis.store.get(layer_name)
            if gdf is not None:
                intersecting = gdf[gdf.intersects(buffer_geom)]
                for _, row in intersecting.iterrows():
                    d = current_pt.distance(row.geometry)
                    if results["bus_stop"]["distance"] is None or d < results["bus_stop"]["distance"]:
                        results["bus_stop"] = {"found": True, "distance": round(float(d), 2)}

        # Bus Lanes
        gdf_lane = _gis.store.get("bus_lane")
        if gdf_lane is not None:
            intersecting = gdf_lane[gdf_lane.intersects(buffer_geom)]
            for _, row in intersecting.iterrows():
                d = current_pt.distance(row.geometry)
                if results["bus_lane"]["distance"] is None or d < results["bus_lane"]["distance"]:
                    results["bus_lane"] = {"found": True, "distance": round(float(d), 2)}

        return jsonify({"ok": True, "results": results})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


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
        want_stream: bool = bool(payload.get("stream", False))

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

        # Fields produced EXCLUSIVELY by GIS (autocode_gis). CV never produces these.
        # Safe to skip CV inference when ALL requested fields are in this set.
        # NOTE: "Peak pedestrian flow along or across facility" is intentionally EXCLUDED —
        # GIS conditionally overrides CV for that field; if GIS doesn't fire (not near MRT/bus
        # stop), the CV-computed default is the correct final value, so CV must still run.
        _GIS_ONLY_FIELDS: frozenset = frozenset({
            "Area type",
            "Road AADT",
            "Road operating speed (mean)",
            "Road speed limit",
            "Curvature",
            "Curvature Sub-category",
            "Facility Width per Direction",
            "Facility Width Sub-category",
            "Heavy vehicle flow",
            "Adjacent Vehicle Parking 0-1m",
            "Pedestrian Crossing",
            "Peak bicycle/LV traffic flow",
            "Grade",  # from LAZ gradient lookup, not from CV
            "Number of lanes – adjacent road",  # from kerb_line shapefile LANES column
        })

        def _call_autocode_pair(image_ref: str, coords, skip_cv: bool = False, skip_gis: bool = False, skip_obstacles: bool = False, fields_filter: "list | None" = None):
            """
            Call CV and/or GIS autocoding for a single image and merge results.

            This function orchestrates the complete auto-coding process:
            1. Calls autocode_image (CV model) to analyze the photo   [skippable]
            2. Calls autocode_gis (GIS rules) to analyze the location [skippable]
            3. Merges updates (GIS overrides CV if both set the same field)
            4. Tracks the source (CV or GIS) for each updated field

            Args:
                image_ref: Image filename (e.g., "ProjectName_IMG_001.jpg")
                coords: LineString coordinates as [[lon, lat], ...] for GIS analysis
                skip_cv: If True, skip CV inference entirely (safe when all requested
                         fields are in _GIS_ONLY_FIELDS — CV never produces them)
                skip_gis: If True, skip GIS queries entirely
                skip_obstacles: If True, skip the obstacle detector model (second YOLO
                         pass) — safe when no obstacle-related fields are requested

            Returns:
                tuple: (merged_updates, sources, error)
                    - merged_updates: dict of {field_name: code_value}
                    - sources: dict of {field_name: "CV" or "GIS"}
                    - error: None if success, error message string if failed
            """
            img_updates: dict = {}
            if not skip_cv:
                # Call CV auto-coding endpoint
                with current_app.test_request_context(method="POST", json={"imageRef": image_ref, "skipObstacles": skip_obstacles}):
                    img_resp, img_code = autocode_image(project_name)
                if img_code >= 400:
                    return None, None, img_resp.get_json().get("error", f"/image {img_code}")
                img_updates = (img_resp.get_json() or {}).get("updates", {})

            gis_updates: dict = {}
            if not skip_gis:
                # Call GIS auto-coding endpoint
                with current_app.test_request_context(method="POST", json={"coords": coords, "fields": fields_filter}):
                    gis_resp, gis_code = autocode_gis(project_name)
                if gis_code >= 400:
                    return None, None, gis_resp.get_json().get("error", f"/gis {gis_code}")
                gis_updates = (gis_resp.get_json() or {}).get("updates", {})

            # Merge updates: GIS overrides CV if both set the same field
            # Example: If CV sets "Area type"=2 and GIS sets "Area type"=1, final value is 1
            merged = {**img_updates, **gis_updates}

            # Special case: "Crossing Type" — append GIS value to CV value instead of override
            # e.g. CV="Traffic Crossing" + GIS="Bicycle Crossing" → "Traffic Crossing, Bicycle Crossing"
            if "Crossing Type" in img_updates and "Crossing Type" in gis_updates:
                cv_type = img_updates["Crossing Type"]   # may be None
                gis_type = gis_updates["Crossing Type"]
                merged["Crossing Type"] = f"{cv_type}, {gis_type}" if cv_type else gis_type

            # Track which fields came from CV vs GIS for UI highlighting badges
            sources = {}
            for field in img_updates:
                sources[field] = "CV"
            for field in gis_updates:
                sources[field] = "GIS"  # GIS overrides CV source if both set the same field

            # Special case: "Intersecting Bicycle Facility" — CV wins over GIS only when CV
            # explicitly detected a dominant traffic/zebra crossing (value is not None).
            # GIS says Present when a road crossing is within 5 m, but if CV saw a pedestrian
            # crossing dominating the image it overrides to Not Present.
            ibf_key = "Intersecting Bicycle Facility"
            if img_updates.get(ibf_key) is not None and ibf_key in gis_updates:
                merged[ibf_key] = img_updates[ibf_key]
                sources[ibf_key] = "CV"

            return merged, sources, None

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

            # Inject Grade from pre-computed LAZ gradient lookup
            _inject_grade(image_ref, merged, sources, project_name=project_name)
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
        #   - { ..., stream: true }                    -> SSE streaming (yields progress per row)

        # Determine which rows to process
        if not indices:
            indices = list(range(len(ver.attributes.df)))
        else:
            indices = [i for i in indices if isinstance(i, int) and 0 <= i < len(ver.attributes.df)]

        # Check if we should save to disk (default: True, but UI passes False for temp changes)
        save = bool(payload.get("save", True))

        # Optional field filter: only apply updates for these specific field names
        fields_filter = payload.get("fields")  # list[str] | None
        if fields_filter and not isinstance(fields_filter, list):
            fields_filter = None  # Ignore malformed value

        # Determine whether CV inference can be skipped for this batch.
        # CV is safe to skip only when ALL requested fields are exclusively
        # produced by GIS (never by CV). This avoids running expensive YOLO
        # inference when the user selects e.g. only "Area type" or "Curvature".
        skip_cv = bool(fields_filter and all(f in _GIS_ONLY_FIELDS for f in fields_filter))
        if skip_cv:
            print(f"[Autocode] Skipping CV inference — all requested fields are GIS-only: {fields_filter}", flush=True)

        # Fields that require the obstacle detector model (second YOLO pass).
        # Safe to skip when none of these are in the requested fields.
        _CV_OBSTACLE_FIELDS: frozenset = frozenset({
            "Fixed Obstacle on Facility",
            "Non-Fixed Obstacle on Facility",
            "Width Restriction",
            "FO Type",
            "NFO Type",
        })
        skip_obstacles = bool(
            not skip_cv  # obstacle skip only relevant when CV runs at all
            and fields_filter
            and not any(f in _CV_OBSTACLE_FIELDS for f in fields_filter)
        )
        if skip_obstacles:
            print(f"[Autocode] Skipping obstacle detection — no obstacle fields requested: {fields_filter}", flush=True)

        def _bulk_gen():
            """
            Generator that processes all rows and yields dicts:
              {"type": "progress", "processed": N, "total": M, "errors": E}  — after each row
              {"type": "done", "saved": bool, "total": M, "ok": K, ...}       — after completion

            Streaming mode (want_stream=True): events are serialised to SSE and returned as a
            Flask streaming Response so the frontend can update the progress counter per segment.
            Non-streaming mode: events are consumed internally and the "done" event is returned
            as a normal JSON response (backward-compatible).
            """
            import json as _json  # noqa: F401 — used by caller's SSE wrapper
            global _INFERENCE_DEPTH

            errors: list = []
            ok_count: int = 0
            changed_by_row: dict = {}
            sources_by_row: dict = {}

            total_count = len(indices)
            print(f"[Autocode] Bulk starting: {total_count} rows for project '{project_name}'", flush=True)
            _INFERENCE_DEPTH += 1
            try:
                for idx in indices:
                    try:
                        # Resolve image filename and coordinates for this row
                        image_ref = _resolve_image_ref(idx)
                        coords = _resolve_coords(idx)

                        # Validate we have the required data
                        if not image_ref:
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
                        merged, sources, err = _call_autocode_pair(image_ref, coords, skip_cv=skip_cv, skip_obstacles=skip_obstacles, fields_filter=fields_filter)
                        if err:
                            errors.append({"index": idx, "reason": err})
                            continue

                        # Inject Grade from pre-computed LAZ gradient lookup
                        if not skip_cv or (fields_filter and "Grade" in fields_filter):
                            _inject_grade(image_ref, merged, sources, project_name=project_name)

                        # Apply per-attribute filter: only keep requested fields
                        if fields_filter:
                            actual_filter = fields_filter + ["Gradient %"] if "Grade" in fields_filter else fields_filter
                            merged = {k: v for k, v in (merged or {}).items() if k in actual_filter}
                            sources = {k: v for k, v in (sources or {}).items() if k in actual_filter}

                        # Track which fields actually changed (for UI highlighting)
                        changed_fields: list = []
                        field_sources: dict = {}
                        for field, code in (merged or {}).items():
                            old_val = ver.attributes.df.at[idx, field] if field in ver.attributes.df.columns else None
                            if old_val != code:
                                changed_fields.append(field)
                                field_sources[field] = sources.get(field, "Unknown")
                            ver.attributes.df.at[idx, field] = code

                        changed_by_row[idx] = changed_fields
                        sources_by_row[idx] = field_sources
                        ok_count += 1

                        # Yield per-row progress event (consumed by SSE wrapper or discarded)
                        yield {"type": "progress", "processed": ok_count, "total": total_count, "errors": len(errors)}

                        if ok_count % 10 == 0:
                            print(f"[Autocode] Bulk progress: {ok_count}/{total_count} done ({len(errors)} errors so far)", flush=True)

                    except Exception as e:
                        traceback.print_exc()
                        errors.append({"index": idx, "reason": str(e)})
            finally:
                _INFERENCE_DEPTH -= 1

            # Save to disk (runs only when the loop completes; skipped on generator abandon/disconnect)
            if save and ok_count > 0:
                print(f"[Autocode] Bulk complete: {ok_count}/{total_count} OK, {len(errors)} failed. Saving...", flush=True)
                ver.save_all()
                proj.metadata.last_updated = datetime.datetime.now()
                proj.metadata.serialize(proj.project_path)

            updated_attributes = df_to_records(ver.attributes.df)
            yield {
                "type": "done",
                "saved": bool(save and ok_count > 0),
                "total": len(indices),
                "ok": ok_count,
                "fail": len(errors),
                "errors": errors,
                "changed_by_row": changed_by_row,
                "sources_by_row": sources_by_row,
                "updated_attributes": updated_attributes,
            }

        # ── Streaming mode: return SSE response ──────────────────────────────
        if want_stream:
            import json as _json

            def _sse():
                for event in _bulk_gen():
                    yield f"data: {_json.dumps(event)}\n\n"

            return Response(
                stream_with_context(_sse()),
                mimetype="text/event-stream",
                headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
            )

        # ── Non-streaming mode: consume generator, return JSON ───────────────
        final_event = None
        for event in _bulk_gen():
            if event["type"] == "done":
                final_event = event
        return ok({k: v for k, v in (final_event or {}).items() if k != "type"})

    except ServiceUnavailable as e:
        return fail(str(e), 503)
    except Exception as e:
        traceback.print_exc()
        return fail(f"autocode_all error: {e}", 500)


# ===== Baseline Management Endpoints =====

@bp.get("/<project_name>/baseline/exists")
def baseline_exists(project_name: str):
    """Check if baseline CSV exists for a project."""
    try:
        ctx = get_ctx()
        pm = ctx["pm"]
        proj = pm.project(project_name)

        baseline_path = proj.project_path / "baseline" / f"{project_name}_baseline.csv"
        exists = baseline_path.exists()

        return ok({"exists": exists})
    except KeyError:
        return fail("Project not found", 404)
    except Exception as e:
        traceback.print_exc()
        return fail(f"Error checking baseline: {e}", 500)


@bp.get("/<project_name>/baseline")
def get_baseline(project_name: str):
    """
    Get baseline CSV as JSON array of row dictionaries.

    Response:
        {
            "ok": true,
            "rows": [
                {"Facility Type": 2, "Area type": 1, ...},
                ...
            ]
        }
    """
    try:
        ctx = get_ctx()
        pm = ctx["pm"]
        proj = pm.project(project_name)

        baseline_path = proj.project_path / "baseline" / f"{project_name}_baseline.csv"

        if not baseline_path.exists():
            return ok({"rows": []})  # No baseline yet

        # Read CSV and convert to JSON
        baseline_df = pd.read_csv(baseline_path)
        rows = df_to_records(baseline_df)

        return ok({"rows": rows})

    except KeyError:
        return fail("Project not found", 404)
    except Exception as e:
        traceback.print_exc()
        return fail(f"Error reading baseline: {e}", 500)


@bp.post("/<project_name>/baseline")
def save_baseline(project_name: str):
    """
    Create or update baseline CSV for a project.

    Body:
        {
            "rows": [
                {"Facility Type": 2, "Area type": 1, ...},
                ...
            ]
        }

    Response:
        {
            "ok": true,
            "message": "Baseline saved successfully"
        }
    """
    try:
        ctx = get_ctx()
        pm = ctx["pm"]
        proj = pm.project(project_name)

        data = request.get_json(force=True, silent=True) or {}
        rows = data.get("rows")

        if not isinstance(rows, list):
            return fail("rows must be an array", 400)

        # Create baseline directory if not exists
        baseline_dir = proj.project_path / "baseline"
        baseline_dir.mkdir(parents=True, exist_ok=True)

        # Create DataFrame and save to CSV
        baseline_df = pd.DataFrame(rows)
        baseline_path = baseline_dir / f"{project_name}_baseline.csv"
        baseline_df.to_csv(baseline_path, index=False, encoding='utf-8')

        return ok({"message": "Baseline saved successfully"})

    except KeyError:
        return fail("Project not found", 404)
    except Exception as e:
        traceback.print_exc()
        return fail(f"Error saving baseline: {e}", 500)

# ===== Autocode Metadata Management Endpoints =====

@bp.get("/<project_name>/autocode-metadata")
def get_autocode_metadata(project_name: str):
    """
    Get autocode metadata (changed fields and sources) as JSON.
    
    Response:
        {
            "ok": true,
            "changedFieldsByRow": { "0": ["Field1"], ... },
            "fieldSourcesByRow": { "0": {"Field1": "GIS"}, ... }
        }
    """
    try:
        ctx = get_ctx()
        pm = ctx["pm"]
        proj = pm.project(project_name)
        
        # Use 'autocode' directory for metadata
        autocode_dir = proj.project_path / "autocode"
        metadata_path = autocode_dir / f"{project_name}_metadata.json"
        
        if not metadata_path.exists():
            return ok({
                "changedFieldsByRow": {},
                "fieldSourcesByRow": {}
            })
            
        import json
        with open(metadata_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        return ok(data)

    except KeyError:
        return fail("Project not found", 404)
    except Exception as e:
        traceback.print_exc()
        return fail(f"Error reading autocode metadata: {e}", 500)

@bp.post("/<project_name>/autocode-metadata")
def save_autocode_metadata(project_name: str):
    """
    Save autocode metadata (changed fields and sources) as JSON.
    
    Body:
        {
            "changedFieldsByRow": { ... },
            "fieldSourcesByRow": { ... }
        }
    """
    try:
        ctx = get_ctx()
        pm = ctx["pm"]
        proj = pm.project(project_name)
        
        data = request.get_json(force=True, silent=True) or {}
        
        # Create autocode directory if not exists
        autocode_dir = proj.project_path / "autocode"
        autocode_dir.mkdir(parents=True, exist_ok=True)
        
        metadata_path = autocode_dir / f"{project_name}_metadata.json"
            
        import json
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        return ok({"message": "Autocode metadata saved successfully"})

    except KeyError:
        return fail("Project not found", 404)
    except Exception as e:
        traceback.print_exc()
        return fail(f"Error saving autocode metadata: {e}", 500)
