import sys
import os
import geopandas as gpd

sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.api.projects import routes

gpkg_path = r'data\TPYLor41Q2025\geo_data.gpkg'
gdf = gpd.read_file(gpkg_path)
gis = routes._get_gis()

for idx in [68, 69]:
    row = gdf.iloc[idx]
    coords = list(row.geometry.coords)
    probe_val = routes._select_segment_curvature_probe(coords, gis, sharp_turn_threshold=10.0, default_value=2)
    curv_start = gis.get_curvature(coords[0])
    curv_mid = gis.get_curvature(coords[len(coords)//2])
    curv_end = gis.get_curvature(coords[-1])
    
    # Concise print with marker
    print(f"OUTPUT_MARKER | Index {idx} | Ref {row.get('image_reference', 'N/A')} | Len {row.geometry.length:.2f} | Probe {probe_val[1]} | Curvatures {curv_start[1]}/{curv_mid[1]}/{curv_end[1]}")
