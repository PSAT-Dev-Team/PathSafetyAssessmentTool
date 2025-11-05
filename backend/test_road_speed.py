#!/usr/bin/env python3
"""
Test script for Road Operating Speed (mean) attribute autocoding
"""
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from app.services import gis_mapping as gis
from shapely.geometry import Point

def test_road_operating_speed():
    """Test the road operating speed calculation"""
    print("=" * 80)
    print("Testing Road Operating Speed (mean) Autocoding")
    print("=" * 80)

    # Initialize layer store with shapefiles
    shp_dir = backend_path / "shapefiles"
    print(f"\n1. Loading shapefiles from: {shp_dir}")

    try:
        layer_store = gis.LayerStore.default(base_dir=str(shp_dir))
        print("   ✓ LayerStore initialized successfully")

        # Check if speed data was loaded
        if layer_store.speed_data is not None:
            print(f"   ✓ Speed CSV loaded: {len(layer_store.speed_data)} records")
            print(f"   ✓ Sample Link IDs: {list(layer_store.speed_data.index[:5])}")
        else:
            print("   ✗ Speed CSV not loaded")
            return

    except Exception as e:
        print(f"   ✗ Error loading LayerStore: {e}")
        return

    # Create GIS instance
    print("\n2. Creating GIS instance")
    _gis = gis.GIS(layer_store)
    print("   ✓ GIS instance created")

    # Test with a sample point in Singapore (WGS84 coordinates)
    # Using a point near Orchard Road as example
    print("\n3. Testing with sample coordinates")
    test_points = [
        (103.8198, 1.3521, "Orchard Road area"),
        (103.8500, 1.2900, "Marina Bay area"),
        (103.7800, 1.3800, "Bukit Timah area"),
    ]

    for lon, lat, description in test_points:
        print(f"\n   Testing: {description}")
        print(f"   Coordinates: ({lon}, {lat})")

        pt = Point(lon, lat)

        try:
            speed = _gis.get_road_operating_speed(
                pt,
                buffer_dist=20,
                max_dist=30,
                default_speed=30.0
            )

            print(f"   → Road Operating Speed: {speed} km/h")

            if speed == 30.0:
                print("   ⚠ Returned default value (no road link found within 30m)")
            else:
                print("   ✓ Found matching road link with speed data")

        except Exception as e:
            print(f"   ✗ Error calculating speed: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 80)
    print("Test completed!")
    print("=" * 80)

if __name__ == "__main__":
    test_road_operating_speed()
