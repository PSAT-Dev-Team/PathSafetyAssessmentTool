from __future__ import annotations
from flask import current_app, jsonify, request
from . import bp
from pathlib import Path
from typing import Dict, Any
from app.services.cycleRAP_service import (
REQUIRED_ATTRIBUTES,
compute_scores,
compute_treatments,
load_attributes_csv,
append_result_csv,
)

# --- Helpers ---------------------------------------------------------------

def _json_error(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status
# --- Introspection ---------------------------------------------------------


@bp.get("/schema")
def schema():
    """Return required attribute names for clients to build forms/validation."""
    return jsonify({"ok": True, "required": REQUIRED_ATTRIBUTES})

# --- Score from JSON attributes -------------------------------------------


@bp.post("/score")
def post_score():
    """
    Body JSON examples:
    1) Direct attributes
    {
    "attributes": {"speed_limit": 50, "lane_width": 3.2, ...},
    "project": "MyProject", "version": "v1",
    "save": true
    }


    2) Indirect (load from CSV on disk)
    {
    "from_file": {"project": "MyProject", "version": "v1", "filename": "attributes.csv"},
    "save": true
    }
    """
    data = request.get_json(silent=True) or {}


    # Case A: attributes supplied directly
    attributes: Dict[str, Any] | None = data.get("attributes")


    # Case B: attributes loaded from CSV
    if attributes is None and (fmeta := data.get("from_file")):
        project = fmeta.get("project")
        version = fmeta.get("version")
        fname = fmeta.get("filename", "attributes.csv")
        if not project or not version:
            return _json_error("from_file requires 'project' and 'version'")
        try:
            attributes = load_attributes_csv(
            base_dir=current_app.config["DATA_DIR"],
            project=project,
            version=version,
            filename=fname,
            )
        except FileNotFoundError:
            return _json_error("attributes file not found", 404)
        except Exception as e:
            return _json_error(f"failed to read attributes csv: {e}", 500)
    
    if not isinstance(attributes, dict):
        return _json_error("'attributes' must be an object of 55 key-value pairs")


    # Validate presence of required fields
    missing = [k for k in REQUIRED_ATTRIBUTES if k not in attributes]
    if missing:
        return _json_error(f"missing attributes: {', '.join(missing)}")


    try:
        scores = compute_scores(attributes)
    except Exception as e:
        return _json_error(f"failed to compute scores: {e}", 500)


    # Optional persistence
    if data.get("save"):
        project = data.get("project") or (data.get("from_file") or {}).get("project")
        version = data.get("version") or (data.get("from_file") or {}).get("version")
        if not project or not version:
            return _json_error("save requested but 'project' and 'version' not provided")
        try:
            path = append_result_csv(
            base_dir=current_app.config["DATA_DIR"],
            project=project,
            version=version,
            attributes=attributes,
            scores=scores,
            )
        except Exception as e:
            return _json_error(f"failed to save result: {e}", 500)
        return jsonify({"ok": True, "scores": scores, "saved_to": str(path)})


    return jsonify({"ok": True, "scores": scores})

# --- Treatment from scores or attributes ----------------------------------


@bp.post("/treatment")
def post_treatment():
    """
    Body JSON examples:
    1) Already have scores
    { "scores": {"BBScore": 0.4, "BPScore": 0.6, "VBScore": 0.5, "SBScore": 0.3, "CycleRapScore": 0.52} }


    2) Or provide attributes; backend computes scores first
    { "attributes": {... 55 keys ...} }
    """
    data = request.get_json(silent=True) or {}


    scores = data.get("scores")
    if not scores:
        attrs = data.get("attributes")
        if not isinstance(attrs, dict):
            return _json_error("provide either 'scores' or 'attributes'")
        missing = [k for k in REQUIRED_ATTRIBUTES if k not in attrs]
        if missing:
            return _json_error(f"missing attributes: {', '.join(missing)}")
        try:
            scores = compute_scores(attrs)
        except Exception as e:
            return _json_error(f"failed to compute scores: {e}")


    try:
        treatments = compute_treatments(scores)
    except Exception as e:
        return _json_error(f"failed to compute treatments: {e}", 500)


    return jsonify({"ok": True, "scores": scores, "treatments": treatments})