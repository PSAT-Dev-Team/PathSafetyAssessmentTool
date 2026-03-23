import sys
import os
import time

curr_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(curr_dir, "backend")
sys.path.insert(0, backend_dir)

from shapely.geometry import Point
from app.services.gis_mapping import LayerStore, GIS

def test_routes_logic():
    print("Testing routes.py GIS logic...")
    point_coords = [103.8198, 1.3521]
    radius = 200
    requested_layers = ["cycling", "shared", "footpath", "roadcrossing", "mrt_exit", "parking_lot", "kerb_line"]
    
    t0 = time.time()
    store = LayerStore.default(base_dir=os.path.join(backend_dir, "shapefiles"))
    gis = GIS(store)
    print(f"Store init took: {time.time() - t0:.2f}s")
    
    layer_names = {
        "cycling": "cycling_path",
        "shared": "shared_path",
        "footpath": "footpath",
        "roadcrossing": "roadcrossing",
        "mrt_exit": "mrt",
        "parking_lot": "parking",
        "kerb_line": "kerb_line"
    }

    result_layers = {}
    pt = Point(point_coords[0], point_coords[1])
    pt_metric = gis.store.to_metric_point(pt)
    buffer_geom = pt_metric.buffer(radius)

    for layer_key in requested_layers:
        t_layer = time.time()
        print(f"\n--- Processing {layer_key} ---")
        layer_name = layer_names.get(layer_key)
        if not layer_name:
            continue
            
        try:
            print("Fetching from store...")
            gdf = gis.store.get(layer_name)
            if gdf is None or gdf.empty:
                print("Empty/None layer.")
                continue
                
            print(f"Loaded {len(gdf)} features. Checking CRS...")
            if gdf.crs.to_epsg() != 3414:
                gdf = gdf.to_crs("EPSG:3414")
            
            print("Checking Z coords...")
            if len(gdf) > 0 and gdf.geometry.iloc[0].has_z:
                gdf.geometry = gdf.geometry.apply(
                    lambda geom: gis._remove_z_coordinate(geom) if geom is not None else None
                )
            
            print("Checking validity...")
            gdf = gdf[gdf.geometry.notna() & gdf.geometry.is_valid].copy()
            if gdf.empty:
                print("No valid geometries.")
                continue
                
            print(f"Checking intersection with bounds {buffer_geom.bounds}...")
            candidate_indices = list(gdf.sindex.intersection(buffer_geom.bounds))
            
            if not candidate_indices:
                print("No candidates.")
                continue
                
            candidates = gdf.iloc[candidate_indices]
            intersecting = candidates[candidates.intersects(buffer_geom)]
            print(f"Found {len(intersecting)} intersecting features!")
        except Exception as e:
            import traceback
            traceback.print_exc()
        finally:
            print(f"Layer {layer_key} took {time.time() - t_layer:.2f}s")
            
    print(f"\nTotal time: {time.time() - t0:.2f}s")

if __name__ == "__main__":
    test_routes_logic()
