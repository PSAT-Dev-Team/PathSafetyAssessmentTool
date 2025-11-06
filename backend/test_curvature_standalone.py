#!/usr/bin/env python3
"""
Standalone test script for Curvature calculation
Tests the circumcircle method algorithm directly without CRS conversion
"""
import numpy as np
from shapely.geometry import LineString

def calculate_curvature_simple(linestring, sharp_turn_threshold=15.0, densify_step=0.5, epsilon=1e-10, default_value=2):
    """
    Calculate curvature using circumcircle method (simplified for testing)
    Works directly in metric coordinates without CRS conversion
    """
    if linestring is None or linestring.is_empty:
        return default_value

    coords = list(linestring.coords)

    # Densify the LineString
    if linestring.length > 0:
        num_points = int(linestring.length / densify_step)
        if num_points > 1:
            densified_coords = []
            for i in range(num_points + 1):
                distance = min(i * densify_step, linestring.length)
                point = linestring.interpolate(distance)
                densified_coords.append((point.x, point.y))
            if densified_coords[-1] != coords[-1]:
                densified_coords.append(coords[-1])
            coords = densified_coords

    # Need at least 3 points
    if len(coords) < 3:
        return default_value

    min_radius = float('inf')

    # Slide through all consecutive triplets
    for i in range(len(coords) - 2):
        A = coords[i]
        B = coords[i + 1]
        C = coords[i + 2]

        # Calculate side lengths
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

        area = np.sqrt(area_squared)

        # Calculate circumradius
        R = (a * b * c) / (4.0 * area)

        # Track minimum radius
        if R < min_radius:
            min_radius = R

    # Apply threshold
    if min_radius == float('inf'):
        return default_value

    if min_radius < sharp_turn_threshold:
        return 1  # Sharp Turn Present
    else:
        return 2  # No Sharp Turn Present


def test_curvature():
    """Test the curvature calculation with various geometries"""
    print("=" * 80)
    print("Testing Curvature Calculation (Circumcircle Method)")
    print("=" * 80)

    test_cases = []

    # 1. Straight line
    test_cases.append({
        'name': 'Straight line',
        'coords': [(0, 0), (10, 0), (20, 0), (30, 0), (40, 0)],
        'expected': 2,
        'description': 'Perfectly straight path'
    })

    # 2. Gentle curve (R=50m)
    angles = np.linspace(0, np.pi/3, 20)
    test_cases.append({
        'name': 'Gentle curve (R=50m)',
        'coords': [(50 * np.cos(a), 50 * np.sin(a)) for a in angles],
        'expected': 2,
        'description': 'Gentle curve with 50m radius'
    })

    # 3. Sharp turn (R=10m)
    angles = np.linspace(0, np.pi/2, 20)
    test_cases.append({
        'name': 'Sharp turn (R=10m)',
        'coords': [(10 * np.cos(a), 10 * np.sin(a)) for a in angles],
        'expected': 1,
        'description': 'Sharp 90-degree turn with 10m radius'
    })

    # 4. Very sharp turn (R=5m)
    angles = np.linspace(0, np.pi, 15)
    test_cases.append({
        'name': 'Very sharp turn (R=5m)',
        'coords': [(5 * np.cos(a), 5 * np.sin(a)) for a in angles],
        'expected': 1,
        'description': 'Very sharp U-turn with 5m radius'
    })

    # 5. Right angle
    test_cases.append({
        'name': 'Right angle turn',
        'coords': [(0, 0), (10, 0), (10, 1), (10, 10)],
        'expected': 1,
        'description': '90-degree right angle turn'
    })

    # 6. At threshold (R=15m)
    angles = np.linspace(0, np.pi/2, 20)
    test_cases.append({
        'name': 'At threshold (R=15m)',
        'coords': [(15 * np.cos(a), 15 * np.sin(a)) for a in angles],
        'expected': 2,
        'description': 'Turn with exactly 15m radius (at threshold)'
    })

    # 7. Just below threshold (R=14m)
    angles = np.linspace(0, np.pi/2, 20)
    test_cases.append({
        'name': 'Just below threshold (R=14m)',
        'coords': [(14 * np.cos(a), 14 * np.sin(a)) for a in angles],
        'expected': 1,
        'description': 'Turn with 14m radius (below threshold)'
    })

    # 8. Two points only
    test_cases.append({
        'name': 'Two points only',
        'coords': [(0, 0), (10, 0)],
        'expected': 2,
        'description': 'Insufficient points for curvature calculation'
    })

    print("\nRunning tests on synthetic geometries (metric coordinates):\n")

    passed = 0
    failed = 0

    for i, test_case in enumerate(test_cases, 1):
        print(f"Test {i}: {test_case['name']}")
        print(f"  Description: {test_case['description']}")

        linestring = LineString(test_case['coords'])
        print(f"  Points: {len(test_case['coords'])}, Length: {linestring.length:.2f}m")

        try:
            result = calculate_curvature_simple(
                linestring,
                sharp_turn_threshold=15.0,
                densify_step=0.5
            )

            expected = test_case['expected']
            result_str = "Sharp Turn Present" if result == 1 else "No Sharp Turn Present"

            print(f"  Result: {result} ({result_str})")

            if result == expected:
                print(f"  ✓ PASS")
                passed += 1
            else:
                print(f"  ✗ FAIL (expected {expected})")
                failed += 1

        except Exception as e:
            print(f"  ✗ ERROR: {e}")
            failed += 1
            import traceback
            traceback.print_exc()

        print()

    print("=" * 80)
    print(f"Test Summary: {passed} passed, {failed} failed out of {len(test_cases)} tests")
    print("=" * 80)

    # Additional test: Calculate actual minimum radius for verification
    print("\nVerification: Calculating actual minimum radius for test cases")
    print("-" * 80)

    for i, test_case in enumerate([test_cases[1], test_cases[2], test_cases[3], test_cases[5], test_cases[6]], 1):
        linestring = LineString(test_case['coords'])
        coords = list(linestring.coords)

        min_radius = float('inf')
        epsilon = 1e-10

        for j in range(len(coords) - 2):
            A = coords[j]
            B = coords[j + 1]
            C = coords[j + 2]

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

        print(f"{test_case['name']}: Min radius = {min_radius:.2f}m")

    print("-" * 80)


if __name__ == "__main__":
    test_curvature()
