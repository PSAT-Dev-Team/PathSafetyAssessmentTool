
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

check("Sharedpath", "path/Sharedpathcentreline.shp")
check("Cyclingpath", "path/CyclingpathCentreline.shp")
check("Footpath", "path/Footpathcentreline.shp")
check("ROADCROSSING", "roadcrossinglayer/ROADCROSSING.shp")
