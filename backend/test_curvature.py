#!/usr/bin/env python3
"""
Test script for Curvature attribute autocoding
Tests the get_curvature() method to ensure it works correctly

Note: This test script creates synthetic geometries to test the curvature
calculation algorithm without requiring the full Flask app or shapefiles.
"""
import sys
from pathlib import Path
import numpy as np
from shapely.geometry import LineString, Point
import geopandas as gpd

# Add backend to path to import modules
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))

# Create a minimal mock to test just the curvature calculation
# This avoids Python 3.9 vs 3.10+ compatibility issues in the full module
class MockLayerStore:
    def __init__(self):
        pass

class MockGIS:
    def __init__(self, store=None):
        self.store = store

    def get_curvature(self, linestring_geometry, sharp_turn_threshold=15.0, densify_step=0.5, epsilon=1e-10, default_value=2):
        """
        Calculate curvature of a cycling facility path using the circumcircle method.
        (Implementation copied from gis_mapping.py for standalone testing)
        """
        from shapely.geometry import LineString as LS

        # Handle null or invalid geometry
        if linestring_geometry is None or linestring_geometry.is_empty:
            return default_value

        # Convert to metric CRS if needed
        if not isinstance(linestring_geometry, LS):
            return default_value

        # Create a GeoDataFrame to handle CRS conversion
        from geopandas import GeoDataFrame
        CRS_WGS84 = "EPSG:4326"
        CRS_METRIC = "EPSG:3414"
        temp_gdf = GeoDataFrame(geometry=[linestring_geometry], crs=CRS_WGS84)

        # Check if already in metric CRS (heuristic: if coordinates are large, assume metric)
        coords = list(linestring_geometry.coords)
        if len(coords) > 0:
            x, y = coords[0]
            # If coordinates look like lat/lon, convert to metric
            if -180 <= x <= 180 and -90 <= y <= 90:
                temp_gdf = temp_gdf.to_crs(CRS_METRIC)
                linestring_geometry = temp_gdf.geometry.iloc[0]

        # Densify the LineString for better curvature detection
        if linestring_geometry.length > 0:
            num_points = int(linestring_geometry.length / densify_step)
            if num_points > 1:
                densified_coords = []
                for i in range(num_points + 1):
                    distance = min(i * densify_step, linestring_geometry.length)
                    point = linestring_geometry.interpolate(distance)
                    densified_coords.append((point.x, point.y))
                if densified_coords[-1] != coords[-1]:
                    densified_coords.append(coords[-1])
                linestring_geometry = LS(densified_coords)

        # Extract coordinates from densified geometry
        coordinates = list(linestring_geometry.coords)

        # Need at least 3 points to calculate curvature
        if len(coordinates) < 3:
            return default_value

        # Initialize minimum radius to infinity
        min_radius = float('inf')

        # Slide through all consecutive triplets
        for i in range(len(coordinates) - 2):
            A = coordinates[i]
            B = coordinates[i + 1]
            C = coordinates[i + 2]

            # Calculate side lengths using Euclidean distance
            a = np.sqrt((B[0] - A[0])**2 + (B[1] - A[1])**2)
            b = np.sqrt((C[0] - B[0])**2 + (C[1] - B[1])**2)
            c = np.sqrt((C[0] - A[0])**2 + (C[1] - A[1])**2)

            # Skip degenerate cases
            if a < epsilon or b < epsilon or c < epsilon:
                continue

            # Calculate semi-perimeter
            p = 0.5 * (a + b + c)

            # Calculate area using Heron's formula
            area_squared = p * (p - a) * (p - b) * (p - c)

            # Skip if area is too small (collinear points)
            if area_squared <= epsilon:
                continue

            # Calculate area
            area = np.sqrt(area_squared)

            # Calculate circumradius: R = (a * b * c) / (4 * area)
            R = (a * b * c) / (4.0 * area)

            # Track minimum radius
            if R < min_radius:
                min_radius = R

        # Apply threshold to determine sharp turn
        if min_radius == float('inf'):
            return default_value

        if min_radius < sharp_turn_threshold:
            return 1  # Sharp Turn Present
        else:
            return 2  # No Sharp Turn Present

# Use the mock for testing
gis = type('module', (), {'GIS': MockGIS, 'LayerStore': MockLayerStore})()

# Constants
CRS_WGS84 = "EPSG:4326"
CRS_METRIC = "EPSG:3414"

def create_test_linestrings():
    """Create various test LineStrings with different curvatures"""
    test_cases = []

    # 1. Straight line (no curvature) - should return 2 (No Sharp Turn)
    straight_coords = [(0, 0), (10, 0), (20, 0), (30, 0), (40, 0)]
    test_cases.append({
        'name': 'Straight line',
        'coords': straight_coords,
        'expected': 2,
        'description': 'Perfectly straight path with no turns'
    })

    # 2. Gentle curve (large radius) - should return 2 (No Sharp Turn)
    # Circle with radius 50m - very gentle
    angles = np.linspace(0, np.pi/3, 20)  # 60 degrees
    gentle_coords = [(50 * np.cos(a), 50 * np.sin(a)) for a in angles]
    test_cases.append({
        'name': 'Gentle curve (R=50m)',
        'coords': gentle_coords,
        'expected': 2,
        'description': 'Gentle curve with 50m radius (well above 15m threshold)'
    })

    # 3. Sharp turn (small radius) - should return 1 (Sharp Turn Present)
    # Circle with radius 10m - sharp turn
    angles = np.linspace(0, np.pi/2, 20)  # 90 degrees
    sharp_coords = [(10 * np.cos(a), 10 * np.sin(a)) for a in angles]
    test_cases.append({
        'name': 'Sharp turn (R=10m)',
        'coords': sharp_coords,
        'expected': 1,
        'description': 'Sharp 90-degree turn with 10m radius (below 15m threshold)'
    })

    # 4. Very sharp turn (radius ~5m) - should return 1 (Sharp Turn Present)
    angles = np.linspace(0, np.pi, 15)  # 180 degrees
    very_sharp_coords = [(5 * np.cos(a), 5 * np.sin(a)) for a in angles]
    test_cases.append({
        'name': 'Very sharp turn (R=5m)',
        'coords': very_sharp_coords,
        'expected': 1,
        'description': 'Very sharp U-turn with 5m radius'
    })

    # 5. Right angle turn - should return 1 (Sharp Turn Present)
    right_angle_coords = [(0, 0), (10, 0), (10, 1), (10, 10)]
    test_cases.append({
        'name': 'Right angle turn',
        'coords': right_angle_coords,
        'expected': 1,
        'description': '90-degree right angle turn with tight corner'
    })

    # 6. S-curve with one sharp section - should return 1 (Sharp Turn Present)
    # First part: gentle, second part: sharp
    s_curve_coords = []
    # Gentle part
    angles1 = np.linspace(0, np.pi/4, 10)
    for a in angles1:
        s_curve_coords.append((30 * np.cos(a), 30 * np.sin(a)))
    # Sharp part
    angles2 = np.linspace(np.pi/4, 3*np.pi/4, 10)
    for a in angles2:
        s_curve_coords.append((30 * np.cos(a) + 20, 8 * np.sin(a) + 20))
    test_cases.append({
        'name': 'S-curve with sharp section',
        'coords': s_curve_coords,
        'expected': 1,
        'description': 'Mixed curve with one sharp section (min radius should be < 15m)'
    })

    # 7. Nearly straight with slight bend - should return 2 (No Sharp Turn)
    slight_bend_coords = [(0, 0), (10, 0), (20, 0.2), (30, 0.3), (40, 0.3), (50, 0.2), (60, 0)]
    test_cases.append({
        'name': 'Slight bend',
        'coords': slight_bend_coords,
        'expected': 2,
        'description': 'Nearly straight line with very slight bend'
    })

    # 8. Edge case: exactly at threshold (15m radius)
    angles = np.linspace(0, np.pi/2, 20)  # 90 degrees
    threshold_coords = [(15 * np.cos(a), 15 * np.sin(a)) for a in angles]
    test_cases.append({
        'name': 'At threshold (R=15m)',
        'coords': threshold_coords,
        'expected': 2,  # >= threshold, so No Sharp Turn
        'description': '90-degree turn with exactly 15m radius (at threshold)'
    })

    # 9. Just below threshold (14m radius) - should return 1
    angles = np.linspace(0, np.pi/2, 20)
    below_threshold_coords = [(14 * np.cos(a), 14 * np.sin(a)) for a in angles]
    test_cases.append({
        'name': 'Just below threshold (R=14m)',
        'coords': below_threshold_coords,
        'expected': 1,
        'description': '90-degree turn with 14m radius (just below 15m threshold)'
    })

    # 10. Edge case: only 2 points (should return default)
    two_point_coords = [(0, 0), (10, 0)]
    test_cases.append({
        'name': 'Two points only',
        'coords': two_point_coords,
        'expected': 2,
        'description': 'LineString with only 2 points (insufficient for curvature calculation)'
    })

    return test_cases

def calculate_min_circumradius(coords):
    """Calculate the minimum circumradius for a set of coordinates (for verification)"""
    if len(coords) < 3:
        return float('inf')

    min_radius = float('inf')
    epsilon = 1e-10

    for i in range(len(coords) - 2):
        A = coords[i]
        B = coords[i + 1]
        C = coords[i + 2]

        a = np.sqrt((B[0] - A[0])**2 + (B[1] - A[1])**2)
        b = np.sqrt((C[0] - B[0])**2 + (C[1] - B[1])**2)
        c = np.sqrt((C[0] - A[0])**2 + (C[1] - A[1])**2)

        if a < epsilon or b < epsilon or c < epsilon:
            continue

        p = 0.5 * (a + b + c)
        area_squared = p * (p - a) * (p - b) * (p - c)

        if area_squared <= epsilon:
            continue

        area = np.sqrt(area_squared)
        R = (a * b * c) / (4.0 * area)

        if R < min_radius:
            min_radius = R

    return min_radius

def test_curvature():
    """Test the curvature calculation"""
    print("=" * 80)
    print("Testing Curvature Autocoding (Circumcircle Method)")
    print("=" * 80)

    # 1. Initialize GIS system (using mock for standalone testing)
    print(f"\n1. Initializing GIS system (mock for standalone testing)")
    try:
        layer_store = gis.LayerStore()
        _gis = gis.GIS(layer_store)
        print("   ✓ GIS system initialized successfully")
    except Exception as e:
        print(f"   ✗ Error initializing GIS system: {e}")
        import traceback
        traceback.print_exc()
        return

    # 2. Test with synthetic geometries
    print("\n2. Testing with synthetic LineString geometries")
    test_cases = create_test_linestrings()

    passed = 0
    failed = 0

    for i, test_case in enumerate(test_cases, 1):
        print(f"\n   Test {i}: {test_case['name']}")
        print(f"   Description: {test_case['description']}")

        # Create LineString
        linestring = LineString(test_case['coords'])
        print(f"   Points: {len(test_case['coords'])}, Length: {linestring.length:.2f}m")

        # Calculate expected minimum radius
        min_radius_calc = calculate_min_circumradius(test_case['coords'])
        if min_radius_calc != float('inf'):
            print(f"   Expected min radius: {min_radius_calc:.2f}m")

        try:
            # Call the get_curvature method
            sharp_turn_threshold = 15.0
            densify_step = 0.5

            curvature = _gis.get_curvature(
                linestring,
                sharp_turn_threshold=sharp_turn_threshold,
                densify_step=densify_step,
                default_value=2
            )

            expected = test_case['expected']

            if curvature == 1:
                result_str = "1 (Sharp Turn Present)"
            elif curvature == 2:
                result_str = "2 (No Sharp Turn Present)"
            else:
                result_str = f"{curvature} (Unexpected)"

            print(f"   Result: {result_str}")

            if curvature == expected:
                print(f"   ✓ PASS (expected {expected})")
                passed += 1
            else:
                print(f"   ✗ FAIL (expected {expected}, got {curvature})")
                failed += 1

        except Exception as e:
            print(f"   ✗ Error: {e}")
            failed += 1
            import traceback
            traceback.print_exc()

    print(f"\n   Test Summary: {passed} passed, {failed} failed out of {len(test_cases)} tests")

    # 3. Test with real-world WGS84 coordinates (Singapore)
    print("\n3. Testing with real-world coordinates (WGS84)")

    # Straight path along a road
    straight_path_wgs84 = [
        (103.8198, 1.3521),
        (103.8199, 1.3522),
        (103.8200, 1.3523),
        (103.8201, 1.3524),
        (103.8202, 1.3525),
    ]

    # Sharp turn (simulated right angle turn)
    sharp_turn_wgs84 = [
        (103.8198, 1.3521),
        (103.8199, 1.3521),
        (103.8200, 1.3521),
        (103.8200, 1.3522),
        (103.8200, 1.3523),
        (103.8200, 1.3524),
    ]

    test_paths = [
        ('Straight path (WGS84)', straight_path_wgs84, 2),
        ('Sharp turn (WGS84)', sharp_turn_wgs84, 1),
    ]

    for name, coords, expected in test_paths:
        print(f"\n   Testing: {name}")
        linestring = LineString(coords)

        try:
            curvature = _gis.get_curvature(
                linestring,
                sharp_turn_threshold=15.0,
                densify_step=0.5,
                default_value=2
            )

            if curvature == 1:
                result_str = "1 (Sharp Turn Present)"
            elif curvature == 2:
                result_str = "2 (No Sharp Turn Present)"
            else:
                result_str = f"{curvature} (Unexpected)"

            print(f"   Result: {result_str}")
            if curvature == expected:
                print(f"   ✓ Matches expected value ({expected})")
            else:
                print(f"   ⚠ Different from expected value ({expected})")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            import traceback
            traceback.print_exc()

    # 4. Test edge cases
    print("\n4. Testing edge cases")

    edge_cases = [
        ('Empty LineString', LineString(), 2),
        ('Single point (invalid)', None, 2),
        ('Two points only', LineString([(0, 0), (10, 0)]), 2),
    ]

    for name, linestring, expected in edge_cases:
        print(f"\n   Testing: {name}")

        try:
            if linestring is None:
                print("   Skipping (invalid geometry)")
                continue

            curvature = _gis.get_curvature(
                linestring,
                sharp_turn_threshold=15.0,
                densify_step=0.5,
                default_value=2
            )

            print(f"   Result: {curvature}")
            if curvature == expected:
                print(f"   ✓ Returns default value ({expected}) as expected")
            else:
                print(f"   ⚠ Expected {expected}, got {curvature}")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            import traceback
            traceback.print_exc()

    # 5. Test with different threshold values
    print("\n5. Testing threshold sensitivity")

    # Create a turn with known radius (~12m)
    angles = np.linspace(0, np.pi/2, 20)
    test_coords = [(12 * np.cos(a), 12 * np.sin(a)) for a in angles]
    test_linestring = LineString(test_coords)

    thresholds = [10.0, 12.0, 15.0, 20.0]

    print(f"   Test curve with approximate 12m radius")
    for threshold in thresholds:
        try:
            curvature = _gis.get_curvature(
                test_linestring,
                sharp_turn_threshold=threshold,
                densify_step=0.5,
                default_value=2
            )

            result_str = "Sharp Turn Present" if curvature == 1 else "No Sharp Turn Present"
            print(f"   Threshold {threshold}m: {curvature} ({result_str})")

        except Exception as e:
            print(f"   Error with threshold {threshold}m: {e}")

    print("\n" + "=" * 80)
    print("Test completed!")
    print("=" * 80)

if __name__ == "__main__":
    test_curvature()
