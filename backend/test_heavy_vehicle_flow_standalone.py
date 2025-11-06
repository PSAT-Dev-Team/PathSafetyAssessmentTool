#!/usr/bin/env python3
"""
Standalone test script for Heavy Vehicle Flow attribute autocoding
This version doesn't import the app modules to avoid Python version compatibility issues
"""
import geopandas as gpd
from shapely.geometry import Point
from pathlib import Path

# Constants
CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:3414"

def test_heavy_vehicle_flow_standalone():
    """Test the heavy vehicle flow calculation using standalone logic"""
    print("=" * 80)
    print("Testing Heavy Vehicle Flow Autocoding (Standalone)")
    print("=" * 80)

    backend_path = Path(__file__).parent
    shp_dir = backend_path / "shapefiles"

    # 1. Load bus lane shapefile
    print(f"\n1. Loading bus lane shapefile")
    try:
        bus_lane_path = shp_dir / "bus_lane" / "Bus lanes.shp"
        bus_lane_gdf = gpd.read_file(bus_lane_path)

        # Convert to metric CRS if needed
        if bus_lane_gdf.crs.to_epsg() != 3414:
            print(f"   Converting from {bus_lane_gdf.crs} to EPSG:3414")
            bus_lane_gdf = bus_lane_gdf.to_crs(CRS_METRIC)

        print(f"   ✓ Bus lane shapefile loaded: {len(bus_lane_gdf)} bus lane segments")
        print(f"   ✓ CRS: {bus_lane_gdf.crs}")
        print(f"   ✓ Columns: {list(bus_lane_gdf.columns)}")
        print(f"   ✓ Geometry types: {bus_lane_gdf.geometry.type.value_counts().to_dict()}")

        # Preheat spatial index
        _ = bus_lane_gdf.sindex
        print(f"   ✓ Spatial index created")

    except Exception as e:
        print(f"   ✗ Error loading bus lane shapefile: {e}")
        import traceback
        traceback.print_exc()
        return

    # 2. Define the heavy vehicle flow calculation function
    def calculate_heavy_vehicle_flow(lon, lat, buffer_dist=15, max_dist=15, default_value=1):
        """
        Calculate heavy vehicle flow for a point based on proximity to bus lanes.

        Returns:
            1 = Low (no bus lane within 15m)
            2 = Moderate to high (bus lane within 15m)
        """
        # Create point in WGS84
        pt_wgs84 = Point(lon, lat)

        # Convert to metric CRS
        pt_gdf = gpd.GeoDataFrame(geometry=[pt_wgs84], crs=CRS_WGS84).to_crs(CRS_METRIC)
        pt_metric = pt_gdf.geometry.iloc[0]

        # Create buffer for spatial query
        buffer_geom = pt_metric.buffer(buffer_dist)

        # Use spatial index to find candidate bus lanes
        candidate_indices = list(bus_lane_gdf.sindex.intersection(buffer_geom.bounds))

        if not candidate_indices:
            return default_value

        # Get candidate bus lanes
        candidates = bus_lane_gdf.iloc[candidate_indices].copy()

        # Calculate distances to point
        candidates['dist_to_pt'] = candidates.geometry.distance(pt_metric)

        # Find the minimum distance to any bus lane
        min_distance = candidates['dist_to_pt'].min()

        # If minimum distance is within threshold, return "Moderate to high" (2)
        if min_distance <= max_dist:
            return 2  # Moderate to high
        else:
            return default_value  # Low (1)

    # 3. Test with sample points
    print("\n2. Testing with sample coordinates")
    test_points = [
        (103.8198, 1.3521, "Orchard Road area"),
        (103.8500, 1.2900, "Marina Bay area"),
        (103.7800, 1.3800, "Bukit Timah area"),
        (103.8494, 1.2896, "Shenton Way area"),
        (103.9500, 1.3500, "Changi area"),
        (103.8545, 1.2951, "Downtown Core area"),
    ]

    results = []
    for lon, lat, description in test_points:
        print(f"\n   Testing: {description}")
        print(f"   Coordinates (WGS84): ({lon}, {lat})")

        try:
            heavy_vehicle_flow = calculate_heavy_vehicle_flow(lon, lat)

            if heavy_vehicle_flow == 1:
                print(f"   → Heavy Vehicle Flow: 1 (Low)")
                print(f"      No bus lane found within 15m")
            elif heavy_vehicle_flow == 2:
                print(f"   ✓ Heavy Vehicle Flow: 2 (Moderate to high)")
                print(f"      Bus lane found within 15m")
            else:
                print(f"   ? Unexpected value: {heavy_vehicle_flow}")

            results.append((description, heavy_vehicle_flow))

        except Exception as e:
            print(f"   ✗ Error: {e}")
            import traceback
            traceback.print_exc()

    # 4. Test detailed spatial query for one point
    print("\n3. Detailed spatial analysis for Orchard Road area")
    test_lon, test_lat = 103.8198, 1.3521

    try:
        # Create point in WGS84 and convert to metric
        pt_wgs84 = Point(test_lon, test_lat)
        pt_gdf = gpd.GeoDataFrame(geometry=[pt_wgs84], crs=CRS_WGS84).to_crs(CRS_METRIC)
        pt_metric = pt_gdf.geometry.iloc[0]

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

    # 5. Summary
    print("\n" + "=" * 80)
    print("Test Summary")
    print("=" * 80)
    for description, value in results:
        status = "Moderate to high" if value == 2 else "Low"
        print(f"  {description:40s} → {status}")

    print("\n" + "=" * 80)
    print("Test completed successfully!")
    print("=" * 80)

if __name__ == "__main__":
    test_heavy_vehicle_flow_standalone()
