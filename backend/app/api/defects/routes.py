"""
Defects Blueprint  (url_prefix: /api/defects)

Serves Daily Defect Summary records (sourced from
backend/data/defects/defect_summary.xlsx) filtered to a search radius around
a query point. Used by the Coding page Map Preview & Analysis "Path Defects"
overlay.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from app.services.defects_store import get_defects_store

bp = Blueprint("defects", __name__)


@bp.post("/nearby")
def defects_nearby():
    payload = request.get_json(force=True, silent=True) or {}
    point = payload.get("point") or []
    radius = payload.get("radius", 200)

    if not isinstance(point, (list, tuple)) or len(point) != 2:
        return jsonify({"error": "point [lon, lat] is required"}), 400

    try:
        lon = float(point[0])
        lat = float(point[1])
        radius_m = float(radius)
    except (TypeError, ValueError):
        return jsonify({"error": "point and radius must be numeric"}), 400

    try:
        defects = get_defects_store().query_within(lon, lat, radius_m)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503

    return jsonify({
        "ok": True,
        "point": {"lon": lon, "lat": lat},
        "radius": radius_m,
        "defects": defects,
    })
