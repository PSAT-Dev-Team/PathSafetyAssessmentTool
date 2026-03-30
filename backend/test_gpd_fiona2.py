import sys
sys.path.append(r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\backend")
import fiona
import geopandas as gpd

shp_path = r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\backend\shapefiles\path\CyclingpathCentreline.shp"
try:
    with fiona.open(shp_path) as src:
        gdf = gpd.GeoDataFrame.from_features(src, crs=src.crs)
    print("from_features logic works!")
    print(gdf.head(1))
except Exception as e:
    import traceback
    traceback.print_exc()
