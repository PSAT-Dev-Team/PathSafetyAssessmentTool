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

    def get_curvature(self, linestring_geometry, sharp_turn_threshold=15.0, densify_step=0.5, epsilon=1e-10, default_value=2):
        """
        Calculate curvature of a cycling facility path using the circumcircle method.

        Curvature is a categorical attribute indicating whether a sharp turn is present on the
        cycling facility path. The calculation uses a circumcircle-based algorithm that analyzes
        the path geometry by sliding a 3-point window through all vertices and calculating the
        minimum circumradius.

        Args:
            linestring_geometry: Shapely LineString geometry in any CRS (will be converted to metric)
            sharp_turn_threshold: Radius threshold in meters below which indicates a sharp turn (default: 15.0m)
            densify_step: Distance in meters between interpolated points for smoother detection (default: 0.5m)
            epsilon: Minimum area value to detect collinear points (default: 1e-10)
            default_value: Default category value (2 = No Sharp Turn Present) for edge cases

        Returns:
            int: Curvature category
                 1 = 'Sharp Turn Present' (minimum radius < threshold)
                 2 = 'No Sharp Turn Present' (minimum radius >= threshold, default)

        Implementation follows the circumcircle method specification:
        1. Convert geometry to metric CRS (EPSG:3414)
        2. Densify the LineString by inserting vertices every densify_step meters
        3. Extract all coordinate points from densified geometry
        4. Slide through all consecutive triplets (A, B, C)
        5. For each triplet:
           a. Calculate side lengths: a = dist(A,B), b = dist(B,C), c = dist(A,C)
           b. Calculate semi-perimeter: p = 0.5 * (a + b + c)
           c. Calculate area using Heron's formula: area² = p * (p-a) * (p-b) * (p-c)
           d. Calculate circumradius: R = (a * b * c) / (4 * area)
        6. Track minimum radius across all triplets
        7. Compare minimum radius against threshold to determine sharp turn
        """
        from shapely.geometry import LineString

        # Handle null or invalid geometry
        if linestring_geometry is None or linestring_geometry.is_empty:
            return default_value

        # Convert to metric CRS if needed
        if not isinstance(linestring_geometry, LineString):
            return default_value

        # Create a GeoDataFrame to handle CRS conversion
        from geopandas import GeoDataFrame
        temp_gdf = GeoDataFrame(geometry=[linestring_geometry], crs=CRS_WGS84)

        # Check if already in metric CRS (heuristic: if coordinates are large, assume metric)
        coords = list(linestring_geometry.coords)
        if len(coords) > 0:
            x, y = coords[0]
            # If coordinates look like lat/lon, convert to metric
            if -180 <= x <= 180 and -90 <= y <= 90:
                temp_gdf = temp_gdf.to_crs(CRS_METRIC)
                linestring_geometry = temp_gdf.geometry.iloc[0]

        # Densify the LineString for better curvature detection
        # Insert vertices every densify_step meters along the line
        if linestring_geometry.length > 0:
            num_points = int(linestring_geometry.length / densify_step)
            if num_points > 1:
                # Interpolate points along the line
                densified_coords = []
                for i in range(num_points + 1):
                    distance = min(i * densify_step, linestring_geometry.length)
                    point = linestring_geometry.interpolate(distance)
                    densified_coords.append((point.x, point.y))
                # Add the end point if not already included
                if densified_coords[-1] != coords[-1]:
                    densified_coords.append(coords[-1])
                linestring_geometry = LineString(densified_coords)

        # Extract coordinates from densified geometry
        coordinates = list(linestring_geometry.coords)

        # Need at least 3 points to calculate curvature
        if len(coordinates) < 3:
            return default_value

        # Initialize minimum radius to infinity
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

        # Apply threshold to determine sharp turn
        # If no valid triplets were found, min_radius will still be infinity
        if min_radius == float('inf'):
            return default_value

        if min_radius < sharp_turn_threshold:
            return 1  # Sharp Turn Present
        else:
            return 2  # No Sharp Turn Present