import sys
import os
from pathlib import Path

# Add project root to path
root = Path(os.getcwd())
sys.path.append(str(root))
sys.path.append(str(root / "backend"))

# Mock Flask components
from unittest.mock import MagicMock
sys.modules["flask"] = MagicMock()
sys.modules["flask_cors"] = MagicMock()
sys.modules["werkzeug"] = MagicMock()
sys.modules["werkzeug.utils"] = MagicMock()
sys.modules["werkzeug.exceptions"] = MagicMock()

# Import GIS logic
from app.services import gis_mapping as gis
from shapely.geometry import Point
import math

def test_full_logic():
    # Setup path manually as in routes.py _get_gis
    # backend/app/api/projects/routes.py -> parents[3] is backend
    shp_dir = root / "backend" / "shapefiles"
    print(f"Using shp_dir: {shp_dir}")
    
    store = gis.LayerStore.default(base_dir=str(shp_dir))
    _gis = gis.GIS(store)
    
    # Coordinates for a test point (Singapore)
    # Let's try 1.3323, 103.8492 (near some bus lanes and stops)
    lon, lat = 103.8492, 1.3323
    pt = Point(lon, lat)
    radius = 200
    
    pt_metric = store.to_metric_point(pt)
    buffer_geom = pt_metric.buffer(radius)
    
    layer_names = {
        "bus_stop": ["bus_stop", "bus_shelter"],
        "bus_lane": "bus_lane"
    }
    
    for layer_key, sub_layers in layer_names.items():
        if isinstance(sub_layers, str): sub_layers = [sub_layers]
        
        all_features = []
        for layer_name in sub_layers:
            print(f"\nProcessing layer: {layer_name}")
            gdf = store.get(layer_name)
            if gdf is None or gdf.empty:
                print(f"Layer {layer_name} is empty or not found.")
                continue
            
            # CRS logic
            if gdf.crs is None or gdf.crs.to_epsg() != 3414:
                gdf = gdf.to_crs("EPSG:3414")
                
            # Search
            candidate_indices = list(gdf.sindex.intersection(buffer_geom.bounds))
            candidates = gdf.iloc[candidate_indices]
            intersecting = candidates[candidates.intersects(buffer_geom)]
            
            print(f"Found {len(intersecting)} intersecting features in {layer_name}")
            
            # Simple check for attributes
            if len(intersecting) > 0:
                print("First feature properties:", intersecting.iloc[0].drop("geometry").to_dict())

if __name__ == "__main__":
    test_full_logic()
