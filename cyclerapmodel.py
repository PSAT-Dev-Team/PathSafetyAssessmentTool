"""
CycleRAP Score Calculator

This module calculates the CycleRAP risk score based on the model from:
CycleRAP_-_model_-_generation_v2_11_-_24_09_27_-_suppliers.xlsm

The score is calculated in column BR (rows 3 and 4):
- BR3: Numeric score (sum of 4 crash type components)
- BR4: Categorical risk level (Low/Medium/High/Extreme)
"""

from typing import Dict, Tuple, Any


# Risk factor lookup tables (from the Excel screenshots)
# These map coded values to multiplier factors
RISK_FACTORS = {

    # Facility access (Not useful for cyclerap score calculation)
    # "facility_access": {1: None, 2: None},  # Adequate/Inadequate - no risk factor shown
    
    # Loose or slippery surface
    "loose_slippery_surface": {1: 1.5, 2: 1.0},  # Present=1.5, Not present=1.0
    
    # Tram or train rails (not relevant in Singapore context)
    # "tram_train_rails": {1: 1.5, 2: 1.0},  # Present=1.5, Not present=1.0
    
    # Major surface deformation or drain (Not useful for cyclerap score calculation)
    # "major_surface_deformation": {1: None, 2: None},  # No risk factor shown
    
    # Fixed obstacle on facility (Not useful for cyclerap score calculation)
    # "fixed_obstacle": {1: None, 2: None},  # No risk factor shown
    
    # Non-fixed obstacle on facility (Not useful for cyclerap score calculation)
    # "non_fixed_obstacle": {1: None, 2: None},  # No risk factor shown
    
    # Delineation
    "delineation": {1: 1.0, 2: 1.2},  # Present=1.0, Not present=1.2
    
    # Facility width per direction
    "facility_width": {1: 1.8, 2: 1.5, 3: 1.0},  # Very Narrow=1.8, Narrow=1.5, Wide=1.0
    
    # Flow direction
    "flow_direction": {1: 1.0, 2: 1.5},  # One way=1.0, Two way=1.5
    
    # Width restriction
    "width_restriction": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
    
    # Adjacent road lane 0-1m (Not useful for cyclerap score calculation)
    # "adj_road_lane_0_1m": {1: None, 2: None},  # No risk factor shown
    
    # Adjacent vehicle parking 0-1m
    "adj_vehicle_parking_0_1m": {1: 1.5, 2: 1.0},  # Present=1.5, Not present=1.0
    
    # Adjacent severe hazard 0-1m
    "adj_severe_hazard_0_1m": {1: 1.8, 2: 1.0},  # Present=1.8, Not present=1.0
    
    # Adjacent object or level change 0-1m (Not useful for cyclerap score calculation)
    # "adj_object_level_change_0_1m": {1: None, 2: None},  # No risk factor shown
    
    # Adjacent sidewalk 0-1m (Not useful for cyclerap score calculation)
    # "adj_sidewalk_0_1m": {1: None, 2: None},  # No risk factor shown
    
    # Adjacent road lane 1-3m
    "adj_road_lane_1_3m": {1: 0.8, 2: 1.0},  # Present=0.8, Not present=1.0
    
    # Adjacent vehicle parking 1-3m
    "adj_vehicle_parking_1_3m": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
    
    # Adjacent severe hazard 1-3m
    "adj_severe_hazard_1_3m": {1: 1.5, 2: 1.0},  # Present=1.5, Not present=1.0
    
    # Adjacent object or level change 1-3m (Not useful for cyclerap score calculation)
    # "adj_object_level_change_1_3m": {1: None, 2: None},  # No risk factor shown
    
    # Adjacent sidewalk 1-3m (Not useful for cyclerap score calculation)
    # "adj_sidewalk_1_3m": {1: None, 2: None},  # No risk factor shown
    
    # Grade
    "grade": {1: 1.0, 2: 1.2},  # < 5 degrees=1.0, =/> 5 degrees=1.2
    
    # Curvature
    "curvature": {1: 1.5, 2: 1.0},  # Sharp turn Present=1.5, No sharp turn present=1.0
    
    # Street lighting
    "street_lighting": {1: 1.0, 2: 1.2},  # Present=1.0, Not present=1.2
    
    # Pedestrian crossing
    "pedestrian_crossing": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
    
    # Intersecting bicycle facility
    "intersecting_bicycle_facility": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
    
    # Intersection approach (Not useful for cyclerap score calculation)
    # "intersection_approach": {1: None, 2: None},  # Shared/Separate/NA - no risk factor shown
    
    # Intersection or road crossing
    "intersection_road_crossing": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
    
    # Crossing facility
    "crossing_facility": {1: 1.0, 2: 1.2},  # Present/NA=1.0, Not present=1.2
    
    # Number of lanes - adjacent road
    "num_lanes_adjacent_road": {1: 1.0, 2: 1.2},  # 1 per direction/NA=1.0, > 1 per direction=1.2
    
    # Number of lanes - intersecting road
    "num_lanes_intersecting_road": {1: 1.0, 2: 1.2},  # 1 per direction=1.0, > 1 per direction=1.2
    
    # Property access
    "property_access": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
    
    # SPEED/VOLUME ATTRIBUTES
    # Bicycle/LV speed - average
    "bicycle_lv_speed_avg": {1: 1.0, 2: 1.5},  # < 20km/h=1.0, =/> 20km/h=1.5
    
    # Bicycle/LV speed differential
    "bicycle_lv_speed_diff": {1: 1.0, 2: 1.2},  # < 10km/h=1.0, =/> 10km/h=1.2
    
    # Heavy vehicle flow
    "heavy_vehicle_flow": {1: 1.0, 2: 1.2},  # Low/restricted access=1.0, Moderate to high=1.2
    
    # Light Segregation
    "light_segregation": {1: 0.8, 2: 1.0},  # Present=0.8, Not present=1.0
    
    # Peak pedestrian flow along or across
    "peak_pedestrian_flow": {1: 1.0, 2: 1.2, 3: 1.5},  # None=1.0, Low=1.2, Moderate to high=1.5
    
    # Peak bicycle/LV traffic flow
    "peak_bicycle_lv_flow": {1: 1.0, 2: 1.2},  # Low=1.0, Moderate to high=1.2
    
    # Observed proportion of cargo bikes
    "cargo_bikes_proportion": {1: 1.0, 2: 1.2},  # Low=1.0, Moderate to high=1.2
}


def calculate_component_bu3(attributes: Dict[str, Any]) -> float:
    """
    Calculate BU3 - Collision speed score
    
    BU3 = BX3 = CD3 = CJ3 * PRODUCT(CH3:CH6)
    
    Where:
    - CJ3 = base severity from collision speed
    - CH3:CH6 = risk factors based on bicycle/LV speed average,
                speed differential, cyclist flow, heavy vehicle flow
    """
    # Base severity (would need to extract from CM3 which depends on many factors)
    # For now, using a simplified calculation
    base_severity = attributes.get("base_collision_severity", 5.0)
    
    # Multipliers - using corrected attribute names from screenshots
    bicycle_speed_mult = RISK_FACTORS["bicycle_lv_speed_avg"].get(
        attributes.get("bicycle_lv_speed_avg", 1), 1.0
    )
    speed_diff_mult = RISK_FACTORS["bicycle_lv_speed_diff"].get(
        attributes.get("bicycle_lv_speed_diff", 1), 1.0
    )
    cyclist_flow_mult = RISK_FACTORS["peak_bicycle_lv_flow"].get(
        attributes.get("peak_bicycle_lv_flow", 1), 1.0
    )
    heavy_vehicle_mult = RISK_FACTORS["heavy_vehicle_flow"].get(
        attributes.get("heavy_vehicle_flow", 1), 1.0
    )
    
    bu3 = base_severity * bicycle_speed_mult * speed_diff_mult * cyclist_flow_mult * heavy_vehicle_mult
    return bu3


def calculate_component_bu8(attributes: Dict[str, Any]) -> float:
    """
    Calculate BU8 - Crash type 1 score
    
    BU8 = BX8 + BX11
    Where BX8 and BX11 are conditional on certain crash types being present
    """
    bu8 = 0.0
    
    # BX8 - depends on CB8:CB9 (specific crash type indicators)
    if attributes.get("crash_type_f", False) or attributes.get("crash_type_g", False):
        base_severity = attributes.get("base_collision_severity", 5.0)
        bu8 += base_severity
    
    # BX11 - depends on CB11:CB13 (other crash type indicators)
    if attributes.get("crash_type_i", False) or attributes.get("crash_type_j", False) or attributes.get("crash_type_k", False):
        base_severity = attributes.get("base_collision_severity", 5.0)
        bu8 += base_severity
    
    return bu8


def calculate_component_bu16(attributes: Dict[str, Any]) -> float:
    """
    Calculate BU16 - Crash type 2 score
    
    BU16 = BX16 + BX23
    """
    bu16 = 0.0
    
    # BX16 - conditional crash type
    if any(attributes.get(f"crash_type_{i}", False) for i in range(16, 22)):
        base_severity = attributes.get("base_collision_severity", 5.0)
        # Apply multipliers based on severity determinants
        mult = 1.0
        mult *= RISK_FACTORS["bicycle_lv_speed_avg"].get(attributes.get("bicycle_lv_speed_avg", 1), 1.0)
        mult *= RISK_FACTORS["facility_width"].get(attributes.get("facility_width", 3), 1.0)
        mult *= RISK_FACTORS["grade"].get(attributes.get("grade", 1), 1.0)
        mult *= RISK_FACTORS["curvature"].get(attributes.get("curvature", 2), 1.0)
        
        bu16 += base_severity * mult
    
    # BX23 - another crash scenario
    combined_severity = attributes.get("base_collision_severity", 5.0) + attributes.get("base_severity_o", 0.0)
    mult = 1.0
    mult *= RISK_FACTORS["bicycle_lv_speed_avg"].get(attributes.get("bicycle_lv_speed_avg", 1), 1.0)
    mult *= RISK_FACTORS["grade"].get(attributes.get("grade", 1), 1.0)
    
    bu16 += combined_severity * mult
    
    return bu16


def calculate_component_bu26(attributes: Dict[str, Any]) -> float:
    """
    Calculate BU26 - Crash type 3 score
    
    BU26 = SUM(BX26, BX32, BX40, BX45, BX49)
    """
    bu26 = 0.0
    
    # BX26 - conditional crash type
    if any(attributes.get(f"crash_type_{i}", False) for i in range(26, 30)):
        combined_severity = attributes.get("base_collision_severity", 5.0) + attributes.get("base_severity_o", 0.0)
        mult = 1.0
        mult *= RISK_FACTORS["bicycle_lv_speed_avg"].get(attributes.get("bicycle_lv_speed_avg", 1), 1.0)
        mult *= RISK_FACTORS["adj_severe_hazard_0_1m"].get(attributes.get("adj_severe_hazard_0_1m", 2), 1.0)
        mult *= RISK_FACTORS["flow_direction"].get(attributes.get("flow_direction", 1), 1.0)
        
        bu26 += combined_severity * mult
    
    # BX32 - additional crash scenarios (simplified)
    if any(attributes.get(f"crash_type_{i}", False) for i in range(32, 37)):
        bu26 += attributes.get("adjacent_hazard_score", 0.0)
    
    # BX40, BX45, BX49 - intersection-related crashes (divided by 3)
    intersection_score = 0.0
    if any(attributes.get(f"crash_type_{i}", False) for i in range(40, 51)):
        base = attributes.get("intersection_severity", 5.0)
        mult = 1.0
        mult *= RISK_FACTORS["pedestrian_crossing"].get(attributes.get("pedestrian_crossing", 2), 1.0)
        mult *= RISK_FACTORS["intersecting_bicycle_facility"].get(attributes.get("intersecting_bicycle_facility", 2), 1.0)
        mult *= RISK_FACTORS["street_lighting"].get(attributes.get("street_lighting", 1), 1.0)
        mult *= RISK_FACTORS["peak_pedestrian_flow"].get(attributes.get("peak_pedestrian_flow", 1), 1.0)
        
        intersection_score = base * mult / 3
    
    bu26 += intersection_score
    
    return bu26


def categorize_score(score: float, thresholds: Dict[str, Tuple[float, float]]) -> str:
    """
    Categorize a numeric score into Low/Medium/High/Extreme
    
    Args:
        score: Numeric score to categorize
        thresholds: Dict with category names and (min, max) tuples
    
    Returns:
        Risk category as string
    """
    if score <= thresholds["Low"][1]:
        return "Low"
    elif score <= thresholds["Medium"][1]:
        return "Medium"
    elif score <= thresholds["High"][1]:
        return "High"
    else:
        return "Extreme"


def calculate_cyclerap_score(attributes: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate the complete CycleRAP score based on input attributes.
    
    Args:
        attributes: Dictionary containing all coded attribute values.
                   Expected keys include:
                   
                   Speed/Volume factors:
                   - bicycle_lv_speed_avg: 1 or 2 (< 20km/h or =/> 20km/h)
                   - bicycle_lv_speed_diff: 1 or 2 (< 10km/h or =/> 10km/h)
                   - peak_bicycle_lv_flow: 1 or 2 (Low or Moderate to high)
                   - heavy_vehicle_flow: 1 or 2 (Low/restricted access or Moderate to high)
                   - peak_pedestrian_flow: 1, 2, or 3 (None, Low, or Moderate to high)
                   - cargo_bikes_proportion: 1 or 2 (Low or Moderate to high)
                   
                   Facility characteristics:
                   - facility_width: 1, 2, or 3 (Very Narrow, Narrow, Wide)
                   - flow_direction: 1 or 2 (One way, Two way)
                   - grade: 1 or 2 (< 5 degrees, =/> 5 degrees)
                   - curvature: 1 or 2 (Sharp turn Present, No sharp turn present)
                   - delineation: 1 or 2 (Present, Not present)
                   - width_restriction: 1 or 2 (Present, Not present)
                   - light_segregation: 1 or 2 (Present, Not present)
                   - loose_slippery_surface: 1 or 2 (Present, Not present)
                   - tram_train_rails: 1 or 2 (Present, Not present)
                   
                   Adjacent hazards 0-1m:
                   - adj_vehicle_parking_0_1m: 1 or 2 (Present, Not present)
                   - adj_severe_hazard_0_1m: 1 or 2 (Present, Not present)
                   
                   Adjacent hazards 1-3m:
                   - adj_road_lane_1_3m: 1 or 2 (Present, Not present)
                   - adj_vehicle_parking_1_3m: 1 or 2 (Present, Not present)
                   - adj_severe_hazard_1_3m: 1 or 2 (Present, Not present)
                   
                   Intersection features:
                   - pedestrian_crossing: 1 or 2 (Present, Not present)
                   - intersecting_bicycle_facility: 1 or 2 (Present, Not present)
                   - street_lighting: 1 or 2 (Present, Not present)
                   - intersection_road_crossing: 1 or 2 (Present, Not present)
                   - crossing_facility: 1 or 2 (Present/NA, Not present)
                   - num_lanes_adjacent_road: 1 or 2 (1 per direction/NA, > 1 per direction)
                   - num_lanes_intersecting_road: 1 or 2 (1 per direction, > 1 per direction)
                   - property_access: 1 or 2 (Present, Not present)
                   
                   Base severities (calculated from other attributes in full model):
                   - base_collision_severity: Base severity value (default 5.0)
                   - base_severity_o: Additional severity component
                   - intersection_severity: Intersection-specific severity
                   
                   Crash type flags:
                   - crash_type_X: Boolean flags for different crash types
    
    Returns:
        Dictionary containing:
        - numeric_score: Total numeric risk score (BR3)
        - risk_category: Overall risk category (BR4)
        - components: Individual component scores
        - component_categories: Categories for each component
    """
    
    # Calculate the 4 component scores
    bu3 = calculate_component_bu3(attributes)
    bu8 = calculate_component_bu8(attributes)
    bu16 = calculate_component_bu16(attributes)
    bu26 = calculate_component_bu26(attributes)
    
    # Calculate total numeric score (BR3)
    numeric_score = bu3 + bu8 + bu16 + bu26
    
    # Categorize each component (BU4, BU9, BU17, BU27)
    # Different thresholds for different components
    cat_bu4 = categorize_score(bu3, {
        "Low": (0, 5),
        "Medium": (5, 10),
        "High": (10, 20),
        "Extreme": (20, float('inf'))
    })
    
    cat_bu9 = categorize_score(bu8, {
        "Low": (0, 5),
        "Medium": (5, 10),
        "High": (10, 20),
        "Extreme": (20, float('inf'))
    })
    
    cat_bu17 = categorize_score(bu16, {
        "Low": (0, 5),
        "Medium": (5, 10),
        "High": (10, 20),
        "Extreme": (20, float('inf'))
    })
    
    cat_bu27 = categorize_score(bu26, {
        "Low": (0, 10),
        "Medium": (10, 25),
        "High": (25, 60),
        "Extreme": (60, float('inf'))
    })
    
    # Overall risk category (BR4) = highest category among the 4 components
    category_order = ["Low", "Medium", "High", "Extreme"]
    all_categories = [cat_bu4, cat_bu9, cat_bu17, cat_bu27]
    
    # Find the highest category
    risk_category = max(all_categories, key=lambda x: category_order.index(x))
    
    return {
        "numeric_score": round(numeric_score, 2),
        "risk_category": risk_category,
        "components": {
            "BU3_collision_speed": round(bu3, 2),
            "BU8_crash_type_1": round(bu8, 2),
            "BU16_crash_type_2": round(bu16, 2),
            "BU26_crash_type_3": round(bu26, 2)
        },
        "component_categories": {
            "BU4": cat_bu4,
            "BU9": cat_bu9,
            "BU17": cat_bu17,
            "BU27": cat_bu27
        }
    }


# Example usage
if __name__ == "__main__":
    # Example attribute dictionary with corrected names from screenshots
    example_attributes = {
        # Speed and volume factors
        "bicycle_lv_speed_avg": 2,  # =/> 20km/h (risk factor: 1.5)
        "bicycle_lv_speed_diff": 2,  # =/> 10km/h (risk factor: 1.2)
        "peak_bicycle_lv_flow": 2,  # Moderate to high (risk factor: 1.2)
        "heavy_vehicle_flow": 2,  # Moderate to high (risk factor: 1.2)
        "peak_pedestrian_flow": 2,  # Low (risk factor: 1.2)
        
        # Facility characteristics
        "facility_width": 2,  # Narrow (risk factor: 1.5)
        "flow_direction": 2,  # Two way (risk factor: 1.5)
        "grade": 1,  # < 5 degrees (risk factor: 1.0)
        "curvature": 2,  # No sharp turn (risk factor: 1.0)
        "delineation": 2,  # Not present (risk factor: 1.2)
        "width_restriction": 1,  # Present (risk factor: 1.2)
        "light_segregation": 2,  # Not present (risk factor: 1.0)
        
        # Adjacent hazards 0-1m
        "adj_vehicle_parking_0_1m": 1,  # Present (risk factor: 1.5)
        "adj_severe_hazard_0_1m": 1,  # Present (risk factor: 1.8)
        
        # Adjacent hazards 1-3m
        "adj_road_lane_1_3m": 1,  # Present (risk factor: 0.8)
        "adj_vehicle_parking_1_3m": 1,  # Present (risk factor: 1.2)
        "adj_severe_hazard_1_3m": 1,  # Present (risk factor: 1.5)
        
        # Intersection features
        "pedestrian_crossing": 1,  # Present (risk factor: 1.2)
        "intersecting_bicycle_facility": 1,  # Present (risk factor: 1.2)
        "street_lighting": 1,  # Present (risk factor: 1.0)
        "intersection_road_crossing": 1,  # Present (risk factor: 1.2)
        "crossing_facility": 1,  # Present/NA (risk factor: 1.0)
        "num_lanes_adjacent_road": 2,  # > 1 per direction (risk factor: 1.2)
        "num_lanes_intersecting_road": 2,  # > 1 per direction (risk factor: 1.2)
        "property_access": 1,  # Present (risk factor: 1.2)
        
        # Surface conditions
        "loose_slippery_surface": 1,  # Present (risk factor: 1.5)
        "tram_train_rails": 1,  # Present (risk factor: 1.5)
        
        # Other
        "cargo_bikes_proportion": 2,  # Moderate to high (risk factor: 1.2)
        
        # Base severities (these would be calculated from other attributes in full model)
        "base_collision_severity": 5.0,
        "base_severity_o": 2.0,
        "intersection_severity": 5.0,
        
        # Crash type flags (example - some enabled)
        "crash_type_f": True,
        "crash_type_16": True,
        "crash_type_26": True,
        "crash_type_40": True,
    }
    
    result = calculate_cyclerap_score(example_attributes)
    
    print("CycleRAP Risk Assessment Results")
    print("=" * 50)
    print(f"Numeric Score (BR3): {result['numeric_score']}")
    print(f"Risk Category (BR4): {result['risk_category']}")
    print("\nComponent Scores:")
    for component, score in result['components'].items():
        category_key = component.split('_')[0]
        if category_key in result['component_categories']:
            category = result['component_categories'][category_key]
            print(f"  {component}: {score} ({category})")