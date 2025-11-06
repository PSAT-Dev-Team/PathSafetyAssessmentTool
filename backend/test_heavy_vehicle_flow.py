#!/usr/bin/env python3
"""
Test script for Heavy Vehicle Flow attribute autocoding
Tests the get_heavy_vehicle_flow() method to ensure it works correctly
"""
import sys
from pathlib import Path
import geopandas as gpd
from shapely.geometry import Point

# Add backend to path to import modules
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

# Import only gis_mapping module directly to avoid loading the entire app
# This avoids Python version compatibility issues in other modules
import importlib.util
spec = importlib.util.spec_from_file_location(
    "gis_mapping",
    backend_path / "app" / "services" / "gis_mapping.py"
)
gis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gis)

# Constants
CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:3414"

def test_heavy_vehicle_flow():
    """Test the heavy vehicle flow calculation"""
    print("=" * 80)
    print("Testing Heavy Vehicle Flow Autocoding")
    print("=" * 80)

    shp_dir = backend_path / "shapefiles"

    # 1. Initialize GIS system
    print(f"\n1. Initializing GIS system with shapefiles from: {shp_dir}")
    try:
        layer_store = gis.LayerStore.default(base_dir=str(shp_dir))
        _gis = gis.GIS(layer_store)
        print("   ✓ GIS system initialized successfully")
    except Exception as e:
        print(f"   ✗ Error initializing GIS system: {e}")
        import traceback
        traceback.print_exc()
        return

    # 2. Verify bus lane shapefile is loaded
    print(f"\n2. Verifying bus lane shapefile")
    try:
        bus_lane_gdf = layer_store.get("bus_lane")
        print(f"   ✓ Bus lane shapefile loaded: {len(bus_lane_gdf)} bus lane segments")
        print(f"   ✓ CRS: {bus_lane_gdf.crs}")
        print(f"   ✓ Columns: {list(bus_lane_gdf.columns)}")
        print(f"   ✓ Geometry types: {bus_lane_gdf.geometry.type.value_counts().to_dict()}")
        print(f"   ✓ Bounds: {bus_lane_gdf.total_bounds}")

    except Exception as e:
        print(f"   ✗ Error loading bus lane shapefile: {e}")
        import traceback
        traceback.print_exc()
        return

    # 3. Test with sample points
    print("\n3. Testing with sample coordinates")
    test_points = [
        (103.8198, 1.3521, "Orchard Road area (likely near bus lane)"),
        (103.8500, 1.2900, "Marina Bay area"),
        (103.7800, 1.3800, "Bukit Timah area"),
        (103.8494, 1.2896, "Shenton Way area (likely near bus lane)"),
        (103.9500, 1.3500, "Changi area"),
        (103.8545, 1.2951, "Downtown Core area"),
    ]

    for lon, lat, description in test_points:
        print(f"\n   Testing: {description}")
        print(f"   Coordinates (WGS84): ({lon}, {lat})")

        # Create point
        pt = Point(lon, lat)

        try:
            # Call the get_heavy_vehicle_flow method
            buffer_dist = 15
            max_dist = 15
            default_value = 1

            heavy_vehicle_flow = _gis.get_heavy_vehicle_flow(
                pt,
                buffer_dist=buffer_dist,
                max_dist=max_dist,
                default_value=default_value
            )

            if heavy_vehicle_flow == 1:
                print(f"   → Heavy Vehicle Flow: 1 (Low)")
                print(f"      No bus lane found within {max_dist}m")
            elif heavy_vehicle_flow == 2:
                print(f"   ✓ Heavy Vehicle Flow: 2 (Moderate to high)")
                print(f"      Bus lane found within {max_dist}m")
            else:
                print(f"   ? Unexpected value: {heavy_vehicle_flow}")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            import traceback
            traceback.print_exc()

    # 4. Test detailed spatial query for one point
    print("\n4. Detailed spatial analysis for Orchard Road area")
    test_lon, test_lat = 103.8198, 1.3521
    pt = Point(test_lon, test_lat)

    try:
        # Convert to metric CRS
        pt_metric = layer_store.to_metric_point(pt)
        print(f"   Point in EPSG:3414: ({pt_metric.x:.2f}, {pt_metric.y:.2f})")

        # Create buffer and query
        buffer_dist = 15
        max_dist = 15
        buffer_geom = pt_metric.buffer(buffer_dist)

        # Get candidates
        candidate_indices = list(bus_lane_gdf.sindex.intersection(buffer_geom.bounds))
        print(f"   → Found {len(candidate_indices)} candidate bus lanes in {buffer_dist}m buffer")

        if candidate_indices:
            candidates = bus_lane_gdf.iloc[candidate_indices].copy()
            candidates['dist_to_pt'] = candidates.geometry.distance(pt_metric)

            # Filter to max distance
            nearby = candidates[candidates['dist_to_pt'] <= max_dist]
            print(f"   → {len(nearby)} bus lanes within {max_dist}m")

            if not nearby.empty:
                # Show top 3 nearest
                nearest_3 = nearby.nsmallest(min(3, len(nearby)), 'dist_to_pt')
                print(f"\n   Top {len(nearest_3)} nearest bus lanes:")
                for idx, row in nearest_3.iterrows():
                    dist = row['dist_to_pt']
                    print(f"     - Distance: {dist:.2f}m")

                min_dist = nearby['dist_to_pt'].min()
                print(f"\n   Minimum distance to any bus lane: {min_dist:.2f}m")
                if min_dist <= max_dist:
                    print(f"   → Result: Heavy Vehicle Flow = 2 (Moderate to high)")
                else:
                    print(f"   → Result: Heavy Vehicle Flow = 1 (Low)")
        else:
            print(f"   → No bus lanes found within {buffer_dist}m buffer")
            print(f"   → Result: Heavy Vehicle Flow = 1 (Low)")

    except Exception as e:
        print(f"   ✗ Error in detailed analysis: {e}")
        import traceback
        traceback.print_exc()

    # 5. Test edge cases
    print("\n5. Testing edge cases")

    # Test with exact 15m threshold
    print("\n   Testing threshold behavior (15m exactly):")
    print("   Creating synthetic test with known distance...")

    try:
        # Get a bus lane for reference
        if not bus_lane_gdf.empty:
            # Get first bus lane geometry
            sample_bus_lane = bus_lane_gdf.iloc[0].geometry

            # Get a point on the bus lane
            if hasattr(sample_bus_lane, 'coords'):
                # LineString
                ref_point = Point(sample_bus_lane.coords[0])
            elif hasattr(sample_bus_lane, 'representative_point'):
                ref_point = sample_bus_lane.representative_point()
            else:
                ref_point = sample_bus_lane.centroid

            print(f"   Reference point from bus lane: ({ref_point.x:.2f}, {ref_point.y:.2f})")

            # Test at exactly the bus lane (distance = 0)
            result_0m = _gis.get_heavy_vehicle_flow(ref_point, buffer_dist=15, max_dist=15, default_value=1)
            print(f"   At 0m from bus lane: {result_0m} (expected: 2)")

    except Exception as e:
        print(f"   Could not test threshold: {e}")

    print("\n" + "=" * 80)
    print("Test completed!")
    print("=" * 80)

if __name__ == "__main__":
    test_heavy_vehicle_flow()
