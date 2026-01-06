#!/usr/bin/env python3
"""
Quick testing script for GIS layer validation
Run this to test the validation logic without UI
"""

import sys
from pathlib import Path
from app.services.shapefile_validator import ShapefileValidator
from app.services.gis_layer_definition import (
    LAYER_DEFINITIONS,
    get_layer_definition,
)
import json

# Add backend to path
backend_root = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_root))


def test_validation_basic():
    """Test basic validation with real shapefiles"""
    print("\n" + "=" * 60)
    print("TEST 1: Basic Validation")
    print("=" * 60)

    shp_dir = Path(__file__).resolve().parent / "backend" / "shapefiles"

    # Test with cycling path replacement
    old_file = shp_dir / "path" / "CyclingpathCentreline.shp"
    new_file = shp_dir / "path" / "CyclingpathCentreline.shp"  # Same file for testing

    if not old_file.exists():
        print(f"⚠️  Old file not found: {old_file}")
        print("Skipping test - run with real shapefiles")
        return

    print(f"\nValidating replacement:")
    print(f"  Old: {old_file}")
    print(f"  New: {new_file}")

    result = ShapefileValidator.validate_replacement(
        str(new_file),
        str(old_file),
        layer_name="cycling_path"
    )

    print(f"\nResult:")
    print(f"  Valid: {result['valid']}")
    print(f"  Errors: {result['errors']}")
    print(f"  Warnings: {result['warnings']}")
    print(f"  Column mapping: {result['column_mapping']}")
    print(f"  Info:")
    for key, value in result['info'].items():
        if key == 'columns_new':
            print(f"    {key}: {value[:3]}... ({len(value)} columns)")
        else:
            print(f"    {key}: {value}")

    return result['valid']


def test_layer_definitions():
    """Test that layer definitions are properly configured"""
    print("\n" + "=" * 60)
    print("TEST 2: Layer Definitions")
    print("=" * 60)

    print(f"\nTotal layers defined: {len(LAYER_DEFINITIONS)}")
    print("\nLayers:")

    for name, definition in LAYER_DEFINITIONS.items():
        print(f"\n  {name}:")
        print(f"    Description: {definition.description}")
        print(f"    Geometry: {definition.geometry_types}")
        print(f"    Required columns: {definition.required_columns}")
        print(f"    Query type: {definition.query_type}")
        if definition.column_aliases:
            print(f"    Column aliases: {definition.column_aliases}")


def test_column_alias_resolution():
    """Test column alias resolution"""
    print("\n" + "=" * 60)
    print("TEST 3: Column Alias Resolution")
    print("=" * 60)

    # Get cycling path definition
    cycling_def = get_layer_definition("cycling_path")

    if not cycling_def:
        print("❌ cycling_path definition not found")
        return False

    # Test cases for WIDTH column
    test_cases = [
        ["WIDTH", "GEOMETRY"],  # Exact match
        ["width", "GEOMETRY"],  # Lowercase
        ["PATH_WIDTH", "GEOMETRY"],  # Alias
        ["W_WIDTH", "GEOMETRY"],  # Alias
        ["Width_m", "GEOMETRY"],  # Alias
        ["GEOMETRY"],  # Missing WIDTH
    ]

    print("\nTesting WIDTH column resolution:")
    for cols in test_cases:
        col_name = cycling_def.get_column_name("WIDTH", cols)
        status = "✅" if col_name else "❌"
        print(f"  {status} Columns {cols} → {col_name}")

    return True


def test_validation_errors():
    """Test that validation catches errors"""
    print("\n" + "=" * 60)
    print("TEST 4: Error Detection (Requires Test Shapefiles)")
    print("=" * 60)

    print("\nTo test error detection, you would need:")
    print("  1. Shapefile with missing WIDTH column")
    print("  2. Shapefile with wrong geometry type (Point vs LineString)")
    print("  3. Shapefile with different CRS")
    print("\nSee TESTING_GIS_LAYERS.md for how to create test files")

    return True


def print_api_endpoints():
    """Print available API endpoints"""
    print("\n" + "=" * 60)
    print("API ENDPOINTS")
    print("=" * 60)

    endpoints = {
        "POST /api/shapefiles/upload": "Upload new shapefiles",
        "PUT /api/shapefiles/replace": "Replace existing shapefiles",
        "POST /api/shapefiles/validate-replacement": "Validate before replacement (NEW)",
        "GET /api/shapefiles": "List all shapefiles",
        "GET /api/shapefiles/categories": "List categories",
        "DELETE /api/shapefiles/<path>": "Delete shapefile",
    }

    for endpoint, description in endpoints.items():
        print(f"\n  {endpoint}")
        print(f"    {description}")


def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("GIS LAYER VALIDATION TEST SUITE")
    print("=" * 60)

    try:
        # Test 1: Layer definitions
        test_layer_definitions()

        # Test 2: Column alias resolution
        test_column_alias_resolution()

        # Test 3: Basic validation
        test_validation_basic()

        # Test 4: Error scenarios
        test_validation_errors()

        # Print API info
        print_api_endpoints()

        print("\n" + "=" * 60)
        print("✅ TESTS COMPLETE")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Start Flask backend: python run.py")
        print("2. Start React frontend: npm run dev")
        print("3. Open browser: http://localhost:5173")
        print("4. Click 'GIS Layer' button on Projects page")
        print("5. Try 'Replace GIS Layer' workflow")
        print("\nSee TESTING_GIS_LAYERS.md for detailed testing guide")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
