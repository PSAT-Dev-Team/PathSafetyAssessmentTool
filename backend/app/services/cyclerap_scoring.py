"""
Native Python implementation of cycleRAP scoring algorithm (CycleRAP v2.13).

Updated 2026-06-03 to match the supplier reference workbook
`CycleRAP - model - generation v2.13 - to suppliers.xlsm`. See
`docs/cyclerap_v213_audit.md` for the structural diff.

No Windows, Excel, or VBA macros required - pure Python implementation.
"""

import pandas as pd
import numpy as np
from app.services.serializer import Attributes


# ============ RISK FACTOR LOOKUP TABLES (from Excel v2.11) ============
LOOKUP_TABLES = {
    'facility_access': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 1}},
    'loose_surface': {1: {'risk': 1.5, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'tram_rails': {1: {'risk': 1.5, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'surface_deformation': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'fixed_obstacle': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'non_fixed_obstacle': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'delineation': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}},
    # Line of Sight (v2.13): severity multiplier in CM3 + CM40 only.
    # Inadequate visibility = 1.2x risk; NOT a conditional trigger (cond=0).
    'line_of_sight': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}},
    'facility_width': {1: {'risk': 1.8, 'cond': 0}, 2: {'risk': 1.5, 'cond': 0}, 3: {'risk': 1.0, 'cond': 0}},
    'flow_direction': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.5, 'cond': 0}},
    'width_restriction': {1: {'risk': 1.2, 'cond': 0}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_road_0_1m': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_parking_0_1m': {1: {'risk': 1.5, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_hazard_0_1m': {1: {'risk': 1.8, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_object_0_1m': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_sidewalk_0_1m': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_road_1_3m': {1: {'risk': 0.8, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_parking_1_3m': {1: {'risk': 1.2, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_hazard_1_3m': {1: {'risk': 1.5, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_object_1_3m': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'adjacent_sidewalk_1_3m': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'grade': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 1}},
    'curvature': {1: {'risk': 1.5, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'street_lighting': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}},
    'pedestrian_crossing': {1: {'risk': 1.2, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'intersecting_facility': {1: {'risk': 1.2, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'intersection_approach': {1: {'risk': 1.0, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'intersection_crossing': {1: {'risk': 1.2, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'crossing_facility': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 1}},
    'num_lanes_adjacent': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}},
    'num_lanes_intersecting': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}},
    'property_access': {1: {'risk': 1.2, 'cond': 1}, 2: {'risk': 1.0, 'cond': 0}},
    'pedestrian_flow': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 1}, 3: {'risk': 1.5, 'cond': 1}},
    'bicycle_flow': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}, 3: {'risk': 1.5, 'cond': 0}},
    'cargo_bikes': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}},
    'bicycle_speed': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.5, 'cond': 0}},
    'speed_differential': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}},
    'heavy_vehicle': {1: {'risk': 1.0, 'cond': 0}, 2: {'risk': 1.2, 'cond': 0}},
    'light_segregation': {1: {'risk': 0.8, 'cond': 0}, 2: {'risk': 1.0, 'cond': 1}},
    'facility_type': {
        # v2.13: vb_sev applies in CH severity chains (CH32, CH45);
        # vb_cf is the *likelihood* factor used in CM40 product chain (CU54).
        1: {'risk': 1.0, 'cond': 0, 'bp_cond': 1, 'vb_cond': 0, 'vb_sev': 0.8, 'vb_cf': 1.0},
        2: {'risk': 1.0, 'cond': 0, 'bp_cond': 1, 'vb_cond': 0, 'vb_sev': 0.8, 'vb_cf': 1.0},
        3: {'risk': 1.0, 'cond': 0, 'bp_cond': 0, 'vb_cond': 0, 'vb_sev': 0.8, 'vb_cf': 1.0},
        4: {'risk': 1.0, 'cond': 0, 'bp_cond': 0, 'vb_cond': 0, 'vb_sev': 1.0, 'vb_cf': 1.0},
        5: {'risk': 1.0, 'cond': 0, 'bp_cond': 0, 'vb_cond': 0, 'vb_sev': 1.0, 'vb_cf': 1.0},
        6: {'risk': 1.0, 'cond': 1, 'bp_cond': 0, 'vb_cond': 1, 'vb_sev': 1.0, 'vb_cf': 1.2},
    }
}

# ============ BACKEND FIELD NAME CONSTANTS ============
# Use field names directly from Attributes.Fields for consistency
FACILITY_TYPE = Attributes.Fields.FACILITY_TYPE_STR
FACILITY_ACCESS = Attributes.Fields.FACILITY_ACCESS_STR
LOOSE_SURFACE = Attributes.Fields.LOOSE_SLIPPERY_SURFACE_STR
TRAM_RAILS = Attributes.Fields.TRAM_TRAIN_RAIL_STR
SURFACE_DEFORMATION = Attributes.Fields.DEFORMATION_DRAIN_STR
FIXED_OBSTACLE = Attributes.Fields.FIXED_OBSTACLE_STR
NON_FIXED_OBSTACLE = Attributes.Fields.NON_FIXED_OBSTACLE_STR
DELINEATION = Attributes.Fields.DELINEATION_STR
LIGHT_SEGREGATION = Attributes.Fields.LIGHT_SEGREGATION_STR
FACILITY_WIDTH = Attributes.Fields.FACILITY_WIDTH_STR
FLOW_DIRECTION = Attributes.Fields.FLOW_DIR_STR
WIDTH_RESTRICTION = Attributes.Fields.WIDTH_RESTRICTION_STR
ADJACENT_ROAD_0_1M = Attributes.Fields.ADJ_ROAD_LANE_01M_STR
ADJACENT_PARKING_0_1M = Attributes.Fields.ADJ_VHCL_PARKING_01M_STR
ADJACENT_HAZARD_0_1M = Attributes.Fields.ADJ_SVR_PARKING_01M_STR
ADJACENT_OBJECT_0_1M = Attributes.Fields.ADJ_OBJ_LVL_CHGE_01M_STR
ADJACENT_SIDEWALK_0_1M = Attributes.Fields.ADJ_SIDEWALK_01M_STR
ADJACENT_ROAD_1_3M = Attributes.Fields.ADJ_ROAD_LANE_13M_STR
ADJACENT_PARKING_1_3M = Attributes.Fields.ADJ_VHCL_PARKING_13M_STR
ADJACENT_HAZARD_1_3M = Attributes.Fields.ADJ_SVR_HAZARD_13M_STR
ADJACENT_OBJECT_1_3M = Attributes.Fields.ADJ_OBJ_LVL_CHGE_13M_STR
ADJACENT_SIDEWALK_1_3M = Attributes.Fields.ADJ_SIDEWALK_13M_STR
GRADE = Attributes.Fields.GRADE_STR
CURVATURE = Attributes.Fields.CURV_STR
STREET_LIGHTING = Attributes.Fields.STREET_LIGHT_STR
PEDESTRIAN_CROSSING = Attributes.Fields.PED_CROSS_STR
INTERSECTING_FACILITY = Attributes.Fields.INTERSECT_FACILITY_STR
INTERSECTION_APPROACH = Attributes.Fields.INTERSECT_APPRCH_STR
INTERSECTION_CROSSING = Attributes.Fields.INTERSECT_ROAD_CROSS_STR
CROSSING_FACILITY = Attributes.Fields.CROSS_FACILITY_STR
NUM_LANES_ADJACENT = Attributes.Fields.NOL_ADJ_ROAD_STR
NUM_LANES_INTERSECTING = Attributes.Fields.NOL_INTERSECT_ROAD_STR
PROPERTY_ACCESS = Attributes.Fields.PROP_ACCESS_STR
PEDESTRIAN_FLOW = Attributes.Fields.PEAK_PED_FLOW_STR
BICYCLE_FLOW = Attributes.Fields.PEAK_BICYCLE_TRAFFIC_FLOW_STR
CARGO_BIKES = Attributes.Fields.OBSERVED_PROPORTION_STR
BICYCLE_SPEED = Attributes.Fields.BICYCLE_SPD_AVG_STR
SPEED_DIFFERENTIAL = Attributes.Fields.BICYCLE_SPD_DIFF_STR
ROAD_AADT = Attributes.Fields.ROAD_AADT_STR
HEAVY_VEHICLE = Attributes.Fields.HEAVY_VHCL_FLOW_STR
ROAD_SPEED = Attributes.Fields.ROAD_OPR_SPEED_AVG_STR
SPEED_UNIT = Attributes.Fields.SPEED_UNIT_STR
LINE_OF_SIGHT = Attributes.Fields.LINE_OF_SIGHT_STR


BASELINE_VALUES = {
    FACILITY_TYPE: 3,
    FACILITY_ACCESS: 1,
    LOOSE_SURFACE: 2,
    TRAM_RAILS: 2,
    SURFACE_DEFORMATION: 2,
    FIXED_OBSTACLE: 2,
    NON_FIXED_OBSTACLE: 2,
    DELINEATION: 1,
    LIGHT_SEGREGATION: 1,
    FACILITY_WIDTH: 3,
    FLOW_DIRECTION: 1,
    WIDTH_RESTRICTION: 2,
    ADJACENT_ROAD_0_1M: 2,
    ADJACENT_PARKING_0_1M: 2,
    ADJACENT_HAZARD_0_1M: 2,
    ADJACENT_OBJECT_0_1M: 2,
    ADJACENT_SIDEWALK_0_1M: 2,
    ADJACENT_ROAD_1_3M: 2,
    ADJACENT_PARKING_1_3M: 2,
    ADJACENT_HAZARD_1_3M: 2,
    ADJACENT_OBJECT_1_3M: 2,
    ADJACENT_SIDEWALK_1_3M: 2,
    GRADE: 1,
    CURVATURE: 2,
    STREET_LIGHTING: 1,
    PEDESTRIAN_CROSSING: 2,
    INTERSECTING_FACILITY: 2,
    INTERSECTION_APPROACH: 2,
    INTERSECTION_CROSSING: 2,
    CROSSING_FACILITY: 1,
    NUM_LANES_ADJACENT: 1,
    NUM_LANES_INTERSECTING: 1,
    PROPERTY_ACCESS: 2,
    PEDESTRIAN_FLOW: 1,
    BICYCLE_FLOW: 1,
    CARGO_BIKES: 1,
    BICYCLE_SPEED: 1,
    SPEED_DIFFERENTIAL: 1,
    HEAVY_VEHICLE: 1,
    ROAD_AADT: 0,
    ROAD_SPEED: 1,
    LINE_OF_SIGHT: 1,
}


def get_risk(attr_key: str, value: int) -> float:
    """Get risk factor from lookup table"""
    return LOOKUP_TABLES.get(attr_key, {}).get(value, {}).get('risk', 1.0)


def get_cond(attr_key: str, value: int) -> int:
    """Get condition flag from lookup table"""
    return LOOKUP_TABLES.get(attr_key, {}).get(value, {}).get('cond', 0)


# ============ AADT LOOKUP TABLE ============
AADT_LOOKUP_TABLE = [
    {'threshold': 0, 'risk': 0.25},
    {'threshold': 100, 'risk': 0.25},
    {'threshold': 500, 'risk': 0.50},
    {'threshold': 1500, 'risk': 0.75},
    {'threshold': 2500, 'risk': 1.00},
    {'threshold': 5000, 'risk': 1.07},
    {'threshold': 7500, 'risk': 1.1449},
    {'threshold': 10000, 'risk': 1.225043},
    {'threshold': 12500, 'risk': 1.31079601},
    {'threshold': 15000, 'risk': 1.402551731},
    {'threshold': 17500, 'risk': 1.500730352},
    {'threshold': 20000, 'risk': 1.605781476},
    {'threshold': 22500, 'risk': 1.71818618},
    {'threshold': 25000, 'risk': 1.838459212},
    {'threshold': 30000, 'risk': 1.967151357},
    {'threshold': 35000, 'risk': 2.104851952},
    {'threshold': 40000, 'risk': 2.252191589},
]


def get_aadt_risk_factor(aadt: float) -> float:
    """Calculate AADT risk factor from lookup table"""
    result = AADT_LOOKUP_TABLE[0]['risk']
    for entry in AADT_LOOKUP_TABLE:
        if aadt >= entry['threshold']:
            result = entry['risk']
        else:
            break
    return result


MPH_TO_KMH = 1.609344


def get_road_speed_risk_factor(speed: float, unit: int = 1) -> float:
    """Road-speed risk factor — CycleRAP v2.13 sigmoid.

    Matches the `Speed risk factors` sheet formula:
        1 + 27.82 / (1 + EXP(7.44925 - 0.13322 * speed_kmh))

    `unit` follows the Attributes.Fields.SPEED_UNIT_STR mapping
    (`{'km/h': 1, 'mph': 2}` from serializer.operating_speed_unit_mapping).
    mph values are converted to km/h before the sigmoid is applied so the
    formula always sees km/h, matching v2.13's internal convention.
    Locally we always supply km/h (unit=1), but mph (unit=2) is honoured
    for parity with the upstream model.
    """
    if speed is None or speed <= 0:
        return 1.0
    speed_kmh = float(speed) * MPH_TO_KMH if unit == 2 else float(speed)
    if speed_kmh <= 0:
        return 1.0
    return 1 + 27.82 / (1 + np.exp(7.44925 - 0.13322 * speed_kmh))


# ============ CM FORMULA IMPLEMENTATIONS ============
def calculate_cm3(row: pd.Series) -> float:
    """Calculate CM3 component (main cycling environment risk)"""
    cu_factors = [
        get_risk('loose_surface', row.get(LOOSE_SURFACE, 2)),
        # v2.13: Line of Sight is a severity multiplier here (CU4), not a conditional
        get_risk('line_of_sight', row.get(LINE_OF_SIGHT, 1)),
        get_risk('delineation', row.get(DELINEATION, 2)),
        get_risk('facility_width', row.get(FACILITY_WIDTH, 3)),
        get_risk('flow_direction', row.get(FLOW_DIRECTION, 1)),
        get_risk('width_restriction', row.get(WIDTH_RESTRICTION, 2)),
        get_risk('grade', row.get(GRADE, 1)),
        get_risk('cargo_bikes', row.get(CARGO_BIKES, 1)),
        get_risk('pedestrian_flow', row.get(PEDESTRIAN_FLOW, 1)),
        get_risk('bicycle_flow', row.get(BICYCLE_FLOW, 1)),
        get_risk('speed_differential', row.get(SPEED_DIFFERENTIAL, 1)),
        get_risk('curvature', row.get(CURVATURE, 2)),
        get_risk('street_lighting', row.get(STREET_LIGHTING, 1)),
    ]

    cq_triggers = [
        get_cond('surface_deformation', row.get(SURFACE_DEFORMATION, 2)),
        get_cond('fixed_obstacle', row.get(FIXED_OBSTACLE, 2)),
        get_cond('non_fixed_obstacle', row.get(NON_FIXED_OBSTACLE, 2)),
        get_cond('adjacent_parking_0_1m', row.get(ADJACENT_PARKING_0_1M, 2)),
        get_cond('intersection_crossing', row.get(INTERSECTION_CROSSING, 2)),
        get_cond('property_access', row.get(PROPERTY_ACCESS, 2)),
        get_cond('intersecting_facility', row.get(INTERSECTING_FACILITY, 2)),
        get_cond('pedestrian_crossing', row.get(PEDESTRIAN_CROSSING, 2)),
    ]

    cu_product = np.prod(cu_factors)
    cq_sum = sum(cq_triggers)
    return cu_product ** (1 + cq_sum * 0.1)


def calculate_cm16(row: pd.Series) -> float:
    """Calculate CM16 component (departure and fall scenarios)"""
    cq16_triggers = [
        get_cond('loose_surface', row.get(LOOSE_SURFACE, 2)),
        get_cond('grade', row.get(GRADE, 1)),
        get_cond('curvature', row.get(CURVATURE, 2)),
    ]
    cq_sum = sum(cq16_triggers)
    if cq_sum == 0:
        return 0

    cu16_factors = [
        get_risk('intersection_crossing', row.get(INTERSECTION_CROSSING, 2)),
        # v2.13: Line of Sight is a severity multiplier here (CU18), not a conditional
        get_risk('line_of_sight', row.get(LINE_OF_SIGHT, 1)),
        get_risk('property_access', row.get(PROPERTY_ACCESS, 2)),
        get_risk('intersecting_facility', row.get(INTERSECTING_FACILITY, 2)),
        get_risk('pedestrian_crossing', row.get(PEDESTRIAN_CROSSING, 2)),
        get_risk('facility_width', row.get(FACILITY_WIDTH, 3)),
        get_risk('flow_direction', row.get(FLOW_DIRECTION, 1)),
        get_risk('bicycle_speed', row.get(BICYCLE_SPEED, 1)),
        get_risk('width_restriction', row.get(WIDTH_RESTRICTION, 2)),
    ]
    cu16_product = np.prod(cu16_factors)
    return cu16_product ** (1 + cq_sum * 0.1)


def calculate_cm25(row: pd.Series) -> float:
    """Calculate CM25 component (speed-related incidents)"""
    cq25_triggers = [
        get_cond('tram_rails', row.get(TRAM_RAILS, 2)),
        get_cond('surface_deformation', row.get(SURFACE_DEFORMATION, 2)),
    ]
    cq_sum = sum(cq25_triggers)
    if cq_sum == 0:
        return 0

    cu25_factors = [
        get_risk('street_lighting', row.get(STREET_LIGHTING, 1)),
        get_risk('bicycle_speed', row.get(BICYCLE_SPEED, 1)),
        get_risk('grade', row.get(GRADE, 1)),
        get_risk('facility_width', row.get(FACILITY_WIDTH, 3)),
        get_risk('flow_direction', row.get(FLOW_DIRECTION, 1)),
        get_risk('tram_rails', row.get(TRAM_RAILS, 2)),
    ]
    cu25_product = np.prod(cu25_factors)
    return cu25_product ** (1 + cq_sum * 0.1)


def calculate_cm40(row: pd.Series) -> float:
    """Calculate CM40 component (vehicle interaction)"""
    facility_vb_cond = LOOKUP_TABLES['facility_type'].get(row.get(FACILITY_TYPE, 1), {}).get('vb_cond', 0)

    cq40_triggers = [
        get_cond('intersection_crossing', row.get(INTERSECTION_CROSSING, 2)),
        get_cond('property_access', row.get(PROPERTY_ACCESS, 2)),
        get_cond('adjacent_road_0_1m', row.get(ADJACENT_ROAD_0_1M, 2)),
        get_cond('adjacent_road_1_3m', row.get(ADJACENT_ROAD_1_3M, 2)),
        facility_vb_cond,
        get_cond('intersection_approach', row.get(INTERSECTION_APPROACH, 2)),
    ]
    cq_sum = sum(cq40_triggers)
    if cq_sum == 0:
        return 0

    # v2.13: CU54 uses vb_cf (col DT), not vb_sev (col DS).
    # vb_sev is consumed only in the CH severity chains (BX26/32/40/45/49 below).
    facility_vb_cf = LOOKUP_TABLES['facility_type'].get(row.get(FACILITY_TYPE, 1), {}).get('vb_cf', 1.0)

    cu40_factors = [
        get_risk('crossing_facility', row.get(CROSSING_FACILITY, 1)),
        # v2.13: Line of Sight is a severity multiplier here (CU43), not a conditional
        get_risk('line_of_sight', row.get(LINE_OF_SIGHT, 1)),
        get_risk('flow_direction', row.get(FLOW_DIRECTION, 1)),
        get_risk('adjacent_parking_0_1m', row.get(ADJACENT_PARKING_0_1M, 2)),
        get_risk('adjacent_parking_1_3m', row.get(ADJACENT_PARKING_1_3M, 2)),
        get_risk('street_lighting', row.get(STREET_LIGHTING, 1)),
        get_risk('num_lanes_adjacent', row.get(NUM_LANES_ADJACENT, 1)),
        get_risk('num_lanes_intersecting', row.get(NUM_LANES_INTERSECTING, 1)),
        get_aadt_risk_factor(float(row.get(ROAD_AADT) if row.get(ROAD_AADT) is not None else 5000)),
        get_risk('heavy_vehicle', row.get(HEAVY_VEHICLE, 1)),
        get_risk('delineation', row.get(DELINEATION, 2)),
        get_risk('light_segregation', row.get(LIGHT_SEGREGATION, 2)),
        facility_vb_cf,
    ]
    cu40_product = np.prod(cu40_factors)
    return cu40_product ** (1 + cq_sum * 0.1)

# ============ SCORE CALCULATION ============
def calculate_cyclerap_score(row: pd.Series, cm3: float, cm16: float, cm25: float, cm40: float) -> tuple:
    """
    Calculate all risk components from CycleRAP algorithm.

    Returns tuple: (BB, BP, SB, VB, total)
    """
    # CJ values (likelihood bases)
    cj3 = cm3 + cm16
    cj25 = cm25
    cj40 = cm40

    # === BB SCORE (Bicyclist-Bicyclist) ===
    bb_severity = [
        get_risk('bicycle_speed', row.get(BICYCLE_SPEED, 1)),
        get_risk('grade', row.get(GRADE, 1)),
        get_risk('speed_differential', row.get(SPEED_DIFFERENTIAL, 1)),
        get_risk('cargo_bikes', row.get(CARGO_BIKES, 1)),
    ]
    bb_sev_product = np.prod(bb_severity)
    cd3 = cj3 * bb_sev_product
    bb = cd3

    # === BP SCORE (Bicyclist-Pedestrian) ===
    bp_sidewalk_cond = (
        get_cond('adjacent_sidewalk_0_1m', row.get(ADJACENT_SIDEWALK_0_1M, 2)) +
        get_cond('adjacent_sidewalk_1_3m', row.get(ADJACENT_SIDEWALK_1_3M, 2))
    )
    bx8 = cd3 if bp_sidewalk_cond > 0 else 0

    facility_type = row.get(FACILITY_TYPE, 1)
    bp_ped_cond = (
        get_cond('pedestrian_flow', row.get(PEDESTRIAN_FLOW, 1)) +
        LOOKUP_TABLES['facility_type'].get(facility_type, {}).get('bp_cond', 0) +
        get_cond('facility_access', row.get(FACILITY_ACCESS, 1))
    )
    bx11 = cd3 if bp_ped_cond > 0 else 0
    bp = bx8 + bx11

    # === SB SCORE (Bicyclist-Severe Hazard) ===
    sb_severity = [
        get_risk('bicycle_speed', row.get(BICYCLE_SPEED, 1)),
        get_risk('grade', row.get(GRADE, 1)),
        get_risk('adjacent_hazard_0_1m', row.get(ADJACENT_HAZARD_0_1M, 2)),
        get_risk('adjacent_hazard_1_3m', row.get(ADJACENT_HAZARD_1_3M, 2)),
    ]
    sb_sev_product = np.prod(sb_severity)

    sb_departure_cond = (
        get_cond('adjacent_object_0_1m', row.get(ADJACENT_OBJECT_0_1M, 2)) +
        get_cond('adjacent_object_1_3m', row.get(ADJACENT_OBJECT_1_3M, 2)) +
        get_cond('adjacent_hazard_0_1m', row.get(ADJACENT_HAZARD_0_1M, 2)) +
        get_cond('adjacent_hazard_1_3m', row.get(ADJACENT_HAZARD_1_3M, 2)) +
        get_cond('adjacent_parking_0_1m', row.get(ADJACENT_PARKING_0_1M, 2)) +
        get_cond('adjacent_parking_1_3m', row.get(ADJACENT_PARKING_1_3M, 2))
    )
    cd16 = cj3 * sb_sev_product
    bx16 = cd16 if sb_departure_cond > 0 else 0

    sb_fall_severity = [
        get_risk('bicycle_speed', row.get(BICYCLE_SPEED, 1)),
        get_risk('grade', row.get(GRADE, 1)),
    ]
    cd23 = (cj3 + cj25) * np.prod(sb_fall_severity)
    bx23 = cd23

    sb = bx16 + bx23

    # === VB SCORE (Vehicle-Bicyclist) ===
    # NB: must treat 0 as a real value (sigmoid maps speed=0 → 1.0); only fall back when None/blank
    raw_speed = row.get(ROAD_SPEED, 50)
    raw_aadt = row.get(ROAD_AADT, 5000)
    raw_unit = row.get(SPEED_UNIT, 1)
    speed_unit = int(raw_unit) if raw_unit is not None else 1
    speed_risk = get_road_speed_risk_factor(
        float(raw_speed if raw_speed is not None else 50), unit=speed_unit,
    )
    aadt_risk = get_aadt_risk_factor(float(raw_aadt if raw_aadt is not None else 5000))
    facility_vb_sev = LOOKUP_TABLES['facility_type'].get(facility_type, {}).get('vb_sev', 1.0)
    facility_vb_cond = LOOKUP_TABLES['facility_type'].get(facility_type, {}).get('vb_cond', 0)

    # CH26:CH28 severity factors
    ch26_28_product = aadt_risk * speed_risk * get_risk('heavy_vehicle', row.get(HEAVY_VEHICLE, 1))

    # CH26:CH30 severity factors
    ch26_30_product = ch26_28_product * get_risk('adjacent_road_1_3m', row.get(ADJACENT_ROAD_1_3M, 2)) * facility_vb_sev

    # CH40:CH43 severity factors
    ch40_43_product = speed_risk * get_risk('heavy_vehicle', row.get(HEAVY_VEHICLE, 1)) * \
                      get_risk('adjacent_road_1_3m', row.get(ADJACENT_ROAD_1_3M, 2)) * facility_vb_sev

    # BX26: Fall/conflict with vehicle exposure
    cb26_29_sum = (
        get_cond('adjacent_road_0_1m', row.get(ADJACENT_ROAD_0_1M, 2)) +
        get_cond('intersection_crossing', row.get(INTERSECTION_CROSSING, 2)) +
        facility_vb_cond +
        get_cond('intersection_approach', row.get(INTERSECTION_APPROACH, 2))
    )
    cd26 = (cj3 + cj25) * ch26_28_product
    bx26 = cd26 if cb26_29_sum > 0 else 0

    # BX32: Departure from facility toward road
    cb32_36_sum = (
        get_cond('intersection_approach', row.get(INTERSECTION_APPROACH, 2)) +
        get_cond('adjacent_road_0_1m', row.get(ADJACENT_ROAD_0_1M, 2)) +
        get_cond('adjacent_road_1_3m', row.get(ADJACENT_ROAD_1_3M, 2)) +
        facility_vb_cond +
        get_cond('intersection_crossing', row.get(INTERSECTION_CROSSING, 2))
    )
    cd27 = cj3 * ch26_30_product
    bx32 = cd27 if cb32_36_sum > 0 else 0

    # BX40: Share space conflict
    cb40_42_sum = (
        facility_vb_cond +
        get_cond('intersection_approach', row.get(INTERSECTION_APPROACH, 2)) +
        get_cond('facility_access', row.get(FACILITY_ACCESS, 1))
    )
    cd40 = cj40 * ch40_43_product
    bx40 = cd40 / 3 if cb40_42_sum > 0 else 0

    # BX45: Vehicle deviation into facility
    cb45_47_sum = (
        get_cond('adjacent_road_0_1m', row.get(ADJACENT_ROAD_0_1M, 2)) +
        get_cond('adjacent_road_1_3m', row.get(ADJACENT_ROAD_1_3M, 2)) +
        get_cond('light_segregation', row.get(LIGHT_SEGREGATION, 2))
    )
    bx45 = cd40 / 3 if cb45_47_sum > 0 else 0

    # BX49: Intersection conflict with vehicle
    cb49_50_sum = (
        get_cond('intersection_crossing', row.get(INTERSECTION_CROSSING, 2)) +
        get_cond('property_access', row.get(PROPERTY_ACCESS, 2))
    )
    bx49 = cd40 / 3 if cb49_50_sum > 0 else 0

    vb = bx26 + bx32 + bx40 + bx45 + bx49

    # === TOTAL SCORE ===
    total = bb + bp + sb + vb

    return bb, bp, sb, vb, total



def calculate_risk_band_for_type(score: float, crash_type: str = "VB") -> int:
    """
    Convert a risk score to a risk band category (1-4 scale) based on crash type.
    
    Thresholds:
    BB, BP, SB:
    - 1: Low (<5)
    - 2: Medium (5-10)
    - 3: High (10-20)
    - 4: Extreme (>20)
    
    VB (and default):
    - 1: Low (<10)
    - 2: Medium (10-25)
    - 3: High (25-60)
    - 4: Extreme (>60)
    """
    if crash_type in ['BB', 'BP', 'SB']:
        if score < 5:
            return 1
        elif score <= 10:
            return 2
        elif score <= 20:
            return 3
        else:
            return 4
    else:
        # VB and others
        if score < 10:
            return 1
        elif score <= 25:
            return 2
        elif score <= 60:
            return 3
        else:
            return 4


def calculate_top_contributing_attributes(row: pd.Series, base_total_score: float) -> list:
    """
    Calculate the marginal impact (score reduction) of each attribute if set to its safest value.
    Returns the top 5 attributes that contribute most to the score.
    """
    contributions = []
    for attr, safest_val in BASELINE_VALUES.items():
        # Check if attribute exists in row
        current_val = row.get(attr)
        if pd.isna(current_val):
            continue
            
        # Avoid calculating if it is already the safest value
        try:
            if float(current_val) == float(safest_val):
                continue
        except (ValueError, TypeError):
            if current_val == safest_val:
                continue
            
        # Create a modified row
        mod_row = row.copy()
        mod_row[attr] = safest_val
        
        # Recalculate score
        cm3 = calculate_cm3(mod_row)
        cm16 = calculate_cm16(mod_row)
        cm25 = calculate_cm25(mod_row)
        cm40 = calculate_cm40(mod_row)
        _, _, _, _, mod_total_score = calculate_cyclerap_score(mod_row, cm3, cm16, cm25, cm40)
        
        reduction = float(base_total_score - mod_total_score)
        if reduction > 0.001:  # Only consider meaningful reductions
            contributions.append({
                "name": attr,
                "contribution": round(reduction, 4)
            })
            
    # Sort by contribution descending
    contributions.sort(key=lambda x: x["contribution"], reverse=True)
    return contributions[:5]


def calculate_cyclerap_score_native(attributes_df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate cycleRAP scores using accurate v2.11 algorithm.

    Based on CycleRAP Model v2.11 from cyclerap_accurate_v3.jsx.
    Each row in the input DataFrame is scored independently.

    Args:
        attributes_df: DataFrame with 40+ coded attributes

    Returns:
        DataFrame with 10 columns:
        - BB, BB Band, BP, BP Band, SB, SB Band, VB, VB Band
        - Overall Risk Level, Overall Risk Level Band
    """
    results = []

    for idx, row in attributes_df.iterrows():
        # Calculate CM components
        cm3 = calculate_cm3(row)
        cm16 = calculate_cm16(row)
        cm25 = calculate_cm25(row)
        cm40 = calculate_cm40(row)

        # Calculate component scores
        bb_score, bp_score, sb_score, vb_score, total_score = calculate_cyclerap_score(
            row, cm3, cm16, cm25, cm40
        )

        # Calculate risk bands using specific thresholds
        bb_band = calculate_risk_band_for_type(bb_score, 'BB')
        bp_band = calculate_risk_band_for_type(bp_score, 'BP')
        sb_band = calculate_risk_band_for_type(sb_score, 'SB')
        vb_band = calculate_risk_band_for_type(vb_score, 'VB')
        
        # Overall Risk Level Band is now determined by the MAXIMUM band among the components
        # This aligns with the "Highest Risk Category" logic used in the frontend
        total_band = max(bb_band, bp_band, sb_band, vb_band)
        
        # Calculate top contributing attributes
        top_contributors = calculate_top_contributing_attributes(row, total_score)

        result_dict = {
            'BB': round(bb_score, 4),
            'BB Band': bb_band,
            'BP': round(bp_score, 4),
            'BP Band': bp_band,
            'SB': round(sb_score, 4),
            'SB Band': sb_band,
            'VB': round(vb_score, 4),
            'VB Band': vb_band,
            'Overall Risk Level': round(total_score, 4),
            'Overall Risk Level Band': total_band,
        }
        
        # Populate Top 1-5 Contributors
        for i in range(5):
            name_key = f'Top {i+1} Contributor'
            contrib_key = f'Top {i+1} Contribution'
            if i < len(top_contributors):
                result_dict[name_key] = top_contributors[i]["name"]
                result_dict[contrib_key] = top_contributors[i]["contribution"]
            else:
                result_dict[name_key] = None
                result_dict[contrib_key] = None
                
        results.append(result_dict)

    return pd.DataFrame(results)
