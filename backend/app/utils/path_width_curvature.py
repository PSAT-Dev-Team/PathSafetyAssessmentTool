from __future__ import annotations
import os
from typing import Dict, Optional, List, Union

import math
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import (
    Point, LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection
)
from shapely.geometry.base import BaseGeometry
from shapely.ops import linemerge, unary_union


# ─────────────────────────────────────────────────────────────────────────────
# Helpers: geometry cleaning / loading
# ─────────────────────────────────────────────────────────────────────────────

def remove_z(geom: BaseGeometry) -> BaseGeometry:
    """
    Remove Z coordinates from a geometry (convert 3D → 2D).
    Returns the geometry unchanged if it has no Z values.
    """
    if geom is None or geom.is_empty or not getattr(geom, "has_z", False):
        return geom

    def to_2d(coords):
        return [(x, y) for x, y, *_ in coords]

    gt = geom.geom_type
    if gt == "Point":
        x, y, *_ = geom.coords[0]
        return Point(x, y)
    if gt == "LineString":
        return LineString(to_2d(geom.coords))
    if gt == "Polygon":
        return Polygon(to_2d(geom.exterior.coords),
                       [to_2d(r.coords) for r in geom.interiors])
    if gt == "MultiLineString":
        return MultiLineString([remove_z(g) for g in geom.geoms])
    if gt == "MultiPolygon":
        return MultiPolygon([remove_z(g) for g in geom.geoms])
    return geom  # Fallback


def standardize_width_column(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Normalize any column representing width into 'WIDTH' (float).
    If none found, create 'WIDTH' with NaN.
    """
    if gdf is None or gdf.empty:
        return gdf

    candidates = [
        "WIDTH", "width", "Width",
        "PATH_WIDTH", "path_width", "Path_Width",
        "L_WIDTH", "R_WIDTH", "AVG_WIDTH", "avg_width",
        "Wdth", "WID", "Width_m", "WIDTH_M"
    ]

    found = None
    lower_cols = {c.lower(): c for c in gdf.columns}
    for c in candidates:
        if c in gdf.columns:
            found = c
            break
        if c.lower() in lower_cols:
            found = lower_cols[c.lower()]
            break

    if found is None:
        gdf["WIDTH"] = np.nan
    else:
        if found != "WIDTH":
            gdf = gdf.rename(columns={found: "WIDTH"})
        gdf["WIDTH"] = pd.to_numeric(gdf["WIDTH"], errors="coerce")
    return gdf


# Cache for loaded layers keyed by (path, mtime)
_LAYER_CACHE: Dict[tuple, Optional[gpd.GeoDataFrame]] = {}


def load_layer(path: str, base_dir: Optional[str] = None) -> Optional[gpd.GeoDataFrame]:
    """
    Load a shapefile, reproject to EPSG:3414, drop Z, ensure 'WIDTH', and build sindex.
    Uses an in-memory cache keyed by (path, last_modified_time).

    Args:
        path: Relative or absolute path to shapefile
        base_dir: Optional base directory to prepend to relative paths
    """
    # Handle base_dir
    if base_dir and not os.path.isabs(path):
        full_path = os.path.join(base_dir, path)
    else:
        full_path = path

    if not full_path or not full_path.endswith(".shp") or not os.path.exists(full_path):
        return None

    key = (full_path, os.path.getmtime(full_path))
    if key in _LAYER_CACHE:
        return _LAYER_CACHE[key]

    try:
        gdf = gpd.read_file(full_path)
        if gdf.empty:
            _LAYER_CACHE[key] = None
            return None

        target_crs = "EPSG:3414"
        if gdf.crs is None or gdf.crs.to_string() != target_crs:
            gdf = gdf.to_crs(target_crs)

        # Clean geometries
        gdf = gdf.assign(geometry=lambda df: df.geometry.apply(remove_z))
        gdf = gdf[gdf.geometry.notnull() & gdf.is_valid & ~gdf.is_empty]

        # Standardize width column
        gdf = standardize_width_column(gdf)

        # Build spatial index for fast queries
        _ = gdf.sindex

        _LAYER_CACHE[key] = gdf
        return gdf
    except Exception as e:
        print(f"[Error] load_layer {full_path}: {e}")
        _LAYER_CACHE[key] = None
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Curvature helpers (vertex triplets + Heron's formula)
# ─────────────────────────────────────────────────────────────────────────────

def _densify_linestring(line: LineString, step: float) -> LineString:
    """
    Densify a LineString by inserting vertices every `step` meters along its length.
    If step <= 0 or the line is shorter than step, returns the original line.
    """
    L = float(line.length)
    if step <= 0 or L <= step:
        return line
    n = int(math.ceil(L / step)) + 1  # inclusive end
    dists = np.linspace(0.0, L, n)
    pts = [line.interpolate(float(d)) for d in dists]
    return LineString([(p.x, p.y) for p in pts])


def _min_triplet_radius_from_linestring(
    line: LineString,
    eps: float = 1e-9,
    min_seg_len: float = 1e-6
) -> Optional[float]:
    """
    Slide a 3-point window over the LineString vertices and return the **minimum**
    finite circumcircle radius (sharpest turn). Degenerate/collinear triplets are skipped.
    """
    if line is None or line.is_empty:
        return None
    coords = list(line.coords)
    n = len(coords)
    if n < 3:
        return None

    min_r = None
    for i in range(n - 2):
        A = Point(coords[i]); B = Point(coords[i+1]); C = Point(coords[i+2])
        a = A.distance(B); b = B.distance(C); c = A.distance(C)
        if a < min_seg_len or b < min_seg_len or c < min_seg_len:
            continue
        p = 0.5 * (a + b + c)
        area_sq = max(p * (p - a) * (p - b) * (p - c), 0.0)
        if area_sq <= eps:
            continue  # nearly collinear -> skip
        R = (a * b * c) / (4.0 * area_sq**0.5)
        if (min_r is None) or (R < min_r):
            min_r = R
    return min_r


def _merge_connectable_lines(sub_gdf: gpd.GeoDataFrame) -> Optional[Union[LineString, MultiLineString]]:
    """
    Merge connectable lines in a small subset (unary_union + linemerge).
    Falls back to geometry repair if necessary.
    """
    if sub_gdf is None or sub_gdf.empty:
        return None
    try:
        return linemerge(unary_union(sub_gdf.geometry.values))
    except Exception:
        try:
            from shapely.validation import make_valid  # Shapely 2.x
            fixed = sub_gdf.geometry.apply(
                lambda g: g if (g and g.is_valid) else make_valid(g) if g else g
            )
            return linemerge(unary_union(fixed.values))
        except Exception:
            try:
                fixed = sub_gdf.geometry.apply(
                    lambda g: g if (g and g.is_valid) else g.buffer(0) if g else g
                )
                return linemerge(unary_union(fixed.values))
            except Exception:
                return None


def _extract_lines(geom) -> List[LineString]:
    """
    Extract all LineString parts from a geometry that could be
    LineString, MultiLineString, or GeometryCollection.
    """
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return [ls for ls in geom.geoms if isinstance(ls, LineString) and not ls.is_empty]
    if isinstance(geom, GeometryCollection):
        out: List[LineString] = []
        for g in geom.geoms:
            out.extend(_extract_lines(g))
        return out
    return []


def _min_radius_within_window_for_layer(
    gdf_layer: gpd.GeoDataFrame,
    pt: Point,
    radius_window: float = 10.0,
    densify_step: float = 0.0,   # 0 = no densify; e.g., 0.5–1.0 for smoother curvature
) -> Optional[float]:
    """
    Use only features within `radius_window` meters of pt (clipped to the circle),
    merge connectable lines, and return the **minimum** triplet-based radius across all parts.
    """
    if gdf_layer is None or gdf_layer.empty:
        return None

    buf = pt.buffer(float(radius_window))

    # 1) spatial subset inside window
    try:
        idx = list(gdf_layer.sindex.query(buf, predicate="intersects"))
    except Exception:
        idx = []
    if not idx:
        return None

    sub = gdf_layer.iloc[idx].copy()
    if sub.empty:
        return None

    # 2) merge connectable lines
    merged = _merge_connectable_lines(sub)
    if merged is None or merged.is_empty:
        return None

    # 3) clip merged geometry to the circle (local-only)
    try:
        clipped = merged.intersection(buf)
    except Exception:
        clipped = merged  # fallback

    # 4) iterate over each LineString part
    lines = _extract_lines(clipped)
    if not lines:
        return None

    best_min_r = None
    for ls in lines:
        if densify_step and densify_step > 0:
            ls = _densify_linestring(ls, densify_step)
        r = _min_triplet_radius_from_linestring(ls)
        if r is not None and (best_min_r is None or r < best_min_r):
            best_min_r = r

    return best_min_r


# ─────────────────────────────────────────────────────────────────────────────
# Core search (priority + expanding rings) -> (R, W)
# ─────────────────────────────────────────────────────────────────────────────

def _nearest_radius_and_width_with_priority(
    pt: Point,
    layers: Dict[str, Optional[gpd.GeoDataFrame]],
    start_radius: float,
    max_radius: float,
    step: float,
    priority: Optional[List[str]] = None,
    collect_radius: float = 10.0,     # window for curvature (meters)
    sample_half_window: float = 0.5,  # used as densify_step (meters)
) -> tuple[Optional[float], Optional[float]]:
    """
    1) Scan outward in rings and, by priority, lock the first width W
       (nearest valid WIDTH among candidates in the first-hit ring; never changes after set).
    2) After scanning up to max_radius, compute curvature R only from the layer that gave W,
       using only features within `collect_radius` meters of pt:
         - merge connectable lines, clip to the circle, compute triplet-based radii,
           and return the **minimum** radius (sharpest turn). No 'inf' returned.
    """
    if priority is None:
        priority = ["cycling", "shared", "footpath"]

    found_layer: Optional[str] = None
    found_W: Optional[float] = None

    r = float(start_radius)
    while r <= float(max_radius):
        buf_r = pt.buffer(r)
        for layer_name in priority:
            gdf = layers.get(layer_name)
            if gdf is None or gdf.empty:
                continue

            # ring hit?
            try:
                idx_ring = list(gdf.sindex.query(buf_r, predicate="intersects"))
            except Exception:
                idx_ring = []
            if not idx_ring:
                continue

            # lock W if not yet set (nearest in this ring within this layer)
            if found_W is None:
                sub_ring = gdf.iloc[idx_ring].copy()
                if "WIDTH" in sub_ring.columns:
                    sub_ring["_WIDTH_NUM"] = pd.to_numeric(sub_ring["WIDTH"], errors="coerce")
                    valid = sub_ring[sub_ring["_WIDTH_NUM"].notna()]
                    if not valid.empty:
                        dists = valid.geometry.distance(pt)
                        j = int(dists.values.argmin())
                        found_W = float(valid.iloc[j]["_WIDTH_NUM"])
                        found_layer = layer_name
                        # keep scanning to end; W is locked
        r += float(step)

    if found_W is None or found_layer is None:
        return (None, None)

    # Curvature from the layer that provided W, within local window
    gdf_sel = layers.get(found_layer)
    R = _min_radius_within_window_for_layer(
        gdf_sel, pt, radius_window=float(collect_radius), densify_step=float(sample_half_window)
    )
    return (R, found_W)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def get_radius_and_width_at_point(
    point: Point,
    start_radius: float = 1.0,
    max_radius: float = 5.0,
    step: float = 1.0,
    priority: Optional[List[str]] = None,
    collect_radius: float = 5.0,   # local window for curvature (meters)
    sample_half_window: float = 1.0, # used here as densify_step (meters); set 0 to disable
    base_dir: Optional[str] = None  # base directory for shapefiles
) -> tuple[Optional[float], Optional[float]]:
    """
    Returns (R, W):
    - W is the first-found width by priority while scanning rings.
    - R is the **minimum** radius (sharpest turn) computed only from the layer that gave W,
      using only features within `collect_radius` meters of the point.
    - `sample_half_window` is used as densify step; 0 disables densify.
    - `base_dir` is the base directory for shapefile paths (optional).
    """
    gdf_cycling = load_layer("path/CyclingpathCentreline.shp", base_dir=base_dir)
    gdf_foot    = load_layer("path/Footpathcentreline.shp", base_dir=base_dir)
    gdf_share   = load_layer("path/Sharedpathcentreline.shp", base_dir=base_dir)
    layers = {"cycling": gdf_cycling, "footpath": gdf_foot, "shared": gdf_share}

    return _nearest_radius_and_width_with_priority(
        point, layers, start_radius, max_radius, step,
        priority=priority,
        collect_radius=collect_radius,
        sample_half_window=sample_half_window,
    )


def get_width_at_point(
    point: Point,
    start_radius: float = 1.0,
    max_radius: float = 5.0,
    step: float = 1.0,
    priority: Optional[List[str]] = None,
    base_dir: Optional[str] = None
) -> Optional[float]:
    """
    Backward-compatible API: returns only width W.
    If no width found, returns 0 to match previous behavior.
    """
    R, W = get_radius_and_width_at_point(point, start_radius, max_radius, step, priority, base_dir=base_dir)
    return 0 if W is None else W
