#!/usr/bin/env python3
"""
Quick script to examine the ROADATTRIBUTELINE_SPEEDLIMITS.shp structure
"""
import sys
from pathlib import Path
import geopandas as gpd

def check_speed_limit_shapefile():
    """Examine the speed limit shapefile"""
    print("=" * 80)
    print("Examining Speed Limit Shapefile")
    print("=" * 80)

    backend_path = Path(__file__).parent
    shp_path = backend_path / "shapefiles" / "Speed_limit" / "ROADATTRIBUTELINE_SPEEDLIMITS.shp"

    if not shp_path.exists():
        print(f"✗ Shapefile not found: {shp_path}")
        return

    try:
        gdf = gpd.read_file(shp_path)
        print(f"\n✓ Successfully loaded shapefile")
        print(f"  Shape: {gdf.shape} (rows × columns)")
        print(f"  CRS: {gdf.crs}")
        print(f"  Geometry type: {gdf.geometry.type.unique()}")

        print(f"\n  Column names:")
        for col in gdf.columns:
            print(f"    - {col}")

        print(f"\n  First 3 rows:")
        print(gdf.head(3))

        if 'SPEEDLIMIT' in gdf.columns:
            print(f"\n  SPEEDLIMIT statistics:")
            print(f"    Null values: {gdf['SPEEDLIMIT'].isna().sum()}")
            print(f"    Unique values: {gdf['SPEEDLIMIT'].nunique()}")
            print(f"\n  SPEEDLIMIT value distribution:")
            print(gdf['SPEEDLIMIT'].value_counts().sort_index())
        else:
            print(f"\n  ⚠ SPEEDLIMIT column not found!")
            print(f"    Available columns: {list(gdf.columns)}")

        print(f"\n  Bounds: {gdf.total_bounds}")

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 80)

if __name__ == "__main__":
    check_speed_limit_shapefile()
