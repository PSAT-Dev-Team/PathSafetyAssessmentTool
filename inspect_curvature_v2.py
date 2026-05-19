import sys
import os
import geopandas as gpd
from shapely.geometry import Point

# Ensure the root and backend are in sys.path
root_dir = os.getcwd()
backend_dir = os.path.join(root_dir, 'backend')
sys.path.append(root_dir)
sys.path.append(backend_dir)

from backend.app.api.projects import routes

def run():
    gdf = gpd.read_file(r'data\TPYLor41Q2025\geo_data.gpkg')
    gis = routes._get_gis()
    
    # Rows 68 and 69
    indices = [68, 69]
    if max(indices) >= len(gdf):
        print(f'Error: Indices {indices} out of bounds for len {len(gdf)}')
        return

    selected_rows = gdf.iloc[indices]
    
    for i, row in selected_rows.iterrows():
        geom = row.geometry
        print(f'--- Row Index: {i} ---')
        print(f'Image Reference: {row.get("img_ref", "N/A")}')
        print(f'Line Length: {geom.length}')
        
        # Points
        start_pt = Point(geom.coords[0])
        end_pt = Point(geom.coords[-1])
        mid_pt = geom.interpolate(0.5, normalized=True)
        
        c_start = gis.get_curvature(start_pt)
        c_mid = gis.get_curvature(mid_pt)
        c_end = gis.get_curvature(end_pt)
        
        print(f'Curvature - Start: {c_start}')
        print(f'Curvature - Mid:   {c_mid}')
        print(f'Curvature - End:   {c_end}')
        print()

if __name__ == '__main__':
    run()
