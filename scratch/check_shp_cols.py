
import geopandas as gpd
import os

backend_dir = r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\backend"
shp_path = os.path.join(backend_dir, "shapefiles", "area_type", "CentralMB2025.shp")

if os.path.exists(shp_path):
    gdf = gpd.read_file(shp_path)
    print("Columns in CentralMB2025.shp:")
    for i, col in enumerate(gdf.columns):
        print(f"  {i}: {col}")
else:
    print(f"Path not found: {shp_path}")
