"""
CycleRAP Score Calculator

This module calculates cycling path safety scores based on the CycleRAP (Cycling Road Assessment Programme)
methodology as implemented in the Excel model: CycleRAP_v2.11.xlsm

The calculator computes four component scores (BB, BP, SB, VB) and combines them into an overall CycleRAP score
with corresponding risk band categorization (Low/Medium/High/Extreme).

References:
    - CycleRAP Model: CycleRAP_v2.11.xlsm
    - Original implementation: cyclerapmodel.py
    - Risk Results Sheet: Excel columns BB onwards

Author: Path Safety Assessment Tool
Date: 2025-11-03
"""

from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import pandas as pd


class RiskBand(Enum):
    """Risk band categories for CycleRAP scores"""
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    EXTREME = "Extreme"


@dataclass
class ScoreComponents:
    """Container for individual score components"""
    bb_score: float  # Bicycle-Bicycle collision score
    bp_score: float  # Bicycle-Pedestrian collision score
    sb_score: float  # Single-Bicycle crash score
    vb_score: float  # Vehicle-Bicycle collision score

    bb_band: RiskBand
    bp_band: RiskBand
    sb_band: RiskBand
    vb_band: RiskBand


@dataclass
class CycleRAPResult:
    """Complete CycleRAP assessment result"""
    cyclerap_score: float
    cyclerap_band: RiskBand
    components: ScoreComponents

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to dictionary format"""
        return {
            "cyclerap_score": round(self.cyclerap_score, 2),
            "cyclerap_band": self.cyclerap_band.value,
            "bb_score": round(self.components.bb_score, 2),
            "bp_score": round(self.components.bp_score, 2),
            "sb_score": round(self.components.sb_score, 2),
            "vb_score": round(self.components.vb_score, 2),
            "bb_band": self.components.bb_band.value,
            "bp_band": self.components.bp_band.value,
            "sb_band": self.components.sb_band.value,
            "vb_band": self.components.vb_band.value
        }


class CycleRAPScoreCalculator:
    """
    CycleRAP Score Calculator

    Calculates cycling safety risk scores based on road and facility attributes.
    The scoring methodology follows the CycleRAP model which assesses risk across
    four collision/crash types:
    - BB: Bicycle-Bicycle collisions
    - BP: Bicycle-Pedestrian collisions
    - SB: Single-Bicycle crashes (falls, loss of control)
    - VB: Vehicle-Bicycle collisions
    """

    # Risk factor lookup tables
    # These multipliers are applied to base severity scores based on attribute values
    RISK_FACTORS = {
        # Surface conditions
        "loose_slippery_surface": {1: 1.5, 2: 1.0},  # Present=1.5, Not present=1.0

        # Facility characteristics
        "delineation": {1: 1.0, 2: 1.2},  # Present=1.0, Not present=1.2
        "facility_width": {1: 1.8, 2: 1.5, 3: 1.0},  # Very Narrow=1.8, Narrow=1.5, Wide=1.0
        "flow_direction": {1: 1.0, 2: 1.5},  # One way=1.0, Two way=1.5
        "width_restriction": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
        "light_segregation": {1: 0.8, 2: 1.0},  # Present=0.8, Not present=1.0

        # Adjacent hazards 0-1m
        "adj_vehicle_parking_0_1m": {1: 1.5, 2: 1.0},  # Present=1.5, Not present=1.0
        "adj_severe_hazard_0_1m": {1: 1.8, 2: 1.0},  # Present=1.8, Not present=1.0

        # Adjacent hazards 1-3m
        "adj_road_lane_1_3m": {1: 0.8, 2: 1.0},  # Present=0.8, Not present=1.0
        "adj_vehicle_parking_1_3m": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
        "adj_severe_hazard_1_3m": {1: 1.5, 2: 1.0},  # Present=1.5, Not present=1.0

        # Geometric features
        "grade": {1: 1.0, 2: 1.2},  # < 5 degrees=1.0, ≥ 5 degrees=1.2
        "curvature": {1: 1.5, 2: 1.0},  # Sharp turn Present=1.5, No sharp turn=1.0

        # Lighting and visibility
        "street_lighting": {1: 1.0, 2: 1.2},  # Present=1.0, Not present=1.2

        # Intersection features
        "pedestrian_crossing": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
        "intersecting_bicycle_facility": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
        "intersection_road_crossing": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0
        "crossing_facility": {1: 1.0, 2: 1.2},  # Present/NA=1.0, Not present=1.2
        "num_lanes_adjacent_road": {1: 1.0, 2: 1.2},  # 1 per direction/NA=1.0, > 1 per direction=1.2
        "num_lanes_intersecting_road": {1: 1.0, 2: 1.2},  # 1 per direction=1.0, > 1 per direction=1.2
        "property_access": {1: 1.2, 2: 1.0},  # Present=1.2, Not present=1.0

        # Speed and volume attributes
        "bicycle_lv_speed_avg": {1: 1.0, 2: 1.5},  # < 20km/h=1.0, ≥ 20km/h=1.5
        "bicycle_lv_speed_diff": {1: 1.0, 2: 1.2},  # < 10km/h=1.0, ≥ 10km/h=1.2
        "heavy_vehicle_flow": {1: 1.0, 2: 1.2},  # Low/restricted=1.0, Moderate to high=1.2
        "peak_pedestrian_flow": {1: 1.0, 2: 1.2, 3: 1.5},  # None=1.0, Low=1.2, Moderate to high=1.5
        "peak_bicycle_lv_flow": {1: 1.0, 2: 1.2},  # Low=1.0, Moderate to high=1.2
        "cargo_bikes_proportion": {1: 1.0, 2: 1.2},  # Low=1.0, Moderate to high=1.2
    }

    # Risk band thresholds for component scores
    BB_THRESHOLDS = {"Low": (0, 5), "Medium": (5, 10), "High": (10, 20), "Extreme": (20, float('inf'))}
    BP_THRESHOLDS = {"Low": (0, 5), "Medium": (5, 10), "High": (10, 20), "Extreme": (20, float('inf'))}
    SB_THRESHOLDS = {"Low": (0, 5), "Medium": (5, 10), "High": (10, 20), "Extreme": (20, float('inf'))}
    VB_THRESHOLDS = {"Low": (0, 10), "Medium": (10, 25), "High": (25, 60), "Extreme": (60, float('inf'))}

    # Default base severity values
    DEFAULT_BASE_SEVERITY = 5.0
    DEFAULT_INTERSECTION_SEVERITY = 5.0

    def __init__(self, use_default_severities: bool = True):
        """
        Initialize the CycleRAP score calculator.

        Args:
            use_default_severities: If True, use default base severity values.
                                   If False, base severities must be provided in attributes dict.
        """
        self.use_default_severities = use_default_severities

    def calculate_score(self, attributes: Dict[str, Any]) -> CycleRAPResult:
        """
        Calculate the complete CycleRAP score from road/facility attributes.

        Args:
            attributes: Dictionary containing coded attribute values. Keys should match
                       the attribute names in RISK_FACTORS. Expected coded values:
                       - Most attributes: 1 or 2 (Present/Not Present)
                       - facility_width: 1, 2, or 3 (Very Narrow/Narrow/Wide)
                       - peak_pedestrian_flow: 1, 2, or 3 (None/Low/Moderate to high)
                       - Various other attributes as documented in cyclerapmodel.py

        Returns:
            CycleRAPResult containing overall score, risk band, and component details

        Example:
            >>> calculator = CycleRAPScoreCalculator()
            >>> attributes = {
            ...     "bicycle_lv_speed_avg": 2,  # ≥ 20km/h
            ...     "facility_width": 2,         # Narrow
            ...     "flow_direction": 2,         # Two way
            ...     "delineation": 2,            # Not present
            ...     # ... other attributes
            ... }
            >>> result = calculator.calculate_score(attributes)
            >>> print(f"CycleRAP Score: {result.cyclerap_score} ({result.cyclerap_band.value})")
        """
        # Calculate component scores
        bb = self._calculate_bb_score(attributes)
        bp = self._calculate_bp_score(attributes)
        sb = self._calculate_sb_score(attributes)
        vb = self._calculate_vb_score(attributes)

        # Calculate total score
        cyclerap_score = bb + bp + sb + vb

        # Determine risk bands for each component
        bb_band = self._categorize_score(bb, self.BB_THRESHOLDS)
        bp_band = self._categorize_score(bp, self.BP_THRESHOLDS)
        sb_band = self._categorize_score(sb, self.SB_THRESHOLDS)
        vb_band = self._categorize_score(vb, self.VB_THRESHOLDS)

        # Overall risk band is the highest (most severe) among components
        cyclerap_band = self._get_highest_risk_band([bb_band, bp_band, sb_band, vb_band])

        # Package results
        components = ScoreComponents(
            bb_score=bb, bp_score=bp, sb_score=sb, vb_score=vb,
            bb_band=bb_band, bp_band=bp_band, sb_band=sb_band, vb_band=vb_band
        )

        return CycleRAPResult(
            cyclerap_score=cyclerap_score,
            cyclerap_band=cyclerap_band,
            components=components
        )

    def calculate_batch(self, attributes_df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate CycleRAP scores for multiple segments in batch.

        Args:
            attributes_df: DataFrame where each row represents a road segment
                          and columns are attribute names

        Returns:
            DataFrame with original attributes plus score columns:
            BB, BP, SB, VB, CycleRAP score, BB Band, BP Band, SB Band, VB Band, CycleRAP score Band
        """
        results = []

        for idx, row in attributes_df.iterrows():
            attributes = row.to_dict()
            result = self.calculate_score(attributes)
            results.append(result.to_dict())

        results_df = pd.DataFrame(results)
        return pd.concat([attributes_df.reset_index(drop=True), results_df], axis=1)

    def _calculate_bb_score(self, attributes: Dict[str, Any]) -> float:
        """
        Calculate BB (Bicycle-Bicycle collision) score.

        Accounts for conflicts between cyclists due to:
        - Flow direction (one-way vs two-way)
        - Facility width
        - Traffic flow volume
        - Speed differentials
        """
        base = self._get_base_severity(attributes)

        # Apply relevant multipliers
        multiplier = 1.0
        multiplier *= self._get_risk_factor(attributes, "bicycle_lv_speed_avg")
        multiplier *= self._get_risk_factor(attributes, "bicycle_lv_speed_diff")
        multiplier *= self._get_risk_factor(attributes, "peak_bicycle_lv_flow")
        multiplier *= self._get_risk_factor(attributes, "flow_direction")
        multiplier *= self._get_risk_factor(attributes, "facility_width")
        multiplier *= self._get_risk_factor(attributes, "width_restriction")
        multiplier *= self._get_risk_factor(attributes, "cargo_bikes_proportion")

        return base * multiplier

    def _calculate_bp_score(self, attributes: Dict[str, Any]) -> float:
        """
        Calculate BP (Bicycle-Pedestrian collision) score.

        Accounts for conflicts between cyclists and pedestrians due to:
        - Pedestrian flow levels
        - Facility type and width
        - Crossing locations
        """
        base = self._get_base_severity(attributes)

        # Apply relevant multipliers
        multiplier = 1.0
        multiplier *= self._get_risk_factor(attributes, "peak_pedestrian_flow")
        multiplier *= self._get_risk_factor(attributes, "bicycle_lv_speed_avg")
        multiplier *= self._get_risk_factor(attributes, "facility_width")
        multiplier *= self._get_risk_factor(attributes, "pedestrian_crossing")
        multiplier *= self._get_risk_factor(attributes, "delineation")

        return base * multiplier

    def _calculate_sb_score(self, attributes: Dict[str, Any]) -> float:
        """
        Calculate SB (Single-Bicycle crash) score.

        Accounts for single-bicycle crashes (falls, loss of control) due to:
        - Surface conditions
        - Geometric features (grade, curvature)
        - Width restrictions and obstacles
        - Adjacent hazards
        """
        base = self._get_base_severity(attributes)

        # Apply relevant multipliers
        multiplier = 1.0
        multiplier *= self._get_risk_factor(attributes, "loose_slippery_surface")
        multiplier *= self._get_risk_factor(attributes, "grade")
        multiplier *= self._get_risk_factor(attributes, "curvature")
        multiplier *= self._get_risk_factor(attributes, "bicycle_lv_speed_avg")
        multiplier *= self._get_risk_factor(attributes, "facility_width")
        multiplier *= self._get_risk_factor(attributes, "width_restriction")
        multiplier *= self._get_risk_factor(attributes, "adj_severe_hazard_0_1m")
        multiplier *= self._get_risk_factor(attributes, "adj_severe_hazard_1_3m")
        multiplier *= self._get_risk_factor(attributes, "street_lighting")

        return base * multiplier

    def _calculate_vb_score(self, attributes: Dict[str, Any]) -> float:
        """
        Calculate VB (Vehicle-Bicycle collision) score.

        Accounts for collisions between cyclists and motor vehicles due to:
        - Adjacent road lanes and traffic
        - Segregation quality
        - Intersection features
        - Vehicle speeds and volumes
        """
        base = self._get_base_severity(attributes)

        # Apply relevant multipliers
        multiplier = 1.0
        multiplier *= self._get_risk_factor(attributes, "bicycle_lv_speed_avg")
        multiplier *= self._get_risk_factor(attributes, "heavy_vehicle_flow")
        multiplier *= self._get_risk_factor(attributes, "light_segregation")
        multiplier *= self._get_risk_factor(attributes, "adj_vehicle_parking_0_1m")
        multiplier *= self._get_risk_factor(attributes, "adj_vehicle_parking_1_3m")
        multiplier *= self._get_risk_factor(attributes, "adj_road_lane_1_3m")
        multiplier *= self._get_risk_factor(attributes, "intersection_road_crossing")
        multiplier *= self._get_risk_factor(attributes, "crossing_facility")
        multiplier *= self._get_risk_factor(attributes, "num_lanes_adjacent_road")
        multiplier *= self._get_risk_factor(attributes, "num_lanes_intersecting_road")
        multiplier *= self._get_risk_factor(attributes, "property_access")
        multiplier *= self._get_risk_factor(attributes, "street_lighting")

        return base * multiplier

    def _get_risk_factor(self, attributes: Dict[str, Any], attribute_name: str) -> float:
        """
        Get the risk multiplier for a specific attribute.

        Args:
            attributes: Dictionary of attribute values
            attribute_name: Name of the attribute to look up

        Returns:
            Risk multiplier (default 1.0 if attribute not found or not coded)
        """
        if attribute_name not in self.RISK_FACTORS:
            return 1.0

        attribute_value = attributes.get(attribute_name)
        if attribute_value is None:
            return 1.0

        return self.RISK_FACTORS[attribute_name].get(attribute_value, 1.0)

    def _get_base_severity(self, attributes: Dict[str, Any]) -> float:
        """
        Get base severity value for calculation.

        Args:
            attributes: Dictionary of attribute values

        Returns:
            Base severity value (from attributes or default)
        """
        if self.use_default_severities:
            return self.DEFAULT_BASE_SEVERITY

        return attributes.get("base_collision_severity", self.DEFAULT_BASE_SEVERITY)

    def _categorize_score(self, score: float, thresholds: Dict[str, Tuple[float, float]]) -> RiskBand:
        """
        Categorize a numeric score into a risk band.

        Args:
            score: Numeric score to categorize
            thresholds: Dictionary mapping band names to (min, max) tuples

        Returns:
            RiskBand enum value
        """
        if score <= thresholds["Low"][1]:
            return RiskBand.LOW
        elif score <= thresholds["Medium"][1]:
            return RiskBand.MEDIUM
        elif score <= thresholds["High"][1]:
            return RiskBand.HIGH
        else:
            return RiskBand.EXTREME

    def _get_highest_risk_band(self, bands: List[RiskBand]) -> RiskBand:
        """
        Determine the highest (most severe) risk band from a list.

        Args:
            bands: List of RiskBand values

        Returns:
            The highest risk band
        """
        band_order = [RiskBand.LOW, RiskBand.MEDIUM, RiskBand.HIGH, RiskBand.EXTREME]
        return max(bands, key=lambda b: band_order.index(b))


def calculate_cyclerap_score(attributes: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convenience function to calculate CycleRAP score from attributes dictionary.

    Args:
        attributes: Dictionary containing coded attribute values

    Returns:
        Dictionary with score results including component scores and risk bands

    Example:
        >>> attributes = {
        ...     "bicycle_lv_speed_avg": 2,
        ...     "facility_width": 2,
        ...     "flow_direction": 2,
        ...     # ... other attributes
        ... }
        >>> result = calculate_cyclerap_score(attributes)
        >>> print(result['cyclerap_score'], result['cyclerap_band'])
    """
    calculator = CycleRAPScoreCalculator()
    result = calculator.calculate_score(attributes)
    return result.to_dict()


# Example usage and testing
if __name__ == "__main__":
    # Example attribute dictionary with coded values
    example_attributes = {
        # Speed and volume factors
        "bicycle_lv_speed_avg": 2,      # ≥ 20km/h (risk factor: 1.5)
        "bicycle_lv_speed_diff": 2,     # ≥ 10km/h (risk factor: 1.2)
        "peak_bicycle_lv_flow": 2,      # Moderate to high (risk factor: 1.2)
        "heavy_vehicle_flow": 2,        # Moderate to high (risk factor: 1.2)
        "peak_pedestrian_flow": 2,      # Low (risk factor: 1.2)

        # Facility characteristics
        "facility_width": 2,            # Narrow (risk factor: 1.5)
        "flow_direction": 2,            # Two way (risk factor: 1.5)
        "grade": 1,                     # < 5 degrees (risk factor: 1.0)
        "curvature": 2,                 # No sharp turn (risk factor: 1.0)
        "delineation": 2,               # Not present (risk factor: 1.2)
        "width_restriction": 1,         # Present (risk factor: 1.2)
        "light_segregation": 2,         # Not present (risk factor: 1.0)

        # Adjacent hazards 0-1m
        "adj_vehicle_parking_0_1m": 1,  # Present (risk factor: 1.5)
        "adj_severe_hazard_0_1m": 1,    # Present (risk factor: 1.8)

        # Adjacent hazards 1-3m
        "adj_road_lane_1_3m": 1,        # Present (risk factor: 0.8)
        "adj_vehicle_parking_1_3m": 1,  # Present (risk factor: 1.2)
        "adj_severe_hazard_1_3m": 1,    # Present (risk factor: 1.5)

        # Intersection features
        "pedestrian_crossing": 1,       # Present (risk factor: 1.2)
        "intersecting_bicycle_facility": 1,  # Present (risk factor: 1.2)
        "street_lighting": 1,           # Present (risk factor: 1.0)
        "intersection_road_crossing": 1,# Present (risk factor: 1.2)
        "crossing_facility": 1,         # Present/NA (risk factor: 1.0)
        "num_lanes_adjacent_road": 2,   # > 1 per direction (risk factor: 1.2)
        "num_lanes_intersecting_road": 2,  # > 1 per direction (risk factor: 1.2)
        "property_access": 1,           # Present (risk factor: 1.2)

        # Surface conditions
        "loose_slippery_surface": 1,    # Present (risk factor: 1.5)

        # Other
        "cargo_bikes_proportion": 2,    # Moderate to high (risk factor: 1.2)
    }

    # Calculate score
    calculator = CycleRAPScoreCalculator()
    result = calculator.calculate_score(example_attributes)

    # Display results
    print("=" * 70)
    print("CycleRAP Risk Assessment Results")
    print("=" * 70)
    print(f"\nOverall CycleRAP Score: {result.cyclerap_score:.2f}")
    print(f"Risk Band: {result.cyclerap_band.value}")
    print(f"\nComponent Scores:")
    print(f"  BB (Bicycle-Bicycle):     {result.components.bb_score:.2f} ({result.components.bb_band.value})")
    print(f"  BP (Bicycle-Pedestrian):  {result.components.bp_score:.2f} ({result.components.bp_band.value})")
    print(f"  SB (Single-Bicycle):      {result.components.sb_score:.2f} ({result.components.sb_band.value})")
    print(f"  VB (Vehicle-Bicycle):     {result.components.vb_score:.2f} ({result.components.vb_band.value})")
    print("=" * 70)

    # Test batch calculation
    print("\nTesting batch calculation...")
    test_df = pd.DataFrame([example_attributes, example_attributes])
    results_df = calculator.calculate_batch(test_df)
    print(f"\nBatch results shape: {results_df.shape}")
    print("\nScore columns:")
    score_cols = ["BB", "BP", "SB", "VB", "cyclerap_score", "cyclerap_band"]
    if all(col in results_df.columns for col in score_cols):
        print(results_df[score_cols].head())

    print("\n✓ Calculator ready for use")
