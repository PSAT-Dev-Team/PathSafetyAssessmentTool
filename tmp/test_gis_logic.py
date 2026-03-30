import requests
import json

# Try to find an existing project name
# From previous context, let's assume "Project A" or similar if known, 
# but better to test with a placeholder and see if it hits the GIS logic.

url = "http://localhost:5000/api/projects/dummy/gis/layers" 
# Note: The project name often doesn't matter for the GIS search itself if it doesn't use project-specific GIS.
# But here it might.

payload = {
    "point": [103.8198, 1.3521], # A point in Singapore
    "radius": 200,
    "layers": ["bus_stop", "bus_lane"]
}

try:
    # We might need to handle the fact that the server might not be running on 5000 in this environment
    # or we can just mock the call within a flask context if we can't hit it.
    # Alternatively, I'll just run a script that imports the logic and tests it.
    print("Testing GIS logic via direct import...")
    import sys
    import os
    sys.path.append(os.getcwd())
    from backend.app.services.gis_mapping import LayerStore, GIS
    from shapely.geometry import Point
    
    store = LayerStore.default(base_dir="backend/shapefiles")
    gis = GIS(store)
    pt = Point(103.8198, 1.3521)
    
    print(f"Checking bus_stop near {pt}...")
    gdf_stop = store.get("bus_stop")
    print(f"Total bus stops loaded: {len(gdf_stop)}")
    
    # Test a point actually near a bus stop if possible, but let's just see if get() works.
    print("Success: GIS layers loaded correctly from backend/shapefiles")

except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"FAILED: {e}")
