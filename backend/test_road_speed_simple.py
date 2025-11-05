#!/usr/bin/env python3
"""
Simple test script for Road Operating Speed (mean) attribute autocoding
This version directly imports only the necessary gis_mapping module without Flask dependencies
"""
import sys
from pathlib import Path
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point
import numpy as np

# Constants
CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:3414"

def test_road_operating_speed():
    """Test the road operating speed calculation directly"""
    print("=" * 80)
    print("Testing Road Operating Speed (mean) Autocoding")
    print("=" * 80)

    backend_path = Path(__file__).parent
    shp_dir = backend_path / "shapefiles" / "LinkID_Shape_File"

    # 1. Load the road shapefile
    print(f"\n1. Loading road shapefile from: {shp_dir}")
    road_shp_path = shp_dir / "31Oct24_Link_FUL.shp"

    if not road_shp_path.exists():
        print(f"   ✗ Shapefile not found: {road_shp_path}")
        return

    try:
        road_gdf = gpd.read_file(road_shp_path)
        print(f"   ✓ Loaded shapefile: {len(road_gdf)} road links")
        print(f"   ✓ CRS: {road_gdf.crs}")
        print(f"   ✓ Columns: {list(road_gdf.columns)}")

        # Convert to metric CRS if needed
        if road_gdf.crs.to_epsg() != 3414:
            print(f"   → Converting CRS to EPSG:3414...")
            road_gdf = road_gdf.to_crs("EPSG:3414")
            print(f"   ✓ CRS converted")

    except Exception as e:
        print(f"   ✗ Error loading shapefile: {e}")
        import traceback
        traceback.print_exc()
        return

    # 2. Load the speed CSV
    print(f"\n2. Loading speed CSV")
    speed_csv_path = shp_dir / "TSE_AdHocReq_ERP2AverageSpeedData_250425.csv"

    if not speed_csv_path.exists():
        print(f"   ✗ CSV not found: {speed_csv_path}")
        return

    try:
        speed_df = pd.read_csv(speed_csv_path)
        print(f"   ✓ Loaded CSV: {len(speed_df)} records")
        print(f"   ✓ Columns: {list(speed_df.columns)}")

        # Convert LINKID to string
        if 'LINKID' in speed_df.columns:
            speed_df['LINKID'] = speed_df['LINKID'].astype(str)
            speed_df = speed_df.set_index('LINKID')
            print(f"   ✓ Indexed by LINKID")
            print(f"   ✓ Sample Link IDs: {list(speed_df.index[:5])}")
            print(f"   ✓ Sample speeds: {list(speed_df['AVERAGE_HOURLY_SPEED'].head())}")
        else:
            print(f"   ✗ LINKID column not found")
            return

    except Exception as e:
        print(f"   ✗ Error loading CSV: {e}")
        import traceback
        traceback.print_exc()
        return

    # 3. Test with sample points
    print("\n3. Testing with sample coordinates")
    test_points = [
        (103.8198, 1.3521, "Orchard Road area"),
        (103.8500, 1.2900, "Marina Bay area"),
        (103.7800, 1.3800, "Bukit Timah area"),
    ]

    for lon, lat, description in test_points:
        print(f"\n   Testing: {description}")
        print(f"   Coordinates (WGS84): ({lon}, {lat})")

        # Convert point to metric CRS
        pt_wgs84 = Point(lon, lat)
        pt_gdf = gpd.GeoDataFrame(geometry=[pt_wgs84], crs=CRS_WGS84)
        pt_metric_gdf = pt_gdf.to_crs(CRS_METRIC)
        pt = pt_metric_gdf.geometry.iloc[0]

        print(f"   Coordinates (EPSG:3414): ({pt.x:.2f}, {pt.y:.2f})")

        try:
            # Create buffer for spatial query
            buffer_dist = 20
            max_dist = 30
            default_speed = 30.0

            buffer_geom = pt.buffer(buffer_dist)

            # Use spatial index to find candidates
            candidate_indices = list(road_gdf.sindex.intersection(buffer_geom.bounds))
            print(f"   → Found {len(candidate_indices)} candidate road links in {buffer_dist}m buffer")

            if not candidate_indices:
                print(f"   → No candidates found, using default: {default_speed} km/h")
                continue

            # Get candidates and calculate distances
            candidates = road_gdf.iloc[candidate_indices].copy()
            candidates['distance'] = candidates.geometry.distance(pt)

            # Filter to max distance
            nearby_roads = candidates[candidates['distance'] <= max_dist]
            print(f"   → {len(nearby_roads)} road links within {max_dist}m")

            if nearby_roads.empty:
                print(f"   → No roads within {max_dist}m, using default: {default_speed} km/h")
                continue

            # Find nearest
            nearest_idx = nearby_roads['distance'].idxmin()
            nearest_road = nearby_roads.loc[nearest_idx]
            distance = nearest_road['distance']

            print(f"   → Nearest road link at {distance:.2f}m")

            # Get Link ID
            if 'LK_ID_NUM' not in nearest_road.index:
                print(f"   ✗ LK_ID_NUM field not found in shapefile")
                print(f"   Available fields: {list(nearest_road.index)}")
                continue

            link_id = str(nearest_road['LK_ID_NUM'])
            print(f"   → Link ID: {link_id}")

            # Look up speed
            if link_id in speed_df.index:
                speed_row = speed_df.loc[link_id]
                if 'AVERAGE_HOURLY_SPEED' in speed_row.index:
                    speed = float(speed_row['AVERAGE_HOURLY_SPEED'])
                    print(f"   ✓ Road Operating Speed: {speed} km/h")
                else:
                    print(f"   ✗ AVERAGE_HOURLY_SPEED column not found")
                    print(f"   Available columns: {list(speed_row.index)}")
                    print(f"   → Using default: {default_speed} km/h")
            else:
                print(f"   ⚠ Link ID {link_id} not found in CSV")
                print(f"   → Using default: {default_speed} km/h")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 80)
    print("Test completed!")
    print("=" * 80)

if __name__ == "__main__":
    test_road_operating_speed()
