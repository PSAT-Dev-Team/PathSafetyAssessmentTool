import sys
import os
from pathlib import Path

# Add project root to path
root = Path(os.getcwd())
sys.path.append(str(root))
sys.path.append(str(root / "backend"))

print("Mocking Flask to test logic...")
from unittest.mock import MagicMock
sys.modules["flask"] = MagicMock()
sys.modules["flask_cors"] = MagicMock()

try:
    from app.services.gis_mapping import LayerStore, GIS
    from shapely.geometry import Point
    
    # Test with the new base_dir I just set in code
    store = LayerStore.default(base_dir="backend/shapefiles")
    
    print("Testing 'bus_stop' layer...")
    gdf_stop = store.get("bus_stop")
    print(f"SUCCESS: Loaded {len(gdf_stop)} bus stops.")
    
    print("Testing 'bus_lane' layer...")
    gdf_lane = store.get("bus_lane")
    print(f"SUCCESS: Loaded {len(gdf_lane)} bus lanes.")
    
    # Check for MultiLineString in bus_lane
    if "MultiLineString" in gdf_lane.geom_type.unique():
        print("Confirmed: bus_lane contains MultiLineString.")
        
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"FAILED: {e}")
