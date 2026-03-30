"""
API endpoint for Facility Width per Direction visualization.

Similar to curvature visualization, this provides interactive debugging
and reasoning visualization for the width coding process.
"""

from flask import Blueprint, request, jsonify
from pathlib import Path
from shapely.geometry import Point
import numpy as np

from app.services import gis_mapping as gis
from app.utils.path_width_curvature import (
    load_layer,
    _nearest_radius_and_width_with_priority
)

bp = Blueprint('width_viz', __name__)


def get_layer_color(layer_name: str) -> tuple:
    """Get RGB color for path layer."""
    colors = {
        "cycling": (0, 180, 0),      # Green
        "shared": (230, 140, 0),     # Orange
        "footpath": (30, 144, 255),  # Blue
    }
    return colors.get(layer_name, (0, 0, 0))


def _get_gis_instance():
    """Get the cached GIS instance from the parent blueprint's routes module."""
    from app.api.projects import routes as _routes
    return _routes._get_gis_instance()


@bp.post("/visualize")
def visualize_width():
    """
    Generate facility width visualization data for the coding page.

    Request body:
    {
        "coords": [[lon, lat], ...],  // LineString coordinates
        "index": 0  // Optional segment index
    }

    Returns:
    {
        "ok": true,
        "point": {"lon": ..., "lat": ...},
        "width": 2.5,  // meters, or null if not found
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
                "candidates_by_layer": {
                    "cycling": 1,
                    "shared": 0,
                    "footpath": 0
                }
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
        data = request.get_json()
        coords = data.get("coords", [])

        if not coords or len(coords) == 0:
            return jsonify({"ok": False, "error": "coords is required"}), 400

        # Get first point (start of segment)
        start_lon, start_lat = coords[0]
        point = Point(start_lon, start_lat)

        # Get backend root and shapefile directory
        backend_root = Path(__file__).resolve().parents[3]
        shp_dir = (backend_root / "shapefiles").resolve()

        if not shp_dir.exists():
            return jsonify({"ok": False, "error": f"Shapefile directory not found: {shp_dir}"}), 500

        # Initialize GIS using the cached singleton
        _gis = _get_gis_instance()
        pt_metric = _gis.store.to_metric_point(point)

        # Load path layers from the cached GIS store (avoids disk I/O on every request)
        gdf_cycling = _gis.store.get("cycling_path")
        gdf_foot = _gis.store.get("footpath")
        gdf_share = _gis.store.get("shared_path")

        layers = {
            "cycling": gdf_cycling,
            "footpath": gdf_foot,
            "shared": gdf_share
        }

        # Get width distribution stats
        width_distribution = {}
        for layer_name, gdf in layers.items():
            if gdf is None or gdf.empty or "WIDTH" not in gdf.columns:
                width_distribution[layer_name] = {"min": None, "max": None, "count": 0}
            else:
                valid_widths = gdf["WIDTH"].dropna()
                if len(valid_widths) > 0:
                    width_distribution[layer_name] = {
                        "min": float(valid_widths.min()),
                        "max": float(valid_widths.max()),
                        "count": len(gdf)
                    }
                else:
                    width_distribution[layer_name] = {"min": None, "max": None, "count": len(gdf)}

        # Perform expanding ring search with diagnostics
        priority = ["cycling", "shared", "footpath"]
        start_radius = 1.0
        max_radius = 10.0
        step = 1.0

        search_rings = []
        found_width = None
        found_layer = None
        found_radius = None

        for radius in np.arange(start_radius, max_radius + step, step):
            buf = pt_metric.buffer(radius)
            candidates_by_layer = {}

            for layer_name in priority:
                gdf = layers[layer_name]
                if gdf is None or gdf.empty:
                    candidates_by_layer[layer_name] = 0
                    continue

                # Query spatial index
                try:
                    idx = list(gdf.sindex.query(buf, predicate="intersects"))
                except:
                    idx = []

                candidates_by_layer[layer_name] = len(idx)

                # Lock width if not yet set
                if idx and found_width is None:
                    candidates = gdf.iloc[idx].copy()

                    if "WIDTH" in candidates.columns:
                        candidates["_WIDTH_NUM"] = candidates["WIDTH"]
                        valid = candidates[candidates["_WIDTH_NUM"].notna()]

                        if not valid.empty:
                            dists = valid.geometry.distance(pt_metric)
                            nearest_idx = dists.idxmin()
                            found_width = float(valid.loc[nearest_idx, "_WIDTH_NUM"])
                            found_layer = layer_name
                            found_radius = radius

            # Store ring info
            search_rings.append({
                "radius": float(radius),
                "center": [start_lon, start_lat],
                "candidates_by_layer": candidates_by_layer,
                "width_locked": found_width is not None
            })

        # Categorize width
        if found_width is None:
            width_category = 2  # Default: Narrow
        elif found_width > 4:
            width_category = 3  # Wide
        elif found_width > 2:
            width_category = 2  # Narrow
        else:
            width_category = 1  # Very Narrow

        # Collect path geometries within visualization radius (20m for display)
        viz_radius = 20.0
        viz_buffer = pt_metric.buffer(viz_radius)
        paths = []

        for layer_name in priority:
            gdf = layers[layer_name]
            if gdf is None or gdf.empty:
                continue

            try:
                idx = list(gdf.sindex.query(viz_buffer, predicate="intersects"))
            except:
                idx = []

            if not idx:
                continue

            nearby = gdf.iloc[idx]

            # Convert to WGS84 for display
            if gdf.crs.to_epsg() != 4326:
                nearby_wgs84 = nearby.to_crs("EPSG:4326")
            else:
                nearby_wgs84 = nearby

            for i, (_, feature) in enumerate(nearby_wgs84.iterrows()):
                geom = feature.geometry
                if geom.is_empty:
                    continue

                # Handle both LineString and MultiLineString geometries
                if geom.geom_type == "LineString":
                    coords_list = [[float(x), float(y)] for x, y in geom.coords]
                elif geom.geom_type == "MultiLineString":
                    # For MultiLineString, concatenate all parts into one path
                    coords_list = []
                    for line in geom.geoms:
                        coords_list.extend([[float(x), float(y)] for x, y in line.coords])
                else:
                    # Skip unsupported geometry types
                    continue

                width_value = feature.get("WIDTH", None)

                paths.append({
                    "type": layer_name,
                    "color": list(get_layer_color(layer_name)),
                    "coordinates": coords_list,
                    "is_analysis_layer": (layer_name == found_layer) if found_layer else False,
                    "width_value": float(width_value) if width_value is not None else None
                })

        # Build response
        response = {
            "ok": True,
            "point": {
                "lon": start_lon,
                "lat": start_lat
            },
            "width": found_width,
            "width_category": width_category,
            "search_info": {
                "found_at_radius": found_radius,
                "layer_used": found_layer,
                "total_radii_checked": len(search_rings),
                "start_radius": start_radius,
                "max_radius": max_radius,
                "step": step
            },
            "search_rings": search_rings,
            "paths": paths,
            "width_distribution": width_distribution,
            "category_labels": {
                1: "Very Narrow (≤ 2m)",
                2: "Narrow (2-4m)",
                3: "Wide (> 4m)"
            }
        }

        return jsonify(response)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500
