import sys
import os
import geopandas as gpd
from shapely.geometry import Point
from pathlib import Path

# Setup paths
repo_root = r"c:\Users\Alaster\Documents\GitHub\PathSafetyAssessmentTool"
backend_path = os.path.join(repo_root, "backend")
sys.path.insert(0, backend_path)

from app.services.gis_mapping import GIS, LayerStore

def main():
    # Initialize GIS service with shapefiles
    shapefiles_dir = Path(backend_path) / "shapefiles"
    store = LayerStore()
    for shp in shapefiles_dir.glob("*.shp"):
        store.add_path(shp.stem, shp)
    gis = GIS(store)

    # Load gpkg data
    gpkg_path = os.path.join(repo_root, "data", "TPYLor41Q2025", "geo_data.gpkg")
    gdf = gpd.read_file(gpkg_path)
    
    # Process rows 68 and 69
    for idx in [68, 69]:
        if idx >= len(gdf):
            print(f"Row {idx} out of range")
            continue
            
        line = gdf.iloc[idx].geometry
        points = {
            "start": Point(line.coords[0]),
            "mid": Point(line.interpolate(0.5, normalized=True)),
            "end": Point(line.coords[-1])
        }
        
        print(f"Row {idx}:")
        for label, pt in points.items():
            # Using get_curvature as requested
            res = gis.get_curvature(pt)
            print(f"  {label}: {res}")

if __name__ == "__main__":
    main()
