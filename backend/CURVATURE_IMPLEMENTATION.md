# Curvature Attribute Implementation

## Overview

The **Curvature** attribute indicates whether a sharp turn is present on the cycling facility path. It uses a binary classification system based on geometric analysis of the path using the circumcircle method.

## Attribute Details

- **Attribute Name**: Curvature
- **Field Name in System**: `Curvature` (also referenced as `CURV_STR` in code)
- **Data Type**: Categorical (Integer)
- **Default Value**: 2 (No Sharp Turn Present)

### Coding Values

| Code | Label | Description |
|------|-------|-------------|
| 1 | Sharp Turn Present | Minimum circumradius < 15m threshold |
| 2 | No Sharp Turn Present | Minimum circumradius >= 15m threshold (default) |

### Value Mapping

The attribute uses `sharp_turn_mapping` defined in `global_var.py` and `serializer.py`:

```python
sharp_turn_mapping = {
    'Sharp Turn Present': 1,
    'No Sharp Turn Present': 2
}
```

## Data Sources

The curvature is calculated directly from the LineString geometry of the cycling path. No external shapefiles are required.

**Input**: LineString geometry with coordinates in WGS84 (EPSG:4326) or metric CRS (EPSG:3414)

## Algorithm: Circumcircle Method

### Mathematical Foundation

The circumcircle method analyzes path geometry by calculating the circumradius (radius of the circumscribed circle) for every three consecutive points along the path. The minimum circumradius across all triplets represents the sharpest turn along the segment.

For three points A, B, C forming a triangle:

1. **Calculate side lengths**:
   - a = distance(A, B)
   - b = distance(B, C)
   - c = distance(A, C)

2. **Calculate semi-perimeter**:
   - p = 0.5 × (a + b + c)

3. **Calculate area using Heron's formula**:
   - area² = p × (p - a) × (p - b) × (p - c)
   - area = √(area²)

4. **Calculate circumradius**:
   - R = (a × b × c) / (4 × area)

The circumradius R represents the curvature at that point:
- **Smaller radius** = **sharper curve**
- **Larger radius** = **gentler curve**

### Implementation Steps

1. **CRS Conversion**: Convert LineString geometry to metric CRS (EPSG:3414 - SVY21, Singapore) for accurate distance calculations

2. **Densification** (Optional but Recommended):
   - Insert additional vertices every `densify_step` meters (default: 0.5m) along the LineString
   - Creates a smoother representation for more accurate curvature detection
   - Uses Shapely's `interpolate()` method

3. **Coordinate Extraction**: Extract all coordinate points from the (optionally densified) LineString

4. **Triplet Analysis**:
   - Slide a 3-point window through all consecutive vertices
   - For each triplet (A, B, C):
     - Calculate side lengths using Euclidean distance
     - Skip degenerate cases (collinear points, zero-length segments)
     - Calculate circumradius using the formula above
     - Track the minimum radius

5. **Threshold Comparison**:
   - Compare minimum radius against threshold (default: 15.0 meters)
   - If min_radius < threshold: Return 1 (Sharp Turn Present)
   - If min_radius >= threshold: Return 2 (No Sharp Turn Present)

### Algorithm Parameters

| Parameter | Default Value | Description |
|-----------|---------------|-------------|
| `sharp_turn_threshold` | 15.0 meters | Radius below which indicates a sharp turn |
| `densify_step` | 0.5 meters | Distance between interpolated points |
| `epsilon` | 1e-10 | Minimum area value to detect collinear points |
| `default_value` | 2 | Default category (No Sharp Turn Present) |

### Pseudocode

```
FUNCTION get_curvature(linestring_geometry, sharp_turn_threshold=15.0, densify_step=0.5):
    IF linestring is null OR empty:
        RETURN 2  // Default: No Sharp Turn

    // Convert to metric CRS (EPSG:3414)
    IF coordinates look like lat/lon (within -180 to 180, -90 to 90):
        linestring = convert_to_metric_crs(linestring)

    // Densify for better detection
    IF linestring.length > 0:
        num_points = linestring.length / densify_step
        densified_coords = []
        FOR i FROM 0 TO num_points:
            distance = min(i * densify_step, linestring.length)
            point = interpolate_point_at_distance(linestring, distance)
            densified_coords.append(point)
        linestring = LineString(densified_coords)

    coordinates = extract_coordinates(linestring)

    // Need at least 3 points
    IF coordinates.length < 3:
        RETURN 2  // Default: No Sharp Turn

    min_radius = INFINITY
    epsilon = 1e-10

    // Slide through all consecutive triplets
    FOR i FROM 0 TO coordinates.length - 3:
        A = coordinates[i]
        B = coordinates[i + 1]
        C = coordinates[i + 2]

        // Calculate side lengths
        a = distance(A, B)
        b = distance(B, C)
        c = distance(A, C)

        // Skip degenerate cases
        IF a < epsilon OR b < epsilon OR c < epsilon:
            CONTINUE

        // Calculate semi-perimeter
        p = 0.5 * (a + b + c)

        // Calculate area using Heron's formula
        area_squared = p * (p - a) * (p - b) * (p - c)

        // Skip collinear points
        IF area_squared <= epsilon:
            CONTINUE

        area = sqrt(area_squared)

        // Calculate circumradius
        R = (a * b * c) / (4 * area)

        // Track minimum
        IF R < min_radius:
            min_radius = R

    // Apply threshold
    IF min_radius == INFINITY:
        RETURN 2  // No valid triplets found

    IF min_radius < sharp_turn_threshold:
        RETURN 1  // Sharp Turn Present
    ELSE:
        RETURN 2  // No Sharp Turn Present
```

## Error Handling

The implementation handles various edge cases:

1. **Null or empty geometry**: Returns default value (2)
2. **Invalid geometry type**: Returns default value (2)
3. **Insufficient points** (< 3): Returns default value (2)
4. **Degenerate triangles**: Skips collinear points and zero-length segments
5. **Division by zero**: Protected by epsilon checks
6. **No valid triplets**: Returns default value (2)

## Configuration

### Field Definitions

**File**: `backend/app/services/serializer.py`

```python
class Attributes(BaseTable):
    class Fields:
        CURV_STR = "Curvature"
        # ... other fields

    CHOICES = {
        Fields.CURV_STR: sharp_turn_mapping,
        # ... other mappings
    }
```

### Value Mappings

**File**: `backend/app/services/global_var.py`

```python
sharp_turn_mapping = {'Sharp Turn Present': 1, 'No Sharp Turn Present': 2}
```

**File**: `backend/app/services/global_var.py` - Default values

```python
dataframe_default_values = {
    # ... other defaults
    CURV_STR: 2,  // Default: No Sharp Turn Present
    # ... other defaults
}
```

## Integration

### GIS Service

**File**: `backend/app/services/gis_mapping.py`

**Method**: `GIS.get_curvature(linestring_geometry, ...)`

```python
class GIS:
    def get_curvature(self, linestring_geometry,
                     sharp_turn_threshold=15.0,
                     densify_step=0.5,
                     epsilon=1e-10,
                     default_value=2):
        """Calculate curvature using circumcircle method"""
        # Implementation as described above
```

### API Endpoint

**File**: `backend/app/api/projects/routes.py`

**Endpoint**: `POST /api/projects/<project_name>/autocode/gis`

```python
@bp.post("/<project_name>/autocode/gis")
def autocode_gis(project_name: str):
    # ... initialization code

    # Create LineString from coordinates
    from shapely.geometry import LineString
    linestring = LineString(coords) if len(coords) >= 2 else None

    # ... other GIS rules

    # Calculate curvature
    if linestring is not None:
        curvature = _gis.get_curvature(
            linestring,
            sharp_turn_threshold=15.0,
            densify_step=0.5,
            default_value=2
        )
        updates["Curvature"] = curvature

    return ok({"updates": updates, "changed_fields": list(updates.keys())})
```

## Testing

### Test Script

**File**: `backend/test_curvature_standalone.py`

The test script verifies the curvature calculation with various synthetic geometries:

1. **Straight line**: Expects No Sharp Turn (2)
2. **Gentle curve (R=50m)**: Expects No Sharp Turn (2)
3. **Sharp turn (R=10m)**: Expects Sharp Turn (1)
4. **Very sharp turn (R=5m)**: Expects Sharp Turn (1)
5. **Right angle turn**: Expects Sharp Turn (1)
6. **At threshold (R=15m)**: Expects No Sharp Turn (2)
7. **Just below threshold (R=14m)**: Expects Sharp Turn (1)
8. **Two points only**: Expects No Sharp Turn (2) - default for insufficient data

**Run tests**:
```bash
cd backend
python3 test_curvature_standalone.py
```

### Expected Behavior

- **Straight paths**: Return 2 (No Sharp Turn Present)
- **Gentle curves** (radius > 15m): Return 2 (No Sharp Turn Present)
- **Sharp curves** (radius < 15m): Return 1 (Sharp Turn Present)
- **Right angles and U-turns**: Return 1 (Sharp Turn Present)
- **Edge cases** (< 3 points, null geometry): Return 2 (default)

## Performance Considerations

1. **Densification Impact**:
   - Smaller `densify_step` = more precise detection but slower computation
   - Default 0.5m provides good balance
   - For long paths, consider increasing step size

2. **Computational Complexity**:
   - O(n) where n = number of points after densification
   - For a 100m path with 0.5m step: ~200 points, ~198 triplet calculations

3. **Memory Usage**:
   - Minimal - stores only coordinates array and one floating-point minimum
   - No caching of intermediate results

## Examples

### Example 1: Straight Road

**Input**: LineString with coordinates forming a straight line

```python
coords = [(103.8198, 1.3521), (103.8199, 1.3522), (103.8200, 1.3523)]
linestring = LineString(coords)
result = _gis.get_curvature(linestring)
```

**Output**: `2` (No Sharp Turn Present)

**Reason**: All points are collinear or near-collinear, circumradius is very large

### Example 2: Sharp Turn

**Input**: LineString with coordinates forming a tight corner

```python
coords = [(103.8198, 1.3521), (103.8199, 1.3521), (103.8199, 1.3522)]
linestring = LineString(coords)
result = _gis.get_curvature(linestring)
```

**Output**: `1` (Sharp Turn Present)

**Reason**: Tight corner results in small circumradius (< 15m)

### Example 3: Gentle Curve

**Input**: LineString with coordinates forming a gradual bend

```python
# Large arc with 50m radius
angles = np.linspace(0, np.pi/4, 20)
coords = [(50 * np.cos(a) + 103.82, 50 * np.sin(a) + 1.35) for a in angles]
linestring = LineString(coords)
result = _gis.get_curvature(linestring)
```

**Output**: `2` (No Sharp Turn Present)

**Reason**: Large radius curve (50m >> 15m threshold)

## Tuning Guidelines

### Adjusting the Threshold

The `sharp_turn_threshold` parameter (default: 15m) defines what constitutes a "sharp" turn:

- **Increase threshold** (e.g., 20m): Classify more curves as "sharp turns"
  - Use for stricter safety assessment
  - Appropriate for high-speed cycling environments

- **Decrease threshold** (e.g., 10m): Classify fewer curves as "sharp turns"
  - Use for relaxed assessment
  - Appropriate for low-speed recreational paths

### Adjusting Densification

The `densify_step` parameter (default: 0.5m) controls detection granularity:

- **Smaller step** (e.g., 0.25m): More precise detection of short, sharp curves
  - Higher computational cost
  - Better for detecting very localized sharp turns

- **Larger step** (e.g., 1.0m): Faster computation, may miss very short curves
  - Lower computational cost
  - Suitable for analyzing overall path character

## Known Limitations

1. **GPS Noise**: High-frequency GPS noise can create artificial "sharp turns"
   - Mitigation: Pre-smooth the input LineString geometry
   - Mitigation: Increase `densify_step` to reduce sensitivity

2. **Very Short Segments**: Segments < 1.5m with fewer than 3 points return default value
   - Cannot calculate curvature with insufficient data

3. **Numerical Precision**: Floating-point arithmetic can cause edge cases at exactly the threshold
   - Values very close to 15.0m may vary slightly due to rounding

4. **CRS Dependency**: Accurate only in metric coordinate systems
   - Automatically converts WGS84 to EPSG:3414
   - Assumes Singapore context for CRS conversion

## Future Enhancements

1. **Adaptive Densification**: Vary step size based on local curvature
2. **Multi-Scale Analysis**: Analyze at multiple radius scales
3. **Curve Smoothing**: Pre-process paths to remove GPS noise
4. **Confidence Scores**: Return probability instead of binary classification
5. **Visualization**: Generate debug output showing detected sharp turns

## References

- Heron's Formula: https://en.wikipedia.org/wiki/Heron%27s_formula
- Circumscribed Circle: https://en.wikipedia.org/wiki/Circumscribed_circle
- CycleRAP Methodology: CycleRAP User Guide

## Author & Version

- **Implemented**: 2025-11-06
- **Version**: 1.0
- **Framework**: PathSafetyAssessmentTool / CycleRAP
- **Implementation Files**:
  - `backend/app/services/gis_mapping.py` (GIS.get_curvature)
  - `backend/app/api/projects/routes.py` (API integration)
  - `backend/test_curvature_standalone.py` (Testing)
