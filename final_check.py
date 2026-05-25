import sys
from pathlib import Path
import geopandas as gpd
from shapely.geometry import LineString, Point

# Path setup
base_path = Path(r"C:\Users\Alaster\Documents\GitHub\PathSafetyAssessmentTool")
sys.path.insert(0, str(base_path / "backend"))

from app.services.gis_mapping import GIS

class DummyStore:
    def __init__(self, layers):
        self.layers = layers

    def to_metric_point(self, point, input_crs=None):
        if isinstance(point, Point):
            return point
        return Point(point)

    def get(self, name):
        return self.layers.get(name, gpd.GeoDataFrame({"geometry": []}, geometry="geometry", crs="EPSG:3414"))

layers = {
    "cycling_path": gpd.GeoDataFrame({"geometry": []}, geometry="geometry", crs="EPSG:3414"),
    "footpath": gpd.GeoDataFrame(
        {"WIDTH": [2.0]},
        geometry=[LineString([(-5.0, 0.0), (-2.0, 0.0), (-1.848, 0.765), (-1.414, 1.414)])],
        crs="EPSG:3414",
    ),
    "shared_path": gpd.GeoDataFrame(
        {"WIDTH": [3.0]},
        geometry=[LineString([(-1.414, 1.414), (-0.765, 1.848), (0.0, 2.0), (0.0, 5.0)])],
        crs="EPSG:3414",
    ),
}

gis = GIS(DummyStore(layers))
pt = Point(-2.0, 0.0)

radius, width, details = gis.get_radius_and_width_at_point(pt, return_details=True)

print(f"get_radius_and_width_at_point: radius={radius}, width={width}, details={details}")

analysis_lines = details.get("analysis_lines")
analysis_layers = details.get("analysis_layers")

print(f"number of analysis_lines: {len(analysis_lines) if analysis_lines is not None else 'None'}")
print(f"analysis_layers: {analysis_layers}")

if analysis_lines is not None:
    min_radius_result = gis._calculate_min_radius_from_lines(analysis_lines, pt, collect_radius=5.0, return_details=True)
    print(f"_calculate_min_radius_from_lines result: {min_radius_result}")
