# CycleRAP Score Calculator

A Python module for calculating cycling path safety scores based on the CycleRAP (Cycling Road Assessment Programme) methodology.

## Overview

The CycleRAP Score Calculator assesses cycling facility safety by analyzing road and path attributes to generate risk scores across four collision/crash types:

- **BB (Bicycle-Bicycle)**: Collisions between cyclists
- **BP (Bicycle-Pedestrian)**: Collisions between cyclists and pedestrians
- **SB (Single-Bicycle)**: Single-bicycle crashes (falls, loss of control)
- **VB (Vehicle-Bicycle)**: Collisions between cyclists and motor vehicles

Each component is scored and categorized into risk bands: **Low**, **Medium**, **High**, or **Extreme**.

## Files

- **[cyclerap_score_calculator.py](cyclerap_score_calculator.py)** - Main calculator module with comprehensive scoring logic
- **[cyclerapmodel.py](cyclerapmodel.py)** - Original reference implementation

## Quick Start

### Basic Usage

```python
from cyclerap_score_calculator import CycleRAPScoreCalculator

# Initialize calculator
calculator = CycleRAPScoreCalculator()

# Define attributes (coded values as per CycleRAP specification)
attributes = {
    "bicycle_lv_speed_avg": 2,      # ≥ 20km/h
    "facility_width": 2,             # Narrow
    "flow_direction": 2,             # Two way
    "delineation": 2,                # Not present
    "light_segregation": 2,          # Not present
    "street_lighting": 1,            # Present
    "grade": 1,                      # < 5 degrees
    "curvature": 2,                  # No sharp turn
    # ... add all other required attributes
}

# Calculate score
result = calculator.calculate_score(attributes)

# Access results
print(f"CycleRAP Score: {result.cyclerap_score:.2f}")
print(f"Risk Band: {result.cyclerap_band.value}")
print(f"BB Score: {result.components.bb_score:.2f} ({result.components.bb_band.value})")
```

### Batch Processing

Process multiple road segments at once using a pandas DataFrame:

```python
import pandas as pd
from cyclerap_score_calculator import CycleRAPScoreCalculator

# Load attributes for multiple segments
attributes_df = pd.read_csv("attributes.csv")

# Calculate scores for all segments
calculator = CycleRAPScoreCalculator()
results_df = calculator.calculate_batch(attributes_df)

# Results include original attributes plus score columns
print(results_df[['cyclerap_score', 'cyclerap_band', 'BB', 'BP', 'SB', 'VB']])
```

### Convenience Function

For one-off calculations, use the convenience function:

```python
from cyclerap_score_calculator import calculate_cyclerap_score

result_dict = calculate_cyclerap_score(attributes)
# Returns dictionary with all scores and bands
```

## Attribute Coding

Attributes must be provided as **coded numeric values** according to the CycleRAP specification:

### Binary Attributes (Present/Not Present)
- `1` = Present
- `2` = Not Present

Examples:
- `delineation`: 1 (Present) or 2 (Not Present)
- `street_lighting`: 1 (Present) or 2 (Not Present)
- `adj_vehicle_parking_0_1m`: 1 (Present) or 2 (Not Present)

### Categorical Attributes

**Facility Width**
- `1` = Very Narrow
- `2` = Narrow
- `3` = Wide

**Flow Direction**
- `1` = One Way
- `2` = Two Way

**Grade**
- `1` = < 5 degrees
- `2` = ≥ 5 degrees

**Curvature**
- `1` = Sharp turn present
- `2` = No sharp turn present

**Bicycle/LV Speed - Average**
- `1` = < 20 km/h
- `2` = ≥ 20 km/h

**Bicycle/LV Speed Differential**
- `1` = < 10 km/h
- `2` = ≥ 10 km/h

**Peak Pedestrian Flow**
- `1` = None
- `2` = Low
- `3` = Moderate to high

**Traffic Flow (Bicycle/LV and Heavy Vehicle)**
- `1` = Low (or restricted access)
- `2` = Moderate to high

**Number of Lanes**
- `1` = 1 per direction (or N/A)
- `2` = > 1 per direction

**Cargo Bikes Proportion**
- `1` = Low
- `2` = Moderate to high

## Complete Attribute List

### Speed & Volume Attributes
- `bicycle_lv_speed_avg` - Average speed of bicycles/light vehicles
- `bicycle_lv_speed_diff` - Speed differential
- `peak_bicycle_lv_flow` - Peak bicycle/light vehicle traffic flow
- `heavy_vehicle_flow` - Heavy vehicle flow level
- `peak_pedestrian_flow` - Peak pedestrian flow
- `cargo_bikes_proportion` - Proportion of cargo bikes/mopeds

### Facility Characteristics
- `facility_width` - Width per direction
- `flow_direction` - One-way or two-way
- `delineation` - Edge delineation present
- `light_segregation` - Light segregation present
- `width_restriction` - Width restriction present
- `loose_slippery_surface` - Loose/slippery surface present

### Geometric Features
- `grade` - Gradient/slope
- `curvature` - Sharp curves present

### Adjacent Hazards (0-1m distance)
- `adj_vehicle_parking_0_1m` - Vehicle parking
- `adj_severe_hazard_0_1m` - Severe hazards (poles, walls, etc.)

### Adjacent Hazards (1-3m distance)
- `adj_road_lane_1_3m` - Road lane
- `adj_vehicle_parking_1_3m` - Vehicle parking
- `adj_severe_hazard_1_3m` - Severe hazards

### Lighting & Visibility
- `street_lighting` - Street lighting present

### Intersection Features
- `pedestrian_crossing` - Pedestrian crossing present
- `intersecting_bicycle_facility` - Intersecting bicycle facility
- `intersection_road_crossing` - Intersection or road crossing
- `crossing_facility` - Crossing facility provided
- `num_lanes_adjacent_road` - Number of lanes on adjacent road
- `num_lanes_intersecting_road` - Number of lanes on intersecting road
- `property_access` - Property access points

## Risk Factor Multipliers

The calculator applies risk multipliers to base severity scores. Examples:

| Attribute | Value | Description | Multiplier |
|-----------|-------|-------------|------------|
| `facility_width` | 1 | Very Narrow | 1.8 |
| `facility_width` | 2 | Narrow | 1.5 |
| `facility_width` | 3 | Wide | 1.0 |
| `flow_direction` | 1 | One Way | 1.0 |
| `flow_direction` | 2 | Two Way | 1.5 |
| `bicycle_lv_speed_avg` | 1 | < 20 km/h | 1.0 |
| `bicycle_lv_speed_avg` | 2 | ≥ 20 km/h | 1.5 |
| `light_segregation` | 1 | Present | 0.8 |
| `light_segregation` | 2 | Not Present | 1.0 |

See the `RISK_FACTORS` dictionary in [cyclerap_score_calculator.py](cyclerap_score_calculator.py) for the complete list.

## Risk Band Thresholds

### BB, BP, SB Components
- **Low**: 0 - 5
- **Medium**: 5 - 10
- **High**: 10 - 20
- **Extreme**: > 20

### VB Component
- **Low**: 0 - 10
- **Medium**: 10 - 25
- **High**: 25 - 60
- **Extreme**: > 60

### Overall CycleRAP Band
The overall risk band is determined by the **highest (most severe)** band among the four components.

## Output Format

### `CycleRAPResult` Object

```python
result = calculator.calculate_score(attributes)

# Access overall score
result.cyclerap_score      # float: Total numeric score
result.cyclerap_band       # RiskBand enum: LOW, MEDIUM, HIGH, or EXTREME

# Access component scores
result.components.bb_score  # float: Bicycle-Bicycle score
result.components.bp_score  # float: Bicycle-Pedestrian score
result.components.sb_score  # float: Single-Bicycle score
result.components.vb_score  # float: Vehicle-Bicycle score

# Access component bands
result.components.bb_band   # RiskBand enum
result.components.bp_band   # RiskBand enum
result.components.sb_band   # RiskBand enum
result.components.vb_band   # RiskBand enum

# Convert to dictionary
result_dict = result.to_dict()
# {
#   'cyclerap_score': 135.98,
#   'cyclerap_band': 'Extreme',
#   'bb_score': 34.99,
#   'bp_score': 19.44,
#   'sb_score': 54.68,
#   'vb_score': 26.87,
#   'bb_band': 'Extreme',
#   'bp_band': 'High',
#   'sb_band': 'Extreme',
#   'vb_band': 'High'
# }
```

## Integration with Existing System

The calculator can be integrated with the existing Flask backend:

```python
from cyclerap_score_calculator import CycleRAPScoreCalculator
import pandas as pd

# In your Flask route
@app.route('/api/calculate-scores', methods=['POST'])
def calculate_scores():
    # Get attributes from request
    attributes_df = pd.DataFrame(request.json['attributes'])

    # Calculate scores
    calculator = CycleRAPScoreCalculator()
    results_df = calculator.calculate_batch(attributes_df)

    # Return results
    return jsonify(results_df.to_dict(orient='records'))
```

## Testing

Run the built-in test suite:

```bash
python3 cyclerap_score_calculator.py
```

Expected output:
```
======================================================================
CycleRAP Risk Assessment Results
======================================================================

Overall CycleRAP Score: 135.98
Risk Band: Extreme

Component Scores:
  BB (Bicycle-Bicycle):     34.99 (Extreme)
  BP (Bicycle-Pedestrian):  19.44 (High)
  SB (Single-Bicycle):      54.68 (Extreme)
  VB (Vehicle-Bicycle):     26.87 (High)
======================================================================
```

## Differences from Excel Model

This Python implementation provides the **core scoring methodology** but differs from the full Excel model in the following ways:

1. **Simplified Base Severity**: Uses constant base severity values (default 5.0) instead of the complex severity lookup tables in the Excel model
2. **Crash Type Flags**: Does not implement the detailed crash type flag system (CB columns in Excel)
3. **Smoothed Scores**: Does not calculate smoothed section scores
4. **Speed Data Integration**: Does not integrate AADT or operating speed data

For full Excel feature parity, you can still use the `calculate_cycleRAP_score()` method in [cycleRAP_interface.py](backend/app/services/cycleRAP_interface.py), which invokes the Excel macro via COM automation (Windows only).

## Dependencies

```
pandas >= 1.3.0
```

No other external dependencies required - uses only Python standard library.

## API Reference

### Classes

#### `CycleRAPScoreCalculator`

Main calculator class for computing CycleRAP scores.

**Methods:**
- `calculate_score(attributes: Dict[str, Any]) -> CycleRAPResult` - Calculate score for single segment
- `calculate_batch(attributes_df: pd.DataFrame) -> pd.DataFrame` - Calculate scores for multiple segments

#### `CycleRAPResult`

Result container with overall and component scores.

**Attributes:**
- `cyclerap_score: float` - Total numeric score
- `cyclerap_band: RiskBand` - Overall risk category
- `components: ScoreComponents` - Component scores and bands

**Methods:**
- `to_dict() -> Dict[str, Any]` - Convert to dictionary

#### `RiskBand` (Enum)

Risk band categories: `LOW`, `MEDIUM`, `HIGH`, `EXTREME`

### Functions

#### `calculate_cyclerap_score(attributes: Dict[str, Any]) -> Dict[str, Any]`

Convenience function for one-off score calculations.

## Related Files

- **[global_var.py](backend/app/services/global_var.py)** - Attribute mappings and constants
- **[defaults.json](backend/src/CycleRAP/defaults.json)** - Default attribute values
- **[serializer.py](backend/app/services/serializer.py)** - Data structure definitions
- **[cycleRAP_interface.py](backend/app/services/cycleRAP_interface.py)** - Excel integration (Windows)

## License

Part of the Path Safety Assessment Tool (CycleRAP) project.

## Version

1.0.0 (2025-11-03)

Based on CycleRAP Model v2.11
