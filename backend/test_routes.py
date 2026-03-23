import os
import sys

sys.path.append(r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\backend")

from app.api.shapefiles.routes import _read_shapefile_as_geojson

shp_path = r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\backend\shapefiles\path\path.shp"
try:
    print(f"Reading: {shp_path}")
    res = _read_shapefile_as_geojson(shp_path, max_features=10)
    print("Success. Read", len(res["features"]), "features.")
except Exception as e:
    import traceback
    traceback.print_exc()
