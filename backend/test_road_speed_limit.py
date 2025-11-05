#!/usr/bin/env python3
"""
Test script for Road Speed Limit attribute autocoding
Tests the get_road_speed_limit() method to ensure it works correctly
"""
import sys
from pathlib import Path
import geopandas as gpd
from shapely.geometry import Point

# Add backend to path to import modules
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

from app.services import gis_mapping as gis

# Constants
CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:3414"

def test_road_speed_limit():
    """Test the road speed limit calculation"""
    print("=" * 80)
    print("Testing Road Speed Limit Autocoding")
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

    # 2. Verify speed limit shapefile is loaded
    print(f"\n2. Verifying speed limit shapefile")
    try:
        speed_limit_gdf = layer_store.get("speed_limit")
        print(f"   ✓ Speed limit shapefile loaded: {len(speed_limit_gdf)} road segments")
        print(f"   ✓ CRS: {speed_limit_gdf.crs}")
        print(f"   ✓ Columns: {list(speed_limit_gdf.columns)}")

        # Check SPEEDLIMIT column
        if 'SPEEDLIMIT' in speed_limit_gdf.columns:
            print(f"   ✓ SPEEDLIMIT column found")
            print(f"   ✓ Unique speed limits: {sorted(speed_limit_gdf['SPEEDLIMIT'].dropna().unique())}")
            print(f"   ✓ Null values: {speed_limit_gdf['SPEEDLIMIT'].isna().sum()}")
        else:
            print(f"   ✗ SPEEDLIMIT column not found!")
            return

    except Exception as e:
        print(f"   ✗ Error loading speed limit shapefile: {e}")
        import traceback
        traceback.print_exc()
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
            # Call the get_road_speed_limit method
            buffer_dist = 20
            max_dist = 30
            default_limit = 10

            speed_limit = _gis.get_road_speed_limit(
                pt,
                buffer_dist=buffer_dist,
                max_dist=max_dist,
                default_limit=default_limit
            )

            if speed_limit == default_limit:
                print(f"   → No speed limit segment found within {max_dist}m")
                print(f"   → Using default: {default_limit} km/h")
            else:
                print(f"   ✓ Road Speed Limit: {speed_limit} km/h")

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
        buffer_dist = 20
        max_dist = 30
        buffer_geom = pt_metric.buffer(buffer_dist)

        # Get candidates
        candidate_indices = list(speed_limit_gdf.sindex.intersection(buffer_geom.bounds))
        print(f"   → Found {len(candidate_indices)} candidate segments in {buffer_dist}m buffer")

        if candidate_indices:
            candidates = speed_limit_gdf.iloc[candidate_indices].copy()
            candidates['dist_to_pt'] = candidates.geometry.distance(pt_metric)

            # Filter to max distance
            nearby = candidates[candidates['dist_to_pt'] <= max_dist]
            print(f"   → {len(nearby)} segments within {max_dist}m")

            if not nearby.empty:
                # Show top 3 nearest
                nearest_3 = nearby.nsmallest(3, 'dist_to_pt')
                print(f"\n   Top 3 nearest segments:")
                for idx, row in nearest_3.iterrows():
                    dist = row['dist_to_pt']
                    limit = row['SPEEDLIMIT']
                    print(f"     - Distance: {dist:.2f}m, Speed Limit: {limit} km/h")

    except Exception as e:
        print(f"   ✗ Error in detailed analysis: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 80)
    print("Test completed!")
    print("=" * 80)

if __name__ == "__main__":
    test_road_speed_limit()
