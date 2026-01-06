# gis_mapping.py
import geopandas as gpd
from shapely.geometry import Point
from pathlib import Path
import numpy as np
import pandas as pd

# Import utility module for width and curvature calculation
from app.utils.path_width_curvature import get_radius_and_width_at_point

# ==== 新增：可选导入 Streamlit，并定义缓存加载函数 ====
try:
    import streamlit as st

    @st.cache_resource(show_spinner=False)
    def _load_gdf_cached(path_str: str, metric_crs: str, src_mtime: float):
        """读取 -> 转CRS -> 预热sindex；src_mtime作为缓存键，源文件更新自动失效"""
        gdf = gpd.read_file(path_str)
        if gdf.crs is None:
            raise ValueError(f"{Path(path_str).name} 缺少CRS")
        gdf = gdf.to_crs(metric_crs)
        _ = gdf.sindex  # 预热空间索引
        return gdf
except Exception:
    # 非 Streamlit 场景下的兜底（无缓存）
    def _load_gdf_cached(path_str: str, metric_crs: str, src_mtime: float):
        gdf = gpd.read_file(path_str)
        if gdf.crs is None:
            raise ValueError(f"{Path(path_str).name} 缺少CRS")
        gdf = gdf.to_crs(metric_crs)
        _ = gdf.sindex
        return gdf
# =======================================================

CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:3414"

class LayerStore:
    """懒加载 shapefile"""
    def __init__(self, metric_crs=CRS_METRIC):
        self.metric_crs = metric_crs
        self.paths: dict[str, Path] = {}
        self.layers: dict[str, gpd.GeoDataFrame] = {}
        # Added for Road Operating Speed (mean)
        self.speed_data: pd.DataFrame | None = None  # Cache for speed CSV data

    def add_path(self, name: str, path: str | Path):
        self.paths[name] = Path(path)

    # Added for Road Operating Speed (mean)
    def set_speed_csv(self, csv_path: str | Path):
        """Load and cache the speed CSV data for Road Operating Speed (mean)"""
        csv_path = Path(csv_path)
        if not csv_path.exists():
            raise FileNotFoundError(f"Speed CSV not found: {csv_path}")

        # Read CSV - first row contains headers
        df = pd.read_csv(csv_path)

        # Convert LINKID to string for matching
        if 'LINKID' in df.columns:
            df['LINKID'] = df['LINKID'].astype(str)
            # Index by LINKID for quick lookup
            self.speed_data = df.set_index('LINKID')
        else:
            raise ValueError(f"Speed CSV missing LINKID column. Found columns: {df.columns.tolist()}")

    def get(self, name: str):
        """懒加载：第一次用时读取 shapefile（B：通过 cache_resource 缓存）"""
        if name not in self.layers:
            if name not in self.paths:
                raise KeyError(f"未注册图层: {name}")
            shp_path: Path = self.paths[name]
            mtime = shp_path.stat().st_mtime if shp_path.exists() else 0.0
            gdf = _load_gdf_cached(str(shp_path), self.metric_crs, mtime)
            self.layers[name] = gdf
        return self.layers[name]

    def clear_cache(self, name: str = None):
        """Clear cached layers. If name is None, clear all cached layers."""
        if name is None:
            self.layers.clear()
        elif name in self.layers:
            del self.layers[name]

    def reload(self, name: str = None):
        """Force reload of one or all layers by clearing cache and reloading"""
        self.clear_cache(name)
        if name is not None:
            # Force reload by accessing the layer
            return self.get(name)
        else:
            # Reload all registered layers
            for layer_name in list(self.paths.keys()):
                try:
                    self.get(layer_name)
                except Exception as e:
                    print(f"Warning: Could not reload layer {layer_name}: {e}")

    def to_metric_point(self, point, input_crs=None):
        pt = Point(point) if isinstance(point, tuple) else point

        if input_crs is None:
            # 简单启发式：如果像经纬度，就当 WGS84，否则当作已是米制
            x, y = (pt.x, pt.y)
            if (-180 <= x <= 180) and (-90 <= y <= 90):
                crs_in = CRS_WGS84
            else:
                crs_in = self.metric_crs
        else:
            crs_in = input_crs

        gdf = gpd.GeoDataFrame(geometry=[pt], crs=crs_in).to_crs(self.metric_crs)
        return gdf.geometry.iloc[0]

    @classmethod
    def default(cls, base_dir="shp"):
        """预设所有图层路径"""
        store = cls()
        base = Path(base_dir)
        store.add_path("mrt", base / "Mrt_exit" / "MRT_EXITS.shp")
        store.add_path("bus_lane", base / "bus_lane" / "Bus lanes.shp")
        store.add_path("bus_stop", base / "bus_stop" / "BusStop.shp")
        store.add_path("parking", base / "parking_lot" / "URA_PARKING_LOT.shp")
        store.add_path("inner", base / "area_type" / "CentralMB2025.shp")
        store.add_path("industrial", base / "area_type" / "LanduseIndustrial2025.shp")
        store.add_path("rural", base / "area_type" / "LanduseRural2025.shp")
        store.add_path("beforeCount", base / "AMGbeforeCount" / "AMGbeforeCount_export.shp")
        store.add_path("sensorCount", base / "AMGsensorCount" / "AMGsensorCount_export.shp")
        store.add_path("kerb_line", base / "kerb_line" / "kerbline.shp")
        # Added for Road Operating Speed (mean)
        store.add_path("road_links", base / "LinkID_Shape_File" / "31Oct24_Link_FUL.shp")
        # Added for Road Speed Limit
        store.add_path("speed_limit", base / "Speed_limit" / "ROADATTRIBUTELINE_SPEEDLIMITS.shp")
        # Added for Facility Width per Direction
        store.add_path("cycling_path", base / "path" / "CyclingpathCentreline.shp")
        store.add_path("footpath", base / "path" / "Footpathcentreline.shp")
        store.add_path("shared_path", base / "path" / "Sharedpathcentreline.shp")
        # Added for Road Crossing Layer
        store.add_path("roadcrossing", base / "roadcrossinglayer" / "ROADCROSSING.shp")

        # Load speed CSV if it exists
        speed_csv_path = base / "LinkID_Shape_File" / "TSE_AdHocReq_ERP2AverageSpeedData_250425.csv"
        if speed_csv_path.exists():
            try:
                store.set_speed_csv(speed_csv_path)
            except Exception as e:
                print(f"Warning: Could not load speed CSV: {e}")

        return store


class GIS:
    """简单规则判断"""
    def __init__(self, store: LayerStore):
        self.store = store

    def _near(self, layer, pt, dist):
        gdf = self.store.get(layer)
        idx = gdf.sindex.query(pt.buffer(dist))
        if not len(idx):
            return False
        d = gdf.iloc[idx].distance(pt).min()
        return d <= dist

    def _poly(self, layer, pt, tol):
        gdf = self.store.get(layer)
        return not gdf[gdf.geometry.buffer(tol).contains(pt)].empty
    
    @staticmethod
    def _peak_hourly_by_group(df, data_col='data_type', time_col='timestamp', count_col='count', dayfirst=True):
        if df is None or len(df) == 0:
            return {'MICROMOBILITY': 0, 'OTHER': 0}

        g = df.copy()
        # 统一出行类型
        g[data_col] = g[data_col].astype(str).str.strip().str.upper()
        alias = {
            'CYCLISTS': 'CYCLIST',
            'E-SCOOTER': 'PMD',
            'POWER-ASSISTED BICYCLE': 'PAB',
            'POWER ASSISTED BICYCLE': 'PAB'
        }
        g[data_col] = g[data_col].replace(alias)
        mic = {'CYCLIST', 'PMD', 'PAB'}
        g['mode_group'] = np.where(g[data_col].isin(mic), 'MICROMOBILITY', 'OTHER')

        # 时间→按小时取整
        g[time_col] = pd.to_datetime(g[time_col], errors='coerce', dayfirst=dayfirst)
        g = g[g[time_col].notna()]
        g['hour'] = g[time_col].dt.floor('H')

        # 计数列数值化
        g[count_col] = pd.to_numeric(g[count_col], errors='coerce').fillna(0)

        # 每小时 × 分组 合计
        hourly = (g.groupby(['hour','mode_group'], as_index=False)[count_col]
                    .sum().rename(columns={count_col: 'hourly_count'}))

        mic_peak = int(hourly.loc[hourly['mode_group']=='MICROMOBILITY','hourly_count'].max()) if (hourly['mode_group']=='MICROMOBILITY').any() else 0
        oth_peak = int(hourly.loc[hourly['mode_group']=='OTHER','hourly_count'].max()) if (hourly['mode_group']=='OTHER').any() else 0
        return {'MICROMOBILITY': mic_peak, 'OTHER': oth_peak}
    
    def is_mrt(self, point, dist=20):
        pt = self.store.to_metric_point(point)
        return self._near("mrt", pt, dist)

    def is_bus_lane(self, point, dist=20):
        pt = self.store.to_metric_point(point)
        return self._near("bus_lane", pt, dist)

    def is_bus_stop(self, point, dist=20):
        pt = self.store.to_metric_point(point)
        return self._near("bus_stop", pt, dist)

    def is_road_crossing(self, point, dist=5):
        pt = self.store.to_metric_point(point)
        return self._near("roadcrossing", pt, dist)

    def is_parking(self, point, dist=20):
        pt = self.store.to_metric_point(point)
        return self._near("parking", pt, dist)

    def get_area_type(self, point, tol=20):
        pt = self.store.to_metric_point(point)
        if self._poly("inner", pt, tol): return 1
        if self._poly("industrial", pt, tol): return 4
        if self._poly("rural", pt, tol): return 3
        return 2
    
    def get_peak_pedestrian_flow(self, pt, dist=20):
        # 统一坐标到 3414（米）
        pt = self.store.to_metric_point(pt)

        gdf1 = self.store.get("beforeCount")
        gdf2 = self.store.get("sensorCount")

        # 只保留有效点
        gdf1 = gdf1[gdf1.geometry.notna() & (gdf1.geom_type == "Point")].copy()
        gdf2 = gdf2[gdf2.geometry.notna() & (gdf2.geom_type == "Point")].copy()

        buf = pt.buffer(dist)

        # sindex 粗筛 + 精确距离细筛
        idx1 = gdf1.sindex.query(buf)
        near1 = gdf1.iloc[idx1]
        if len(near1):
            near1 = near1[near1.geometry.distance(pt) <= dist]
        else:
            near1 = gdf1.iloc[0:0]  # 空表但保留列

        idx2 = gdf2.sindex.query(buf)
        near2 = gdf2.iloc[idx2]
        if len(near2):
            near2 = near2[near2.geometry.distance(pt) <= dist]
        else:
            near2 = gdf2.iloc[0:0]
            

        # 小工具：做小时聚合
        before_peaks = (
            self._peak_hourly_by_group(
                near1,
                data_col='DataType',    # ← 按你的真实列名改
                time_col='DateTime',    # ← 按你的真实列名改
                count_col='Count_Data',       # ← 按你的真实列名改
                dayfirst=True
            )
            if len(near1) else None
        )
        
        sensor_peaks = (
            self._peak_hourly_by_group(
                near2,
                data_col='Pivot_user',
                time_col='Datetime_p',
                count_col='Count',
                dayfirst=True
            )
            if len(near2) else None
        )

        # 统一返回结构
        return {
            "before_peaks": before_peaks,   # {'MICROMOBILITY': x, 'OTHER': y}
            "sensor_peaks": sensor_peaks,   # {'MICROMOBILITY': x, 'OTHER': y}
        }

    def get_number_of_lane(self, point, dist=10):
        """
        在 kerb_line 中寻找距 point 最近的一条（仅在 dist 米内，找不到返回 None）
        返回：GeoSeries（该要素整行）或 None
        """
        pt = self.store.to_metric_point(point)

        gdf = self.store.get("kerb_line")
        if gdf is None or gdf.empty:
            return None
        gdf = gdf[gdf.geometry.notna()].copy()

        # 优先用 sindex.nearest，兼容不同版本；失败就全量算
        nearest_pos = None
        try:
            gen = gdf.sindex.nearest(pt)          # 有些版本支持几何
            nearest_pos = next(iter(gen))
        except Exception:
            try:
                gen = gdf.sindex.nearest(pt.bounds)  # 有些只支持 bounds
                nearest_pos = next(iter(gen))
            except Exception:
                pass

        if nearest_pos is not None and np.isscalar(nearest_pos):
            # 明确是单个位置索引
            geom = gdf.geometry.iloc[int(nearest_pos)]
            return float(geom.distance(pt))

        # 兜底：对全表算距离 -> 直接取最小值
        dists = gdf.geometry.distance(pt)  # 这是一个 Series
        if dists.empty:
            return None
        return float(dists.min())

    # Added for Road Operating Speed (mean)
    def get_road_operating_speed(self, point, buffer_dist=20, max_dist=30, default_speed=30.0):
        """
        Get the road operating speed (mean) for a point by finding the nearest road link.

        Args:
            point: Shapely Point or (lon, lat) tuple in WGS84 or metric CRS
            buffer_dist: Buffer distance in meters for initial spatial query (default: 20m)
            max_dist: Maximum distance in meters to search for road links (default: 30m)
            default_speed: Default speed value to return if no match found (default: 30 km/h)

        Returns:
            float: Average hourly speed in km/h, or default_speed if not found

        Implementation follows the specification:
        1. Extract first coordinate from LineString geometry
        2. Create 20m buffer for spatial search
        3. Query candidate road links within buffer
        4. Filter to only links within 30m
        5. Find nearest road link
        6. Look up speed from CSV by Link ID
        7. Return speed or default value
        """
        # Convert point to metric CRS (EPSG:3414)
        pt = self.store.to_metric_point(point)

        # Check if road links shapefile is available
        try:
            road_gdf = self.store.get("road_links")
        except KeyError:
            print("Warning: road_links shapefile not registered")
            return default_speed

        if road_gdf is None or road_gdf.empty:
            return default_speed

        # Ensure road links are in metric CRS (should already be from LayerStore.get)
        if road_gdf.crs.to_epsg() != 3414:
            road_gdf = road_gdf.to_crs("EPSG:3414")

        # Filter to only valid geometries
        road_gdf = road_gdf[road_gdf.geometry.notna()].copy()

        # Create buffer for spatial query
        buffer_geom = pt.buffer(buffer_dist)

        # Use spatial index to find candidate road links
        candidate_indices = list(road_gdf.sindex.intersection(buffer_geom.bounds))

        if not candidate_indices:
            return default_speed

        # Get candidate road links
        candidates = road_gdf.iloc[candidate_indices].copy()

        # Calculate distances to point
        candidates['distance'] = candidates.geometry.distance(pt)

        # Filter to only roads within max_dist
        nearby_roads = candidates[candidates['distance'] <= max_dist]

        if nearby_roads.empty:
            return default_speed

        # Find the nearest road link
        nearest_idx = nearby_roads['distance'].idxmin()
        nearest_road = nearby_roads.loc[nearest_idx]

        # Extract Link ID (field name: LK_ID_NUM)
        if 'LK_ID_NUM' not in nearest_road.index:
            print(f"Warning: LK_ID_NUM field not found in road shapefile. Available fields: {list(nearest_road.index)}")
            return default_speed

        link_id = str(nearest_road['LK_ID_NUM'])

        # Look up speed in CSV data
        if self.store.speed_data is None:
            print("Warning: Speed CSV data not loaded")
            return default_speed

        if link_id in self.store.speed_data.index:
            # Get the average hourly speed
            speed_row = self.store.speed_data.loc[link_id]
            if 'AVERAGE_HOURLY_SPEED' in speed_row.index:
                speed = float(speed_row['AVERAGE_HOURLY_SPEED'])
                return speed
            else:
                print(f"Warning: AVERAGE_HOURLY_SPEED column not found. Available columns: {list(speed_row.index)}")
                return default_speed
        else:
            # Link ID not found in CSV - return default
            return default_speed

    # Added for Road Speed Limit
    def get_road_speed_limit(self, point, buffer_dist=20, max_dist=30, default_limit=10):
        """
        Get the road speed limit for a point by finding the nearest speed limit road segment.

        Args:
            point: Shapely Point or (lon, lat) tuple in WGS84 or metric CRS
            buffer_dist: Buffer distance in meters for initial spatial query (default: 20m)
            max_dist: Maximum distance in meters to search for speed limit segments (default: 30m)
            default_limit: Default speed limit value to return if no match found (default: 10 km/h)

        Returns:
            int or float: Speed limit in km/h, or default_limit if not found

        Implementation follows the specification:
        1. Extract first coordinate from LineString geometry
        2. Create 20m buffer for spatial search
        3. Query candidate speed limit segments within buffer
        4. Filter to only segments within 30m
        5. Find nearest speed limit segment
        6. Extract SPEEDLIMIT value
        7. Return speed limit or default value
        """
        # Convert point to metric CRS (EPSG:3414)
        pt = self.store.to_metric_point(point)

        # Check if speed limit shapefile is available
        try:
            speed_limit_gdf = self.store.get("speed_limit")
        except KeyError:
            print("Warning: speed_limit shapefile not registered")
            return default_limit

        if speed_limit_gdf is None or speed_limit_gdf.empty:
            return default_limit

        # Ensure speed limit data is in metric CRS (should already be from LayerStore.get)
        if speed_limit_gdf.crs.to_epsg() != 3414:
            speed_limit_gdf = speed_limit_gdf.to_crs("EPSG:3414")

        # Filter to only valid geometries
        speed_limit_gdf = speed_limit_gdf[speed_limit_gdf.geometry.notna()].copy()

        # Create buffer for spatial query
        buffer_geom = pt.buffer(buffer_dist)

        # Use spatial index to find candidate speed limit segments
        candidate_indices = list(speed_limit_gdf.sindex.intersection(buffer_geom.bounds))

        if not candidate_indices:
            return default_limit

        # Get candidate speed limit segments
        candidates = speed_limit_gdf.iloc[candidate_indices].copy()

        # Calculate distances to point
        candidates['dist_to_pt'] = candidates.geometry.distance(pt)

        # Filter to only segments within max_dist
        nearby_segments = candidates[candidates['dist_to_pt'] <= max_dist]

        if nearby_segments.empty:
            return default_limit

        # Find the nearest segment
        nearest_idx = nearby_segments['dist_to_pt'].idxmin()
        nearest_segment = nearby_segments.loc[nearest_idx]

        # Extract SPEEDLIMIT value
        if 'SPEEDLIMIT' not in nearest_segment.index:
            print(f"Warning: SPEEDLIMIT field not found in speed limit shapefile. Available fields: {list(nearest_segment.index)}")
            return default_limit

        speed_limit_value = nearest_segment['SPEEDLIMIT']

        # Handle null/NaN values
        if pd.isna(speed_limit_value):
            return default_limit

        # Return the speed limit value
        return float(speed_limit_value)

    def get_heavy_vehicle_flow(self, point, buffer_dist=15, max_dist=15, default_value=1):
        """
        Get the heavy vehicle flow category for a point by checking proximity to bus lanes.

        Heavy Vehicle Flow indicates the level of heavy vehicle traffic (buses, trucks) on the road
        adjacent to the cycling facility. Locations near bus lanes are assumed to have higher heavy
        vehicle flow due to bus traffic.

        Args:
            point: Shapely Point or (lon, lat) tuple in WGS84 or metric CRS
            buffer_dist: Buffer distance in meters for initial spatial query (default: 15m)
            max_dist: Maximum distance in meters to check for bus lanes (default: 15m)
            default_value: Default category value (1 = Low) to return if no bus lane found

        Returns:
            int: Heavy vehicle flow category
                 1 = 'Low' (default - no bus lane within 15m)
                 2 = 'Moderate to high' (bus lane within 15m)

        Implementation follows the specification:
        1. Extract first coordinate from LineString geometry (or use provided point)
        2. Create 15m buffer for spatial search
        3. Query candidate bus lanes within buffer using spatial index
        4. Calculate distance from point to each candidate bus lane
        5. Find minimum distance to any bus lane
        6. If minimum distance <= 15m, return 2 (Moderate to high)
        7. Otherwise, return 1 (Low)
        """
        # Convert point to metric CRS (EPSG:3414)
        pt = self.store.to_metric_point(point)

        # Check if bus_lane shapefile is available
        try:
            bus_lane_gdf = self.store.get("bus_lane")
        except KeyError:
            print("Warning: bus_lane shapefile not registered")
            return default_value

        if bus_lane_gdf is None or bus_lane_gdf.empty:
            return default_value

        # Ensure bus lane data is in metric CRS (should already be from LayerStore.get)
        if bus_lane_gdf.crs.to_epsg() != 3414:
            bus_lane_gdf = bus_lane_gdf.to_crs("EPSG:3414")

        # Filter to only valid geometries
        bus_lane_gdf = bus_lane_gdf[bus_lane_gdf.geometry.notna()].copy()

        # Create buffer for spatial query
        buffer_geom = pt.buffer(buffer_dist)

        # Use spatial index to find candidate bus lanes
        candidate_indices = list(bus_lane_gdf.sindex.intersection(buffer_geom.bounds))

        if not candidate_indices:
            return default_value

        # Get candidate bus lanes
        candidates = bus_lane_gdf.iloc[candidate_indices].copy()

        # Calculate distances to point
        candidates['dist_to_pt'] = candidates.geometry.distance(pt)

        # Find the minimum distance to any bus lane
        min_distance = candidates['dist_to_pt'].min()

        # If minimum distance is within threshold, return "Moderate to high" (2)
        if min_distance <= max_dist:
            return 2  # Moderate to high
        else:
            return default_value  # Low (1)

    def get_radius_and_width_at_point(
        self,
        point,
        start_radius=1.0,
        max_radius=5.0,
        step=1.0,
        collect_radius=5.0,
        sample_half_window=1.0,
        epsilon=1e-6
    ):
        """
        Calculate the minimum curvature radius and facility width at a given point using a
        TWO-STAGE process that matches the original PathAssignmentTool implementation.

        This method implements the exact algorithm from the original Streamlit app:
        - STAGE 1: Expanding ring search (1m→5m) to find WIDTH from the nearest path
        - STAGE 2: Fixed window search (5m) to calculate CURVATURE from the same layer

        Args:
            point: Shapely Point or (lon, lat) tuple in WGS84
            start_radius: Initial ring radius for width search (default: 1.0m)
            max_radius: Maximum ring radius for width search (default: 5.0m)
            step: Ring increment size (default: 1.0m)
            collect_radius: Fixed window radius for curvature calculation (default: 5.0m, extended to 5.5m internally)
            sample_half_window: Legacy parameter (not used - densification now uses 0.25m fixed step and preserves original vertices)
            epsilon: Minimum threshold for distance/area calculations (default: 1e-6)

        Returns:
            tuple: (min_radius, width)
                   - min_radius (float or None): Minimum circumradius in meters (sharpest curve)
                   - width (float or None): Facility width in meters from the nearest path feature

        Algorithm (Two-Stage Process):

        STAGE 1 - WIDTH SEARCH (Expanding Ring):
        1. For each radius in [start_radius, start_radius+step, ..., max_radius]:
           a. Create circular buffer at current radius
           b. For each layer in priority order [cycling, shared, footpath]:
              - Find features intersecting this ring
              - If width not yet locked AND features found with valid WIDTH:
                * Lock the width from the nearest feature
                * Remember which layer provided it
           c. Increment radius and continue (width stays locked)

        STAGE 2 - CURVATURE CALCULATION (Fixed Window):
        1. Use ONLY the layer that provided the width
        2. Query features within collect_radius (5.5m extended) of the point
        3. Merge connectable line segments using shapely's linemerge/unary_union
        4. Clip merged geometry to the circular buffer
        5. IMPROVED DENSIFICATION: Preserve original vertices + add points at 0.25m intervals
        6. Calculate minimum circumradius using sliding triplet window on ALL points
        7. Return (min_radius, width)

        Key Characteristics:
        - Width and curvature come from THE SAME LAYER
        - Width uses EXPANDING RING (tries closer features first)
        - Curvature uses FIXED WINDOW (always collect_radius, not expanding)
        - Width locks at first match (never changes after first valid value)
        - Curvature calculated AFTER width search completes
        """
        # Convert point to metric CRS (EPSG:3414)
        pt = self.store.to_metric_point(point)

        # Priority order: cycling paths first, then shared, then footpaths
        priority = ["cycling", "shared", "footpath"]
        layer_names = {
            "cycling": "cycling_path",
            "shared": "shared_path",
            "footpath": "footpath"
        }

        # ========================================================================
        # STAGE 1: EXPANDING RING SEARCH FOR WIDTH
        # ========================================================================
        found_layer = None
        found_width = None

        # Expand search radius from start_radius to max_radius in steps
        current_radius = start_radius
        while current_radius <= max_radius:
            buffer_ring = pt.buffer(current_radius)

            for layer_key in priority:
                try:
                    gdf = self.store.get(layer_names[layer_key])
                    if gdf is None or gdf.empty:
                        continue

                    # Ensure metric CRS
                    if gdf.crs.to_epsg() != 3414:
                        gdf = gdf.to_crs("EPSG:3414")

                    # Remove Z-coordinates if present
                    if len(gdf) > 0 and gdf.geometry.iloc[0].has_z:
                        gdf.geometry = gdf.geometry.apply(
                            lambda geom: self._remove_z_coordinate(geom) if geom is not None else None
                        )

                    # Filter to valid geometries
                    gdf = gdf[gdf.geometry.notna() & gdf.geometry.is_valid].copy()
                    if gdf.empty:
                        continue

                    # Spatial query using index
                    candidate_indices = list(gdf.sindex.intersection(buffer_ring.bounds))
                    if not candidate_indices:
                        continue

                    candidates = gdf.iloc[candidate_indices]

                    # Find features that actually intersect the buffer
                    intersecting = candidates[candidates.intersects(buffer_ring)]
                    if intersecting.empty:
                        continue

                    # Lock width if not yet set
                    if found_width is None:
                        # Standardize WIDTH column
                        intersecting_std = self._standardize_width_column(intersecting)
                        if 'WIDTH' in intersecting_std.columns:
                            # Get width from the nearest feature
                            distances = intersecting_std.geometry.distance(pt)
                            nearest_idx = distances.idxmin()
                            width_value = intersecting_std.loc[nearest_idx, 'WIDTH']
                            if pd.notna(width_value):
                                found_width = float(width_value)
                                found_layer = layer_key  # Remember which layer provided it

                except KeyError:
                    continue
                except Exception as e:
                    print(f"Warning: Error processing {layer_key} for width search: {e}")
                    continue

            # Increment radius for next ring
            current_radius += step

        # ========================================================================
        # STAGE 2: CURVATURE CALCULATION (Fixed Window)
        # ========================================================================
        # Calculate curvature ONLY from the layer that provided the width
        min_radius = None

        if found_layer is not None:
            try:
                gdf = self.store.get(layer_names[found_layer])
                if gdf is not None and not gdf.empty:
                    # Ensure metric CRS
                    if gdf.crs.to_epsg() != 3414:
                        gdf = gdf.to_crs("EPSG:3414")

                    # Remove Z-coordinates if present
                    if len(gdf) > 0 and gdf.geometry.iloc[0].has_z:
                        gdf.geometry = gdf.geometry.apply(
                            lambda geom: self._remove_z_coordinate(geom) if geom is not None else None
                        )

                    # Filter to valid geometries
                    gdf = gdf[gdf.geometry.notna() & gdf.geometry.is_valid].copy()

                    if not gdf.empty:
                        # Create FIXED window buffer for curvature (extended slightly for better edge detection)
                        # Use 5.5m instead of 5.0m to ensure sharp bends at the edge are fully captured
                        buffer_curv = pt.buffer(collect_radius + 0.5)

                        # Spatial query using index
                        candidate_indices = list(gdf.sindex.intersection(buffer_curv.bounds))
                        if candidate_indices:
                            candidates = gdf.iloc[candidate_indices]

                            # Find features that actually intersect the buffer
                            intersecting_curv = candidates[candidates.intersects(buffer_curv)]
                            if not intersecting_curv.empty:
                                # Merge all intersecting geometries
                                from shapely.ops import linemerge, unary_union
                                merged_geom = unary_union(intersecting_curv.geometry.tolist())

                                # Apply linemerge to connect segments if possible
                                if merged_geom.geom_type == 'MultiLineString':
                                    merged_geom = linemerge(merged_geom)

                                # IMPORTANT: Process UNCLIPPED geometry to preserve sharp vertices
                                # Clipping can alter vertex angles at the boundary
                                # We'll filter individual vertices by distance instead
                                from shapely.geometry import LineString, MultiLineString
                                lines_to_process = []

                                if merged_geom.geom_type == 'LineString':
                                    lines_to_process = [merged_geom]
                                elif merged_geom.geom_type == 'MultiLineString':
                                    lines_to_process = list(merged_geom.geoms)
                                elif merged_geom.geom_type == 'GeometryCollection':
                                    lines_to_process = [g for g in merged_geom.geoms if g.geom_type == 'LineString']

                                # Calculate radius for each line segment
                                for line in lines_to_process:
                                    if line.is_empty:
                                        continue

                                    # IMPROVED DENSIFICATION: Preserve original vertices + add interpolated points
                                    # This ensures we capture sharp bends encoded as vertices in the shapefile
                                    original_coords = list(line.coords)

                                    if len(original_coords) < 2:
                                        continue

                                    # Use finer densification step (0.25m instead of 1.0m)
                                    fine_step = 0.25

                                    # Build combined coordinate list: original vertices + interpolated points
                                    combined_coords = []

                                    for i in range(len(original_coords) - 1):
                                        # Always add the original vertex (this preserves sharp angles)
                                        combined_coords.append(original_coords[i])

                                        # Calculate segment between this vertex and next
                                        segment = LineString([original_coords[i], original_coords[i+1]])
                                        segment_length = segment.length

                                        # Add densified points between vertices
                                        if segment_length > fine_step:
                                            num_intermediate = int(segment_length / fine_step)
                                            for j in range(1, num_intermediate + 1):
                                                dist = j * fine_step
                                                if dist < segment_length:
                                                    pt_interp = segment.interpolate(dist)
                                                    combined_coords.append((pt_interp.x, pt_interp.y))

                                    # Add the final original vertex
                                    combined_coords.append(original_coords[-1])

                                    # Remove duplicate consecutive points (within epsilon tolerance)
                                    deduped_coords = [combined_coords[0]]
                                    for coord in combined_coords[1:]:
                                        prev = deduped_coords[-1]
                                        dist_sq = (coord[0] - prev[0])**2 + (coord[1] - prev[1])**2
                                        if dist_sq > epsilon * epsilon:
                                            deduped_coords.append(coord)

                                    # Mark which coordinates are within the analysis window
                                    # We need to keep triplets where AT LEAST ONE point is within range
                                    max_dist = collect_radius + 0.5  # 5.5m

                                    # Tag each coordinate with its distance to analysis point
                                    coords_with_dist = []
                                    for coord in deduped_coords:
                                        dist_to_pt = ((coord[0] - pt.x)**2 + (coord[1] - pt.y)**2)**0.5
                                        coords_with_dist.append((coord, dist_to_pt))

                                    # Analyze triplets - include if ANY of the 3 points is within range
                                    # This ensures we capture sharp bends near the boundary
                                    min_triplet_radius = float('inf')
                                    for i in range(len(coords_with_dist) - 2):
                                        coord_a, dist_a = coords_with_dist[i]
                                        coord_b, dist_b = coords_with_dist[i + 1]
                                        coord_c, dist_c = coords_with_dist[i + 2]

                                        # Include triplet if at least one point is within range
                                        if min(dist_a, dist_b, dist_c) <= max_dist:
                                            # Calculate circumradius for this triplet
                                            A = Point(coord_a)
                                            B = Point(coord_b)
                                            C = Point(coord_c)

                                            a = A.distance(B)
                                            b = B.distance(C)
                                            c = A.distance(C)

                                            # Skip degenerate triangles
                                            if a < epsilon or b < epsilon or c < epsilon:
                                                continue

                                            # Calculate using Heron's formula
                                            p = 0.5 * (a + b + c)
                                            area_sq = p * (p - a) * (p - b) * (p - c)

                                            if area_sq <= epsilon:
                                                continue  # Nearly collinear

                                            R = (a * b * c) / (4.0 * area_sq**0.5)
                                            if R < min_triplet_radius:
                                                min_triplet_radius = R

                                    # Update overall minimum
                                    if min_triplet_radius != float('inf'):
                                        segment_min_radius = min_triplet_radius
                                        if min_radius is None or segment_min_radius < min_radius:
                                            min_radius = segment_min_radius

            except Exception as e:
                print(f"Warning: Error calculating curvature from {found_layer}: {e}")

        return (min_radius, found_width)

    def _calculate_min_radius_triplet(self, coordinates, epsilon=1e-6, return_details=False):
        """
        Calculate minimum circumradius from a list of coordinates using the triplet method.

        Args:
            coordinates: List of (x, y) coordinate tuples
            epsilon: Minimum threshold for distance/area calculations
            return_details: If True, return detailed calculation info for diagnostics

        Returns:
            If return_details=False:
                float or None: Minimum circumradius in meters, or None if no valid triplets
            If return_details=True:
                tuple: (min_radius, details_dict) where details_dict contains:
                    - all_triplets: List of all calculated radii with coordinates
                    - min_triplet: The triplet that produced minimum radius
                    - calculation_steps: Detailed step-by-step calculation
        """
        if len(coordinates) < 3:
            if return_details:
                return None, {
                    "error": "Insufficient points",
                    "num_points": len(coordinates),
                    "required": 3
                }
            return None

        min_radius = float('inf')
        min_triplet_idx = None
        all_triplets = []

        # Slide through all consecutive triplets
        for i in range(len(coordinates) - 2):
            A = coordinates[i]
            B = coordinates[i + 1]
            C = coordinates[i + 2]

            # Calculate side lengths using Euclidean distance
            a = np.sqrt((B[0] - A[0])**2 + (B[1] - A[1])**2)  # dist(A, B)
            b = np.sqrt((C[0] - B[0])**2 + (C[1] - B[1])**2)  # dist(B, C)
            c = np.sqrt((C[0] - A[0])**2 + (C[1] - A[1])**2)  # dist(A, C)

            # Skip degenerate cases (zero-length segments)
            if a < epsilon or b < epsilon or c < epsilon:
                if return_details:
                    all_triplets.append({
                        "index": i,
                        "points": [A, B, C],
                        "skipped": "degenerate",
                        "reason": "Side length too small"
                    })
                continue

            # Calculate semi-perimeter
            p = 0.5 * (a + b + c)

            # Calculate area using Heron's formula
            area_squared = p * (p - a) * (p - b) * (p - c)

            # Skip if area is too small (collinear points)
            if area_squared <= epsilon:
                if return_details:
                    all_triplets.append({
                        "index": i,
                        "points": [A, B, C],
                        "skipped": "collinear",
                        "reason": "Points are nearly collinear"
                    })
                continue

            # Calculate area
            area = np.sqrt(area_squared)

            # Calculate circumradius: R = (a * b * c) / (4 * area)
            R = (a * b * c) / (4.0 * area)

            if return_details:
                all_triplets.append({
                    "index": i,
                    "points": [A, B, C],
                    "sides": {"a": float(a), "b": float(b), "c": float(c)},
                    "semi_perimeter": float(p),
                    "area": float(area),
                    "radius": float(R),
                    "is_minimum": False  # Will update later
                })

            # Track minimum radius
            if R < min_radius:
                min_radius = R
                min_triplet_idx = len(all_triplets) - 1 if return_details else i

        # Return None if no valid triplets were found
        if min_radius == float('inf'):
            if return_details:
                return None, {
                    "error": "No valid triplets",
                    "total_points": len(coordinates),
                    "all_triplets": all_triplets
                }
            return None

        if return_details:
            # Mark the minimum triplet
            if min_triplet_idx is not None and all_triplets:
                all_triplets[min_triplet_idx]["is_minimum"] = True

            # Create detailed explanation
            min_triplet = all_triplets[min_triplet_idx] if min_triplet_idx is not None else None

            details = {
                "min_radius": float(min_radius),
                "total_triplets_checked": len(coordinates) - 2,
                "valid_triplets": len([t for t in all_triplets if "radius" in t]),
                "skipped_triplets": len([t for t in all_triplets if "skipped" in t]),
                "all_triplets": all_triplets,
                "min_triplet": min_triplet,
                "calculation_steps": self._format_calculation_steps(min_triplet) if min_triplet else None
            }

            return float(min_radius), details

        return min_radius

    def _format_calculation_steps(self, triplet):
        """Format the calculation steps for a triplet in human-readable form."""
        if not triplet or "radius" not in triplet:
            return None

        sides = triplet["sides"]
        return {
            "step_1": {
                "description": "Measure triangle sides",
                "formula": "a = distance(A, B), b = distance(B, C), c = distance(A, C)",
                "values": {
                    "side_a": f"{sides['a']:.2f} meters",
                    "side_b": f"{sides['b']:.2f} meters",
                    "side_c": f"{sides['c']:.2f} meters"
                },
                "result": f"a={sides['a']:.2f}m, b={sides['b']:.2f}m, c={sides['c']:.2f}m"
            },
            "step_2": {
                "description": "Calculate semi-perimeter",
                "formula": "p = (a + b + c) / 2",
                "calculation": f"({sides['a']:.2f} + {sides['b']:.2f} + {sides['c']:.2f}) / 2",
                "result": f"{triplet['semi_perimeter']:.2f} meters"
            },
            "step_3": {
                "description": "Calculate triangle area using Heron's formula",
                "formula": "area = √(p × (p-a) × (p-b) × (p-c))",
                "calculation": f"√({triplet['semi_perimeter']:.2f} × {triplet['semi_perimeter'] - sides['a']:.2f} × {triplet['semi_perimeter'] - sides['b']:.2f} × {triplet['semi_perimeter'] - sides['c']:.2f})",
                "result": f"{triplet['area']:.2f} square meters"
            },
            "step_4": {
                "description": "Calculate circumradius",
                "formula": "R = (a × b × c) / (4 × area)",
                "calculation": f"({sides['a']:.2f} × {sides['b']:.2f} × {sides['c']:.2f}) / (4 × {triplet['area']:.2f})",
                "result": f"{triplet['radius']:.2f} meters"
            },
            "conclusion": {
                "description": "Compare with threshold",
                "threshold": "10.0 meters",
                "result": f"{triplet['radius']:.2f} meters",
                "classification": "Sharp Turn (< 10m)" if triplet['radius'] < 10.0 else "No Sharp Turn (≥ 10m)"
            }
        }

    def get_curvature(self, point, sharp_turn_threshold=10.0, default_value=2):
        """
        Calculate curvature for a segment using actual path centerline shapefiles.

        Curvature is a categorical attribute indicating whether a sharp turn is present at or near
        a segment location. This method queries actual cycling/footpath/shared path centerline
        shapefiles from Singapore's infrastructure database to find the real path geometry, then
        calculates the minimum circumradius within a local search window.

        This implements the two-stage process from the original PathAssignmentTool:
        - Stage 1: Expanding ring search (1m→5m) to locate the nearest path
        - Stage 2: Fixed window analysis (5m) to calculate curvature from that path

        Args:
            point: Shapely Point or (lon, lat) tuple representing the segment's starting point
            sharp_turn_threshold: Radius in meters below which indicates a sharp turn (default: 10.0m)
            default_value: Default category value (2 = No Sharp Turn Present) if no data found

        Returns:
            int: Curvature category
                 1 = 'Sharp Turn Present' (minimum radius < 10m)
                 2 = 'No Sharp Turn Present' (minimum radius >= 10m or no data)

        Algorithm:
        1. Extract starting point from segment geometry
        2. Use two-stage process to find path and calculate curvature:
           - Stage 1: Expanding ring (1m→5m) finds nearest path
           - Stage 2: Fixed 5m window calculates curvature from that path
        3. Densify paths (1m intervals) for accurate curvature detection
        4. Calculate minimum circumradius using triplet method
        5. Classify: radius < 10m → Sharp Turn (1), otherwise No Sharp Turn (2)
        """
        # Use the two-stage shapefile-based radius calculation
        # Defaults match original PathAssignmentTool:
        #   start_radius=1.0, max_radius=5.0, step=1.0,
        #   collect_radius=5.0, sample_half_window=1.0
        min_radius, _ = self.get_radius_and_width_at_point(
            point=point,
            # Uses default parameters from original implementation
        )

        # If no radius could be calculated, return default
        if min_radius is None:
            return default_value

        # Classify based on threshold
        if min_radius < sharp_turn_threshold:
            return 1  # Sharp Turn Present
        else:
            return 2  # No Sharp Turn Present

    def get_curvature_visualization(self, point, collect_radius=5.0):
        """
        Generate visualization data for curvature analysis at a given point.

        This method returns all the data needed to visualize the curvature calculation:
        - The analysis point (red dot)
        - The 5-meter analysis window (black circle)
        - Path centerlines within the window (color-coded by type)
        - Calculated radius and width values

        Args:
            point: Shapely Point or (lon, lat) tuple in WGS84
            collect_radius: Radius in meters for the analysis window (default: 5.0m)

        Returns:
            dict: Visualization data containing:
                - point: {"lon": float, "lat": float} - Analysis point in WGS84
                - radius: float or None - Calculated curvature radius in meters
                - width: float or None - Path width in meters
                - circle_geojson: GeoJSON Feature - The analysis circle
                - paths: list[dict] - Path segments with type and coordinates
                - layer_used: str or None - Which layer provided the data ("cycling", "shared", "footpath")
        """
        # Convert point to metric CRS (EPSG:3414)
        pt = self.store.to_metric_point(point)

        # Calculate radius and width using the two-stage process
        min_radius, width = self.get_radius_and_width_at_point(
            point=point,
            collect_radius=collect_radius
        )

        # Create the analysis circle (5m buffer in EPSG:3414)
        circle_geom_3414 = pt.buffer(collect_radius)

        # Transform circle to WGS84 for frontend display
        from pyproj import Transformer
        transformer = Transformer.from_crs("EPSG:3414", "EPSG:4326", always_xy=True)

        # Transform circle coordinates
        circle_coords_wgs84 = []
        for x, y in circle_geom_3414.exterior.coords:
            lon, lat = transformer.transform(x, y)
            circle_coords_wgs84.append([lon, lat])

        circle_geojson = {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [circle_coords_wgs84]
            },
            "properties": {
                "radius_m": collect_radius,
                "style": {
                    "color": "#000000",
                    "weight": 2,
                    "fill": False
                }
            }
        }

        # Load path layers and collect paths within the circle
        priority = ["cycling", "shared", "footpath"]
        layer_names = {
            "cycling": "cycling_path",
            "shared": "shared_path",
            "footpath": "footpath"
        }
        color_map = {
            "cycling": [0, 180, 0],      # Green
            "shared": [230, 140, 0],     # Orange
            "footpath": [30, 144, 255]   # Blue
        }

        paths = []

        # Determine which layer was used for calculation (if any)
        # We need to run the width search again to find out which layer provided data
        found_layer = None
        current_radius = 1.0
        while current_radius <= 5.0 and found_layer is None:
            buffer_ring = pt.buffer(current_radius)
            for layer_key in priority:
                try:
                    gdf = self.store.get(layer_names[layer_key])
                    if gdf is None or gdf.empty:
                        continue

                    if gdf.crs.to_epsg() != 3414:
                        gdf = gdf.to_crs("EPSG:3414")

                    candidate_indices = list(gdf.sindex.intersection(buffer_ring.bounds))
                    if not candidate_indices:
                        continue

                    candidates = gdf.iloc[candidate_indices]
                    intersecting = candidates[candidates.intersects(buffer_ring)]

                    if not intersecting.empty:
                        found_layer = layer_key
                        break
                except Exception:
                    continue
            current_radius += 1.0

        # Collect paths from all layers within the circle for visualization
        for layer_key in priority:
            try:
                gdf = self.store.get(layer_names[layer_key])
                if gdf is None or gdf.empty:
                    continue

                # Ensure metric CRS
                if gdf.crs.to_epsg() != 3414:
                    gdf = gdf.to_crs("EPSG:3414")

                # Remove Z-coordinates if present
                if len(gdf) > 0 and gdf.geometry.iloc[0].has_z:
                    gdf.geometry = gdf.geometry.apply(
                        lambda geom: self._remove_z_coordinate(geom) if geom is not None else None
                    )

                # Filter to valid geometries
                gdf = gdf[gdf.geometry.notna() & gdf.geometry.is_valid].copy()
                if gdf.empty:
                    continue

                # Spatial query using index
                candidate_indices = list(gdf.sindex.intersection(circle_geom_3414.bounds))
                if not candidate_indices:
                    continue

                candidates = gdf.iloc[candidate_indices]
                intersecting = candidates[candidates.intersects(circle_geom_3414)]

                if intersecting.empty:
                    continue

                # Process each intersecting path
                for geom in intersecting.geometry:
                    if geom is None or geom.is_empty:
                        continue

                    try:
                        # Clip to circle
                        clipped = geom.intersection(circle_geom_3414)
                    except Exception:
                        clipped = geom.buffer(0).intersection(circle_geom_3414)

                    # Extract LineStrings from clipped geometry
                    lines = []

                    if clipped.geom_type == 'LineString':
                        lines = [clipped]
                    elif clipped.geom_type == 'MultiLineString':
                        lines = list(clipped.geoms)
                    elif clipped.geom_type == 'GeometryCollection':
                        lines = [g for g in clipped.geoms if g.geom_type == 'LineString']

                    # Transform each line to WGS84 and add to paths
                    for line in lines:
                        if line.is_empty:
                            continue

                        coords_wgs84 = []
                        for x, y in line.coords:
                            lon, lat = transformer.transform(x, y)
                            coords_wgs84.append([lon, lat])

                        paths.append({
                            "type": layer_key,
                            "color": color_map.get(layer_key, [0, 0, 0]),
                            "coordinates": coords_wgs84,
                            "is_analysis_layer": (layer_key == found_layer)
                        })

            except Exception as e:
                print(f"Warning: Error collecting paths from {layer_key} for visualization: {e}")
                continue

        # Get point coordinates in WGS84
        if isinstance(point, tuple):
            point_lon, point_lat = point
        else:
            # Transform from metric to WGS84
            point_lon, point_lat = transformer.transform(pt.x, pt.y)

        # Generate detailed diagnostics if curvature was calculated
        diagnostics = None
        if found_layer is not None and min_radius is not None:
            try:
                # Re-run calculation with details for diagnostics
                gdf = self.store.get(layer_names[found_layer])
                if gdf is not None and not gdf.empty:
                    if gdf.crs.to_epsg() != 3414:
                        gdf = gdf.to_crs("EPSG:3414")

                    if len(gdf) > 0 and gdf.geometry.iloc[0].has_z:
                        gdf.geometry = gdf.geometry.apply(
                            lambda geom: self._remove_z_coordinate(geom) if geom is not None else None
                        )

                    gdf = gdf[gdf.geometry.notna() & gdf.geometry.is_valid].copy()

                    if not gdf.empty:
                        buffer_curv = pt.buffer(collect_radius)
                        candidate_indices = list(gdf.sindex.intersection(buffer_curv.bounds))

                        if candidate_indices:
                            candidates = gdf.iloc[candidate_indices]
                            intersecting_curv = candidates[candidates.intersects(buffer_curv)]

                            if not intersecting_curv.empty:
                                from shapely.ops import linemerge, unary_union
                                merged_geom = unary_union(intersecting_curv.geometry.tolist())

                                if merged_geom.geom_type == 'MultiLineString':
                                    merged_geom = linemerge(merged_geom)

                                clipped_geom = merged_geom.intersection(buffer_curv)

                                # Get densified coordinates
                                lines_to_process = []
                                if clipped_geom.geom_type == 'LineString':
                                    lines_to_process = [clipped_geom]
                                elif clipped_geom.geom_type == 'MultiLineString':
                                    lines_to_process = list(clipped_geom.geoms)
                                elif clipped_geom.geom_type == 'GeometryCollection':
                                    lines_to_process = [g for g in clipped_geom.geoms if g.geom_type == 'LineString']

                                # Calculate with details for the first line
                                if lines_to_process:
                                    line = lines_to_process[0]
                                    if not line.is_empty and line.length >= 1.0:
                                        # Densify
                                        densified_coords = []
                                        num_points = int(line.length / 1.0)
                                        for i in range(num_points + 1):
                                            distance = min(i * 1.0, line.length)
                                            point_on_line = line.interpolate(distance)
                                            densified_coords.append((point_on_line.x, point_on_line.y))

                                        if len(densified_coords) > 0:
                                            last_coord = list(line.coords)[-1]
                                            if densified_coords[-1] != last_coord:
                                                densified_coords.append(last_coord)

                                        if len(densified_coords) >= 3:
                                            _, details = self._calculate_min_radius_triplet(densified_coords, epsilon=1e-6, return_details=True)
                                            diagnostics = details

            except Exception as e:
                print(f"Warning: Error generating diagnostics: {e}")

        return {
            "point": {
                "lon": point_lon,
                "lat": point_lat
            },
            "radius": min_radius,
            "width": width,
            "circle_geojson": circle_geojson,
            "paths": paths,
            "layer_used": found_layer,
            "analysis_window_m": collect_radius,
            "diagnostics": diagnostics
        }

    def get_facility_width(self, point, start_radius=2.0, max_radius=10.0, step_size=2.0, default_value=2):
        """
        Get the facility width per direction for a point using expanding ring search.

        This implementation uses the same process as PathAssignmentTool, leveraging the
        path_width_curvature utility module which provides sophisticated width extraction
        with geometry merging, Z-coordinate removal, and comprehensive caching.

        Args:
            point: Shapely Point or (lon, lat) tuple in WGS84 or metric CRS
            start_radius: Initial search radius in meters (default: 2.0m)
            max_radius: Maximum search radius in meters (default: 10.0m)
            step_size: Radius increment in meters (default: 2.0m)
            default_value: Default category value (2 = Narrow) if no width found

        Returns:
            int: Facility width category
                 1 = 'Very Narrow' (≤ 2 meters)
                 2 = 'Narrow' (> 2 and ≤ 4 meters) - Default
                 3 = 'Wide' (> 4 meters)

        Note: This method uses the same algorithm as PathAssignmentTool:
        - Expanding ring search with priority-based layer matching
        - First-hit width locking (nearest path width is used)
        - Automatic WIDTH column standardization
        - Comprehensive geometry cleaning (remove Z, validation)
        - File modification time-based caching
        """
        # Convert point to metric CRS (EPSG:3414)
        pt = self.store.to_metric_point(point)

        # Get base directory for shapefiles from one of the registered paths
        # Extract the base directory from the cycling_path entry
        base_dir = None
        if "cycling_path" in self.store.paths:
            # Get parent of "path" directory (e.g., /path/to/shapefiles/path/file.shp -> /path/to/shapefiles)
            cycling_path = self.store.paths["cycling_path"]
            base_dir = str(cycling_path.parent.parent)

        # Use the PathAssignmentTool's utility function to get radius and width
        # radius is not used here but returned for potential future use
        _radius, width = get_radius_and_width_at_point(
            pt,
            start_radius=start_radius,
            max_radius=max_radius,
            step=step_size,
            priority=["cycling", "shared", "footpath"],
            base_dir=base_dir
        )

        # Categorize the found width using the same thresholds as PathAssignmentTool
        if width is None:
            return default_value  # Default: Narrow (2)
        elif width > 4:
            return 3  # Wide
        elif width > 2:
            return 2  # Narrow
        else:
            return 1  # Very Narrow

    def get_width_visualization(self, point, start_radius=1.0, max_radius=10.0, step=1.0):
        """
        Generate visualization data for facility width analysis.

        Similar to curvature visualization, this returns data for interactive display showing:
        - Analysis point
        - Expanding ring search pattern
        - Path centerlines color-coded by type
        - Which layer provided the width
        - Width distribution statistics

        Args:
            point: Shapely Point or (lon, lat) tuple in WGS84
            start_radius: Initial search radius in meters (default: 1.0m)
            max_radius: Maximum search radius in meters (default: 10.0m)
            step: Radius increment in meters (default: 1.0m)

        Returns:
            dict: Visualization data
        """
        from pyproj import Transformer

        # Convert point to metric CRS
        pt = self.store.to_metric_point(point)

        # Load path layers
        priority = ["cycling", "shared", "footpath"]
        layer_names = {
            "cycling": "cycling_path",
            "shared": "shared_path",
            "footpath": "footpath"
        }
        color_map = {
            "cycling": [0, 180, 0],      # Green
            "shared": [230, 140, 0],     # Orange
            "footpath": [30, 144, 255]   # Blue
        }

        layers = {}
        width_distribution = {}

        for layer_key in priority:
            try:
                gdf = self.store.get(layer_names[layer_key])
                if gdf is None or gdf.empty:
                    layers[layer_key] = None
                    width_distribution[layer_key] = {"min": None, "max": None, "count": 0}
                    continue

                if gdf.crs.to_epsg() != 3414:
                    gdf = gdf.to_crs("EPSG:3414")

                layers[layer_key] = gdf

                # Get width distribution
                if "WIDTH" in gdf.columns:
                    valid_widths = gdf["WIDTH"].dropna()
                    if len(valid_widths) > 0:
                        width_distribution[layer_key] = {
                            "min": float(valid_widths.min()),
                            "max": float(valid_widths.max()),
                            "count": len(gdf)
                        }
                    else:
                        width_distribution[layer_key] = {"min": None, "max": None, "count": len(gdf)}
                else:
                    width_distribution[layer_key] = {"min": None, "max": None, "count": len(gdf)}

            except Exception as e:
                print(f"Warning: Could not load {layer_key}: {e}")
                layers[layer_key] = None
                width_distribution[layer_key] = {"min": None, "max": None, "count": 0}

        # Perform expanding ring search with diagnostics
        search_rings = []
        found_width = None
        found_layer = None
        found_radius = None

        # Track footpath detection for cycling path override logic
        footpath_detected = False
        footpath_width = None

        for radius in np.arange(start_radius, max_radius + step, step):
            buf = pt.buffer(radius)
            candidates_by_layer = {}

            for layer_key in priority:
                gdf = layers[layer_key]
                if gdf is None or gdf.empty:
                    candidates_by_layer[layer_key] = 0
                    continue

                try:
                    idx = list(gdf.sindex.query(buf, predicate="intersects"))
                except:
                    idx = []

                candidates_by_layer[layer_key] = len(idx)

                # Lock width if not yet set
                if idx and found_width is None:
                    candidates = gdf.iloc[idx].copy()

                    if "WIDTH" in candidates.columns:
                        candidates["_WIDTH_NUM"] = pd.to_numeric(candidates["WIDTH"], errors='coerce')
                        valid = candidates[candidates["_WIDTH_NUM"].notna()]

                        if not valid.empty:
                            dists = valid.geometry.distance(pt)
                            nearest_idx = dists.idxmin()
                            width_val = float(valid.loc[nearest_idx, "_WIDTH_NUM"])

                            # Track if this is a footpath
                            if layer_key == "footpath":
                                footpath_detected = True
                                footpath_width = width_val

                            found_width = width_val
                            found_layer = layer_key
                            found_radius = radius

            search_rings.append({
                "radius": float(radius),
                "center": [point.x if hasattr(point, 'x') else point[0],
                          point.y if hasattr(point, 'y') else point[1]],
                "candidates_by_layer": candidates_by_layer,
                "width_locked": found_width is not None
            })

        # SPECIAL LOGIC: If on/near footpath, check if cycling path is within 1.5m
        # If so, use the cycling path width instead
        if footpath_detected and found_layer == "footpath":
            cycling_override_radius = 1.5  # meters
            cycling_gdf = layers.get("cycling")

            if cycling_gdf is not None and not cycling_gdf.empty:
                cycling_buf = pt.buffer(cycling_override_radius)
                try:
                    cycling_idx = list(cycling_gdf.sindex.query(cycling_buf, predicate="intersects"))

                    if cycling_idx:
                        cycling_candidates = cycling_gdf.iloc[cycling_idx].copy()

                        if "WIDTH" in cycling_candidates.columns:
                            cycling_candidates["_WIDTH_NUM"] = pd.to_numeric(cycling_candidates["WIDTH"], errors='coerce')
                            cycling_valid = cycling_candidates[cycling_candidates["_WIDTH_NUM"].notna()]

                            if not cycling_valid.empty:
                                # Found cycling path within 1.5m - use it instead
                                cycling_dists = cycling_valid.geometry.distance(pt)
                                cycling_nearest_idx = cycling_dists.idxmin()
                                found_width = float(cycling_valid.loc[cycling_nearest_idx, "_WIDTH_NUM"])
                                found_layer = "cycling"
                                # Keep the original found_radius (where footpath was found)
                                # Add note that cycling path was prioritized
                except:
                    pass  # Cycling override failed, keep footpath width

        # Categorize width
        # Very Narrow: < 2m
        # Narrow: >= 2m and <= 4m
        # Wide: > 4m
        if found_width is None:
            width_category = 2  # Default: Narrow
        elif found_width > 4:
            width_category = 3  # Wide
        elif found_width >= 2:
            width_category = 2  # Narrow
        else:
            width_category = 1  # Very Narrow (< 2m)

        # Collect path geometries within visualization radius (20m)
        viz_radius = 20.0
        viz_buffer = pt.buffer(viz_radius)
        paths = []

        transformer = Transformer.from_crs("EPSG:3414", "EPSG:4326", always_xy=True)

        for layer_key in priority:
            gdf = layers[layer_key]
            if gdf is None or gdf.empty:
                continue

            try:
                idx = list(gdf.sindex.query(viz_buffer, predicate="intersects"))
            except:
                idx = []

            if not idx:
                continue

            nearby = gdf.iloc[idx]

            for _, feature in nearby.iterrows():
                geom = feature.geometry
                if geom is None or geom.is_empty:
                    continue

                # Transform to WGS84
                coords_wgs84 = []

                # Handle both LineString and MultiLineString geometries
                if geom.geom_type == "LineString":
                    for coord in geom.coords:
                        x, y = coord[0], coord[1]  # Handle both 2D and 3D coords
                        lon, lat = transformer.transform(x, y)
                        coords_wgs84.append([lon, lat])
                elif geom.geom_type == "MultiLineString":
                    # For MultiLineString, concatenate all parts
                    for line in geom.geoms:
                        for coord in line.coords:
                            x, y = coord[0], coord[1]  # Handle both 2D and 3D coords
                            lon, lat = transformer.transform(x, y)
                            coords_wgs84.append([lon, lat])
                else:
                    # Skip unsupported geometry types
                    continue

                width_value = feature.get("WIDTH", None)

                paths.append({
                    "type": layer_key,
                    "color": color_map.get(layer_key, [0, 0, 0]),
                    "coordinates": coords_wgs84,
                    "is_analysis_layer": (layer_key == found_layer) if found_layer else False,
                    "width_value": float(width_value) if width_value is not None else None
                })

        # Get point coordinates
        if isinstance(point, tuple):
            point_lon, point_lat = point
        else:
            point_lon, point_lat = point.x, point.y

        return {
            "point": {
                "lon": point_lon,
                "lat": point_lat
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
                1: "Very Narrow (< 2m)",
                2: "Narrow (2-4m)",
                3: "Wide (> 4m)"
            }
        }

    @staticmethod
    def _remove_z_coordinate(geom):
        """Remove Z-coordinate from geometry (convert 3D to 2D)"""
        from shapely.geometry import LineString, Point, Polygon, MultiLineString, MultiPoint, MultiPolygon

        if geom is None or geom.is_empty:
            return geom

        geom_type = geom.geom_type

        if geom_type == 'Point':
            return Point(geom.x, geom.y)
        elif geom_type == 'LineString':
            return LineString([(x, y) for x, y, *_ in geom.coords])
        elif geom_type == 'Polygon':
            exterior = [(x, y) for x, y, *_ in geom.exterior.coords]
            interiors = [[(x, y) for x, y, *_ in interior.coords] for interior in geom.interiors]
            return Polygon(exterior, interiors)
        elif geom_type == 'MultiPoint':
            return MultiPoint([Point(p.x, p.y) for p in geom.geoms])
        elif geom_type == 'MultiLineString':
            return MultiLineString([LineString([(x, y) for x, y, *_ in line.coords]) for line in geom.geoms])
        elif geom_type == 'MultiPolygon':
            return MultiPolygon([
                Polygon(
                    [(x, y) for x, y, *_ in poly.exterior.coords],
                    [[(x, y) for x, y, *_ in interior.coords] for interior in poly.interiors]
                )
                for poly in geom.geoms
            ])
        else:
            # For other geometry types, return as-is
            return geom

    @staticmethod
    def _standardize_width_column(gdf):
        """
        Standardize WIDTH column in the GeoDataFrame.

        Looks for various width column candidates (case-insensitive):
        - WIDTH, width, Width
        - PATH_WIDTH, path_width, Path_Width
        - L_WIDTH, R_WIDTH, AVG_WIDTH, avg_width
        - Wdth, WID, Width_m, WIDTH_M

        If found, renames to "WIDTH" and converts to numeric type.
        If not found, creates "WIDTH" column with NaN values.

        Args:
            gdf: GeoDataFrame with potential width columns

        Returns:
            GeoDataFrame with standardized "WIDTH" column
        """
        # Width column candidates (case-insensitive)
        width_candidates = [
            "WIDTH", "width", "Width",
            "PATH_WIDTH", "path_width", "Path_Width",
            "L_WIDTH", "R_WIDTH", "AVG_WIDTH", "avg_width",
            "Wdth", "WID", "Width_m", "WIDTH_M"
        ]

        # Find the first matching column
        found_col = None
        for candidate in width_candidates:
            # Case-insensitive search
            matching_cols = [col for col in gdf.columns if col.upper() == candidate.upper()]
            if matching_cols:
                found_col = matching_cols[0]
                break

        if found_col and found_col != "WIDTH":
            # Rename to standardized "WIDTH"
            gdf = gdf.rename(columns={found_col: "WIDTH"})
        elif not found_col:
            # Create WIDTH column with NaN values
            gdf["WIDTH"] = np.nan

        # Convert to numeric type (coercing errors to NaN)
        if "WIDTH" in gdf.columns:
            gdf["WIDTH"] = pd.to_numeric(gdf["WIDTH"], errors='coerce')

        return gdf