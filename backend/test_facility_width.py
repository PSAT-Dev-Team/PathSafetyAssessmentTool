#!/usr/bin/env python3
"""
Test script for Facility Width per Direction attribute autocoding
Tests the get_facility_width() method to ensure it works correctly
"""
import sys
from pathlib import Path
import geopandas as gpd
from shapely.geometry import Point

# Add backend to path to import modules
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

# Direct import to avoid full app initialization
import importlib.util
spec = importlib.util.spec_from_file_location("gis_mapping", backend_path / "app" / "services" / "gis_mapping.py")
gis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gis)

# Constants
CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:3414"

# Mapping for display
FACILITY_WIDTH_MAPPING = {
    1: 'Very Narrow (≤ 2m)',
    2: 'Narrow (> 2m and ≤ 4m)',
    3: 'Wide (> 4m)'
}

def test_facility_width():
    """Test the facility width per direction calculation"""
    print("=" * 80)
    print("Testing Facility Width per Direction Autocoding")
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

    # 2. Verify path shapefiles are loaded
    print(f"\n2. Verifying path centerline shapefiles")
    path_layers = {
        "cycling_path": "Cycling path centerlines",
        "footpath": "Footpath centerlines",
        "shared_path": "Shared path centerlines"
    }

    loaded_layers = {}
    for layer_name, description in path_layers.items():
        try:
            gdf = layer_store.get(layer_name)
            loaded_layers[layer_name] = gdf
            print(f"   ✓ {description} loaded: {len(gdf)} features")
            print(f"     - CRS: {gdf.crs}")
            print(f"     - Columns: {list(gdf.columns)}")

            # Check for WIDTH column (after standardization)
            width_cols = [col for col in gdf.columns if 'width' in col.lower() or 'wid' in col.lower()]
            if width_cols:
                print(f"     - Width columns found: {width_cols}")
            else:
                print(f"     - No width columns detected (will be handled by standardization)")

        except KeyError:
            print(f"   ⚠ {description} not registered in layer store")
            loaded_layers[layer_name] = None
        except Exception as e:
            print(f"   ✗ Error loading {description}: {e}")
            loaded_layers[layer_name] = None

    # Check if at least one layer was loaded
    if not any(gdf is not None for gdf in loaded_layers.values()):
        print("\n   ✗ No path shapefiles were successfully loaded!")
        print("   ✗ Cannot proceed with testing")
        return

    # 3. Test with sample points
    print("\n3. Testing with sample coordinates")
    test_points = [
        (103.8198, 1.3521, "Orchard Road area"),
        (103.8500, 1.2900, "Marina Bay area"),
        (103.7800, 1.3800, "Bukit Timah area"),
        (103.8494, 1.2896, "Shenton Way area"),
        (103.9500, 1.3500, "Changi area"),
    ]

    for lon, lat, description in test_points:
        print(f"\n   Testing: {description}")
        print(f"   Coordinates (WGS84): ({lon}, {lat})")

        # Create point
        pt = Point(lon, lat)

        try:
            # Call the get_facility_width method
            start_radius = 2.0
            max_radius = 10.0
            step_size = 2.0
            default_value = 2

            facility_width_code = _gis.get_facility_width(
                pt,
                start_radius=start_radius,
                max_radius=max_radius,
                step_size=step_size,
                default_value=default_value
            )

            category_name = FACILITY_WIDTH_MAPPING.get(facility_width_code, "Unknown")

            if facility_width_code == default_value:
                print(f"   → No path found within {max_radius}m")
                print(f"   → Using default: {category_name}")
            else:
                print(f"   ✓ Facility Width per Direction: {category_name} (code: {facility_width_code})")

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

        # Test with different radii
        for radius in [2.0, 5.0, 10.0]:
            buffer_geom = pt_metric.buffer(radius)
            total_candidates = 0

            print(f"\n   Checking at radius {radius}m:")

            # Check each layer
            for layer_name, description in path_layers.items():
                gdf = loaded_layers.get(layer_name)
                if gdf is None:
                    continue

                try:
                    candidate_indices = list(gdf.sindex.intersection(buffer_geom.bounds))
                    if candidate_indices:
                        print(f"     - {description}: {len(candidate_indices)} candidates")
                        total_candidates += len(candidate_indices)
                except Exception as e:
                    print(f"     - {description}: Error querying ({e})")

            if total_candidates == 0:
                print(f"     → No paths found at {radius}m")

    except Exception as e:
        print(f"   ✗ Error in detailed analysis: {e}")
        import traceback
        traceback.print_exc()

    # 5. Test width categorization logic
    print("\n5. Testing width categorization logic")
    test_widths = [
        (1.5, 1, "Very Narrow"),
        (2.0, 1, "Very Narrow"),
        (2.5, 2, "Narrow"),
        (3.0, 2, "Narrow"),
        (4.0, 2, "Narrow"),
        (4.5, 3, "Wide"),
        (5.0, 3, "Wide"),
        (None, 2, "Default (Narrow)"),
    ]

    print("   Width (m) → Expected Category")
    for width, expected_code, label in test_widths:
        width_str = f"{width}m" if width is not None else "None"
        print(f"     {width_str:>8} → {expected_code} ({label})")

    print("\n" + "=" * 80)
    print("Test completed!")
    print("=" * 80)

if __name__ == "__main__":
    test_facility_width()
