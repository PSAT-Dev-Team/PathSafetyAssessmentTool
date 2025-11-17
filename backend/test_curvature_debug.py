#!/usr/bin/env python3
"""
Debug script for curvature calculation issues
Tests the get_curvature function with various geometries to identify the problem
"""

import sys
from pathlib import Path
import numpy as np

# Add the app directory to the path
backend_root = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_root))

from shapely.geometry import LineString
from geopandas import GeoDataFrame
from app.services.gis_mapping import GIS, LayerStore

def test_curvature_calculation():
    """Test curvature calculation with various scenarios"""

    # Initialize GIS service
    shp_dir = backend_root / "shapefiles"
    layer_store = LayerStore.default(base_dir=str(shp_dir))
    gis = GIS(layer_store)

    print("=" * 80)
    print("CURVATURE CALCULATION DEBUG TEST")
    print("=" * 80)

    # Test 1: Right-angle turn at point 3 (should detect sharp turn at that point)
    print("\n\nTest 1: Right-angle turn at point 3")
    print("-" * 80)
    coords_right_angle = [
        [103.7500, 1.3000],  # Point 0 - going east
        [103.7501, 1.3000],  # Point 1
        [103.7502, 1.3000],  # Point 2
        [103.7503, 1.3000],  # Point 3 - Corner (TARGET)
        [103.7503, 1.3001],  # Point 4 - Going north
        [103.7503, 1.3002],  # Point 5
        [103.7503, 1.3003],  # Point 6
    ]
    linestring1 = LineString(coords_right_angle)
    print(f"Input coordinates (WGS84): {len(coords_right_angle)} points")
    for i, coord in enumerate(coords_right_angle):
        marker = " <- TARGET (corner)" if i == 3 else ""
        print(f"  Point {i}: {coord}{marker}")

    # Test at the corner point (index 3)
    result1_corner = gis.get_curvature(linestring1, point_index=3, window_size=3, sharp_turn_threshold=15.0, default_value=2)
    print(f"\nResult at corner (point 3): {result1_corner}")
    print(f"Expected: 1 (Sharp Turn Present)")
    print(f"PASS: {result1_corner == 1}" if result1_corner == 1 else f"FAIL: Got {result1_corner}, expected 1")

    # Test at a straight section (index 1)
    result1_straight = gis.get_curvature(linestring1, point_index=1, window_size=3, sharp_turn_threshold=15.0, default_value=2)
    print(f"\nResult at straight section (point 1): {result1_straight}")
    print(f"Expected: 2 (No Sharp Turn Present)")
    print(f"PASS: {result1_straight == 2}" if result1_straight == 2 else f"FAIL: Got {result1_straight}, expected 2")

    # Test 2: Straight line (should not detect sharp turn at any point)
    print("\n\nTest 2: Straight line")
    print("-" * 80)
    coords_straight = [
        [103.7500, 1.3000],  # Point 0
        [103.7501, 1.3000],  # Point 1
        [103.7502, 1.3000],  # Point 2 (TARGET)
        [103.7503, 1.3000],  # Point 3
        [103.7504, 1.3000],  # Point 4
    ]
    linestring2 = LineString(coords_straight)
    print(f"Input coordinates (WGS84): {len(coords_straight)} points")
    for i, coord in enumerate(coords_straight):
        marker = " <- TARGET" if i == 2 else ""
        print(f"  Point {i}: {coord}{marker}")

    result2 = gis.get_curvature(linestring2, point_index=2, window_size=3, sharp_turn_threshold=15.0, default_value=2)
    print(f"\nResult at point 2: {result2}")
    print(f"Expected: 2 (No Sharp Turn Present)")
    print(f"PASS: {result2 == 2}" if result2 == 2 else f"FAIL: Got {result2}, expected 2")

    # Test 3: Very tight U-turn (should definitely detect sharp turn)
    print("\n\nTest 3: U-turn")
    print("-" * 80)
    coords_uturn = [
        [103.7500, 1.3000],  # Point 0
        [103.7501, 1.3000],  # Point 1
        [103.7502, 1.3000],  # Point 2 (TARGET - turning area)
        [103.7502, 1.3001],  # Point 3 - Start turning
        [103.7501, 1.3001],  # Point 4 - Turning back
        [103.7500, 1.3001],  # Point 5
    ]
    linestring3 = LineString(coords_uturn)
    print(f"Input coordinates (WGS84): {len(coords_uturn)} points")
    for i, coord in enumerate(coords_uturn):
        marker = " <- TARGET" if i == 2 else ""
        print(f"  Point {i}: {coord}{marker}")

    result3 = gis.get_curvature(linestring3, point_index=2, window_size=3, sharp_turn_threshold=15.0, default_value=2)
    print(f"\nResult at point 2: {result3}")
    print(f"Expected: 1 (Sharp Turn Present)")
    print(f"PASS: {result3 == 1}" if result3 == 1 else f"FAIL: Got {result3}, expected 1")

    # Test 4: Manual calculation to understand the algorithm
    print("\n\nTest 4: Manual calculation walkthrough")
    print("-" * 80)
    coords_manual = [
        [103.7500, 1.3000],
        [103.7500, 1.3001],  # 90 degree turn coming
        [103.7501, 1.3001],
    ]
    linestring4 = LineString(coords_manual)
    print(f"Input coordinates (WGS84): {len(coords_manual)} points")
    for i, coord in enumerate(coords_manual):
        print(f"  Point {i}: {coord}")

    # Convert to metric manually to see what's happening
    from geopandas import GeoDataFrame
    temp_gdf = GeoDataFrame(geometry=[linestring4], crs="EPSG:4326")
    temp_gdf_metric = temp_gdf.to_crs("EPSG:3414")
    linestring_metric = temp_gdf_metric.geometry.iloc[0]
    coords_metric = list(linestring_metric.coords)

    print(f"\nAfter CRS conversion to EPSG:3414 (metric):")
    for i, coord in enumerate(coords_metric):
        print(f"  Point {i}: ({coord[0]:.2f}, {coord[1]:.2f})")

    # Calculate distances
    A, B, C = coords_metric
    a = np.sqrt((B[0] - A[0])**2 + (B[1] - A[1])**2)
    b = np.sqrt((C[0] - B[0])**2 + (C[1] - B[1])**2)
    c = np.sqrt((C[0] - A[0])**2 + (C[1] - A[1])**2)

    print(f"\nSide lengths (meters):")
    print(f"  a (A to B): {a:.2f}m")
    print(f"  b (B to C): {b:.2f}m")
    print(f"  c (A to C): {c:.2f}m")

    # Calculate circumradius
    p = 0.5 * (a + b + c)
    area_squared = p * (p - a) * (p - b) * (p - c)

    if area_squared > 1e-10:
        area = np.sqrt(area_squared)
        R = (a * b * c) / (4.0 * area)
        print(f"\nCircumradius calculation:")
        print(f"  Semi-perimeter p: {p:.2f}m")
        print(f"  Area: {area:.2f}m²")
        print(f"  Circumradius R: {R:.2f}m")
        print(f"  Threshold: 15.0m")
        print(f"  Sharp turn? {R < 15.0} (R < 15.0)")
    else:
        print(f"\nCircumradius calculation:")
        print(f"  Area is too small (collinear points)")

    result4 = gis.get_curvature(linestring4, point_index=1, window_size=2, sharp_turn_threshold=15.0, default_value=2)
    print(f"\nFunction result at point 1: {result4}")
    print(f"Expected: 1 (Sharp Turn Present)")

    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    tests = [
        ("Right-angle turn at corner (point 3)", result1_corner, 1),
        ("Right-angle path at straight section (point 1)", result1_straight, 2),
        ("Straight line (point 2)", result2, 2),
        ("U-turn (point 2)", result3, 1),
        ("Manual calc (point 1)", result4, 1),
    ]

    passed = sum(1 for _, result, expected in tests if result == expected)
    total = len(tests)

    for name, result, expected in tests:
        status = "✓ PASS" if result == expected else "✗ FAIL"
        print(f"{status}: {name} - Got {result}, Expected {expected}")

    print(f"\nTotal: {passed}/{total} tests passed")
    print("=" * 80)

if __name__ == "__main__":
    test_curvature_calculation()
