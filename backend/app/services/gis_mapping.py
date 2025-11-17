# gis_mapping.py
import geopandas as gpd
from shapely.geometry import Point
from pathlib import Path
import numpy as np
import pandas as pd

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

    def get_radius_and_width_at_point(self, point, search_radius=10.0, densify_step=1.0, epsilon=1e-6):
        """
        Calculate the minimum radius (curvature) and width at a specific point using actual path centerline shapefiles.

        This method queries cycling path, footpath, and shared path centerline shapefiles to find the actual
        infrastructure geometry near the point, then calculates the minimum circumradius (representing the
        sharpest turn) and extracts the width information.

        Args:
            point: Shapely Point or (lon, lat) tuple in WGS84 or metric CRS
            search_radius: Radius in meters to search for nearby path features (default: 10.0m)
            densify_step: Distance in meters between interpolated points for curvature calculation (default: 1.0m)
            epsilon: Minimum value for distance/area calculations to avoid numerical issues (default: 1e-6)

        Returns:
            tuple: (min_radius, width)
                - min_radius (float or None): Minimum circumradius in meters, or None if no valid calculation
                - width (float or None): Path width in meters, or None if not found

        Algorithm:
        1. Query shapefile layers within search_radius around the point
        2. Merge connectable line segments
        3. Clip merged geometry to the circular buffer
        4. Densify the line by inserting vertices every densify_step meters
        5. Calculate minimum radius using triplet method with circumcircle
        6. Extract width from shapefile attributes
        """
        # Convert point to metric CRS (EPSG:3414)
        pt = self.store.to_metric_point(point)

        # Create search buffer
        buffer_geom = pt.buffer(search_radius)

        # Load and prepare path shapefiles with priority order
        priority = ["cycling", "shared", "footpath"]
        layer_names = {
            "cycling": "cycling_path",
            "shared": "shared_path",
            "footpath": "footpath"
        }

        min_radius = None
        width = None

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
                candidate_indices = list(gdf.sindex.intersection(buffer_geom.bounds))
                if not candidate_indices:
                    continue

                candidates = gdf.iloc[candidate_indices]

                # Find features that actually intersect the buffer
                intersecting = candidates[candidates.intersects(buffer_geom)]
                if intersecting.empty:
                    continue

                # Merge all intersecting geometries
                from shapely.ops import linemerge, unary_union
                merged_geom = unary_union(intersecting.geometry.tolist())

                # Apply linemerge to connect segments if possible
                if merged_geom.geom_type == 'MultiLineString':
                    merged_geom = linemerge(merged_geom)

                # Clip to buffer
                clipped_geom = merged_geom.intersection(buffer_geom)

                # Handle different geometry types after clipping
                from shapely.geometry import LineString, MultiLineString
                lines_to_process = []

                if clipped_geom.geom_type == 'LineString':
                    lines_to_process = [clipped_geom]
                elif clipped_geom.geom_type == 'MultiLineString':
                    lines_to_process = list(clipped_geom.geoms)
                elif clipped_geom.geom_type == 'GeometryCollection':
                    lines_to_process = [g for g in clipped_geom.geoms if g.geom_type == 'LineString']

                if not lines_to_process:
                    continue

                # Calculate radius for each line segment
                for line in lines_to_process:
                    if line.is_empty or line.length < densify_step:
                        continue

                    # Densify the line
                    densified_coords = []
                    num_points = int(line.length / densify_step)
                    for i in range(num_points + 1):
                        distance = min(i * densify_step, line.length)
                        point_on_line = line.interpolate(distance)
                        densified_coords.append((point_on_line.x, point_on_line.y))

                    # Add the end point if not already included
                    if len(densified_coords) > 0:
                        last_coord = list(line.coords)[-1]
                        if densified_coords[-1] != last_coord:
                            densified_coords.append(last_coord)

                    # Calculate minimum radius using triplet method
                    if len(densified_coords) >= 3:
                        segment_min_radius = self._calculate_min_radius_triplet(densified_coords, epsilon)
                        if segment_min_radius is not None:
                            if min_radius is None or segment_min_radius < min_radius:
                                min_radius = segment_min_radius

                # Extract width if found radius in this layer
                if min_radius is not None and width is None:
                    # Standardize WIDTH column
                    intersecting_std = self._standardize_width_column(intersecting)
                    if 'WIDTH' in intersecting_std.columns:
                        # Get width from the nearest feature
                        distances = intersecting_std.geometry.distance(pt)
                        nearest_idx = distances.idxmin()
                        width_value = intersecting_std.loc[nearest_idx, 'WIDTH']
                        if pd.notna(width_value):
                            width = float(width_value)

                # If we found a radius in this priority layer, stop searching
                if min_radius is not None:
                    break

            except KeyError:
                continue
            except Exception as e:
                print(f"Warning: Error processing {layer_key} for radius calculation: {e}")
                continue

        return (min_radius, width)

    def _calculate_min_radius_triplet(self, coordinates, epsilon=1e-6):
        """
        Calculate minimum circumradius from a list of coordinates using the triplet method.

        Args:
            coordinates: List of (x, y) coordinate tuples
            epsilon: Minimum threshold for distance/area calculations

        Returns:
            float or None: Minimum circumradius in meters, or None if no valid triplets
        """
        if len(coordinates) < 3:
            return None

        min_radius = float('inf')

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
                continue

            # Calculate semi-perimeter
            p = 0.5 * (a + b + c)

            # Calculate area using Heron's formula
            area_squared = p * (p - a) * (p - b) * (p - c)

            # Skip if area is too small (collinear points)
            if area_squared <= epsilon:
                continue

            # Calculate area
            area = np.sqrt(area_squared)

            # Calculate circumradius: R = (a * b * c) / (4 * area)
            R = (a * b * c) / (4.0 * area)

            # Track minimum radius
            if R < min_radius:
                min_radius = R

        # Return None if no valid triplets were found
        if min_radius == float('inf'):
            return None

        return min_radius

    def get_curvature(self, point, sharp_turn_threshold=10.0, search_radius=10.0, default_value=2):
        """
        Calculate curvature for a segment using actual path centerline shapefiles.

        Curvature is a categorical attribute indicating whether a sharp turn is present at or near
        a segment location. This method queries actual cycling/footpath/shared path centerline
        shapefiles from Singapore's infrastructure database to find the real path geometry, then
        calculates the minimum circumradius within a local search window.

        Args:
            point: Shapely Point or (lon, lat) tuple representing the segment's starting point
            sharp_turn_threshold: Radius in meters below which indicates a sharp turn (default: 10.0m)
            search_radius: Radius in meters to search for nearby path features (default: 10.0m)
            default_value: Default category value (2 = No Sharp Turn Present) if no data found

        Returns:
            int: Curvature category
                 1 = 'Sharp Turn Present' (minimum radius < 10m)
                 2 = 'No Sharp Turn Present' (minimum radius >= 10m or no data)

        Algorithm:
        1. Extract starting point from segment geometry
        2. Query path centerline shapefiles within search_radius
        3. Merge and clip path geometries to the search buffer
        4. Densify paths (1m intervals) for accurate curvature detection
        5. Calculate minimum circumradius using triplet method
        6. Classify: radius < 10m → Sharp Turn (1), otherwise No Sharp Turn (2)
        """
        # Use the new shapefile-based radius calculation
        min_radius, _ = self.get_radius_and_width_at_point(
            point=point,
            search_radius=search_radius,
            densify_step=1.0,
            epsilon=1e-6
        )

        # If no radius could be calculated, return default
        if min_radius is None:
            return default_value

        # Classify based on threshold
        if min_radius < sharp_turn_threshold:
            return 1  # Sharp Turn Present
        else:
            return 2  # No Sharp Turn Present

    def get_facility_width(self, point, start_radius=2.0, max_radius=10.0, step_size=2.0, default_value=2):
        """
        Get the facility width per direction for a point using expanding ring search.

        Facility Width per Direction is a categorical attribute that represents the width of the
        cycling/pedestrian facility. The width is extracted from path centerline shapefiles that
        contain actual width measurements, then categorized into three classes.

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

        Implementation follows the expanding ring search specification:
        1. Load three path centerline shapefiles (cycling, footpath, shared)
        2. Convert all to EPSG:3414, clean geometries, standardize WIDTH column
        3. Use priority order: ["cycling", "shared", "footpath"]
        4. Expand search radius from start_radius to max_radius in step_size increments
        5. For each radius, check layers in priority order
        6. Lock the first valid width found (nearest path width)
        7. Categorize the width into Very Narrow/Narrow/Wide
        """
        # Convert point to metric CRS (EPSG:3414)
        pt = self.store.to_metric_point(point)

        # Load and prepare path shapefiles
        layers = {}
        priority = ["cycling", "shared", "footpath"]
        layer_names = {
            "cycling": "cycling_path",
            "shared": "shared_path",
            "footpath": "footpath"
        }

        for layer_key in priority:
            try:
                gdf = self.store.get(layer_names[layer_key])
                if gdf is None or gdf.empty:
                    layers[layer_key] = None
                    continue

                # Ensure metric CRS (should already be from LayerStore.get)
                if gdf.crs.to_epsg() != 3414:
                    gdf = gdf.to_crs("EPSG:3414")

                # Remove Z-coordinates (convert 3D to 2D geometries)
                if gdf.geometry.iloc[0].has_z if len(gdf) > 0 else False:
                    gdf.geometry = gdf.geometry.apply(
                        lambda geom: self._remove_z_coordinate(geom) if geom is not None else None
                    )

                # Filter to only valid geometries
                gdf = gdf[gdf.geometry.notna() & gdf.geometry.is_valid].copy()

                if gdf.empty:
                    layers[layer_key] = None
                    continue

                # Standardize WIDTH column
                gdf = self._standardize_width_column(gdf)

                # Build spatial index
                _ = gdf.sindex

                layers[layer_key] = gdf

            except KeyError:
                # Shapefile not registered
                layers[layer_key] = None
            except Exception as e:
                print(f"Warning: Could not load {layer_key} path shapefile: {e}")
                layers[layer_key] = None

        # Check if all layers are None
        if all(gdf is None for gdf in layers.values()):
            return default_value

        # Expanding ring search
        found_width = None

        for radius in np.arange(start_radius, max_radius + step_size, step_size):
            buffer_geom = pt.buffer(radius)

            for layer_key in priority:
                gdf = layers[layer_key]
                if gdf is None:
                    continue

                # Spatial query using index
                try:
                    candidate_indices = list(gdf.sindex.intersection(buffer_geom.bounds))
                except Exception:
                    # Fallback if spatial index fails
                    candidate_indices = []

                if not candidate_indices:
                    continue

                # Lock width if not yet set (first-hit locking)
                if found_width is None:
                    candidates = gdf.iloc[candidate_indices].copy()

                    # Filter to valid WIDTH values
                    if "WIDTH" in candidates.columns:
                        # Convert to numeric, coercing errors to NaN
                        candidates["WIDTH_NUMERIC"] = pd.to_numeric(candidates["WIDTH"], errors='coerce')
                        valid_candidates = candidates[candidates["WIDTH_NUMERIC"].notna()]

                        if not valid_candidates.empty:
                            # Calculate distances to point
                            valid_candidates = valid_candidates.copy()
                            valid_candidates["distance"] = valid_candidates.geometry.distance(pt)

                            # Find nearest feature
                            nearest_idx = valid_candidates["distance"].idxmin()
                            found_width = float(valid_candidates.loc[nearest_idx, "WIDTH_NUMERIC"])
                            # Width is now locked, continue scanning
                            break

        # Categorize the found width
        if found_width is None:
            return default_value  # Narrow (2)
        elif found_width > 4.0:
            return 3  # Wide
        elif found_width > 2.0:
            return 2  # Narrow
        else:
            return 1  # Very Narrow

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