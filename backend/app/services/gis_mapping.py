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

    def add_path(self, name: str, path: str | Path):
        self.paths[name] = Path(path)

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