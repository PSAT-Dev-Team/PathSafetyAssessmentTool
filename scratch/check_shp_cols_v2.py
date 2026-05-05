
import geopandas as gpd
import os

backend_dir = r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\backend"

def check(name, path):
    shp_path = os.path.join(backend_dir, "shapefiles", path)
    if os.path.exists(shp_path):
        gdf = gpd.read_file(shp_path)
        print(f"Columns in {name}:")
        for i, col in enumerate(gdf.columns):
            print(f"  {i}: {col}")
    else:
        print(f"Path not found: {shp_path}")

check("CentralMB2025", "area_type/CentralMB2025.shp")
check("LanduseIndustrial2025", "area_type/LanduseIndustrial2025.shp")
check("LanduseRural2025", "area_type/LanduseRural2025.shp")
check("MRT_EXITS", "Mrt_exit/MRT_EXITS.shp")
check("Bus lanes", "bus_lane/Bus lanes.shp")
check("BusStop", "bus_stop/BusStop.shp")
