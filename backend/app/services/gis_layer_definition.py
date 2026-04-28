"""
GIS Layer Definitions
Defines structure and requirements for each GIS layer to maximize portability
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional


@dataclass
class LayerDefinition:
    """
    Defines how a GIS layer is used in autocoding.
    Separates structure (what columns/geometry it needs)
    from logic (how it's used in calculations).
    """
    name: str                                    # e.g., "cycling_path"
    geometry_types: List[str]                    # ["LineString", "MultiLineString"]
    required_columns: List[str]                  # Columns that MUST be present
    query_type: str                              # "near", "poly", "buffer", "nearest_with_lookup"
    description: str = ""
    default_buffer_m: float = 20.0
    column_aliases: Dict[str, List[str]] = field(default_factory=dict)  # Alternative column names

    def get_column_name(self, required_col: str, gdf_columns: List[str]) -> Optional[str]:
        """
        Find the actual column name in a geodataframe for a required column.
        Handles aliases like WIDTH → PATH_WIDTH, width, W_WIDTH, etc.

        Args:
            required_col: Required column (e.g., "WIDTH")
            gdf_columns: Available columns in the geodataframe

        Returns:
            Actual column name if found, else None
        """
        gdf_cols_upper = {col.upper(): col for col in gdf_columns}

        # Check exact match first
        if required_col.upper() in gdf_cols_upper:
            return gdf_cols_upper[required_col.upper()]

        # Check aliases
        if required_col in self.column_aliases:
            for alias in self.column_aliases[required_col]:
                if alias.upper() in gdf_cols_upper:
                    return gdf_cols_upper[alias.upper()]

        return None


# Define all layers and their requirements
LAYER_DEFINITIONS: Dict[str, LayerDefinition] = {
    # Area Type Layers (Polygon containment queries)
    "inner": LayerDefinition(
        name="inner",
        geometry_types=["Polygon", "MultiPolygon"],
        required_columns=[],  # No specific columns for containment check
        query_type="poly",
        description="Central Business District / Urban area",
        default_buffer_m=20.0,
    ),
    "industrial": LayerDefinition(
        name="industrial",
        geometry_types=["Polygon", "MultiPolygon"],
        required_columns=[],
        query_type="poly",
        description="Industrial area",
        default_buffer_m=20.0,
    ),
    "rural": LayerDefinition(
        name="rural",
        geometry_types=["Polygon", "MultiPolygon"],
        required_columns=[],
        query_type="poly",
        description="Rural area",
        default_buffer_m=20.0,
    ),
    "recreation": LayerDefinition(
        name="recreation",
        geometry_types=["Polygon", "MultiPolygon"],
        required_columns=[],
        query_type="poly",
        description="Recreation area",
        default_buffer_m=20.0,
    ),

    # Proximity Queries (Point/Line distance queries)
    "mrt": LayerDefinition(
        name="mrt",
        geometry_types=["Point", "MultiPoint"],
        required_columns=[],  # No specific columns needed for proximity
        query_type="near",
        description="MRT exit locations",
        default_buffer_m=20.0,
    ),
    "bus_stop": LayerDefinition(
        name="bus_stop",
        geometry_types=["Point", "MultiPoint"],
        required_columns=[],
        query_type="near",
        description="Bus stop locations",
        default_buffer_m=20.0,
    ),
    "bus_lane": LayerDefinition(
        name="bus_lane",
        geometry_types=["LineString", "MultiLineString"],
        required_columns=[],
        query_type="near",
        description="Bus lane segments",
        default_buffer_m=20.0,
    ),
    "parking": LayerDefinition(
        name="parking",
        geometry_types=["Polygon", "MultiPolygon"],
        required_columns=[],
        query_type="near",
        description="Parking lot locations",
        default_buffer_m=20.0,
    ),

    # Path Feature Layers (LineString width queries)
    "cycling_path": LayerDefinition(
        name="cycling_path",
        geometry_types=["LineString", "MultiLineString"],
        required_columns=["WIDTH"],  # MUST have width information
        query_type="near",
        description="Cycling path centerlines",
        default_buffer_m=5.0,
        column_aliases={
            "WIDTH": ["WIDTH", "PATH_WIDTH", "W_WIDTH", "width", "Width_m", "WIDTH_M", "Wdth", "WID"]
        },
    ),
    "shared_path": LayerDefinition(
        name="shared_path",
        geometry_types=["LineString", "MultiLineString"],
        required_columns=["WIDTH"],
        query_type="near",
        description="Shared path centerlines",
        default_buffer_m=5.0,
        column_aliases={
            "WIDTH": ["WIDTH", "PATH_WIDTH", "W_WIDTH", "width", "Width_m", "WIDTH_M", "Wdth", "WID"]
        },
    ),
    "footpath": LayerDefinition(
        name="footpath",
        geometry_types=["LineString", "MultiLineString"],
        required_columns=["WIDTH"],
        query_type="near",
        description="Footpath centerlines",
        default_buffer_m=5.0,
        column_aliases={
            "WIDTH": ["WIDTH", "PATH_WIDTH", "W_WIDTH", "width", "Width_m", "WIDTH_M", "Wdth", "WID"]
        },
    ),

    # Road Data Layers (Lookup queries)
    "road_links": LayerDefinition(
        name="road_links",
        geometry_types=["LineString", "MultiLineString"],
        required_columns=["LK_ID_NUM"],  # MUST have link ID for CSV lookup
        query_type="nearest_with_lookup",
        description="Road link segments with IDs",
        default_buffer_m=20.0,
        column_aliases={
            "LK_ID_NUM": ["LK_ID_NUM", "LINKID", "LINK_ID", "LinkID", "ID", "link_id"]
        },
    ),
    "speed_limit": LayerDefinition(
        name="speed_limit",
        geometry_types=["LineString", "MultiLineString"],
        required_columns=["SPEEDLIMIT"],  # MUST have speed limit value
        query_type="nearest_with_attribute",
        description="Road segments with speed limits",
        default_buffer_m=20.0,
        column_aliases={
            "SPEEDLIMIT": ["SPEEDLIMIT", "SPEED_LIMIT", "SPEED_LIM", "speedlimit", "speed_limit", "LIMIT"]
        },
    ),

    # Pedestrian Flow Layers (CSV-backed queries)
    "beforeCount": LayerDefinition(
        name="beforeCount",
        geometry_types=["Point", "MultiPoint"],
        required_columns=["DataType", "DateTime", "Count_Data"],  # Column names as in CSV
        query_type="temporal_aggregation",
        description="Pedestrian/micromobility counts (before treatment)",
        default_buffer_m=20.0,
    ),
    "sensorCount": LayerDefinition(
        name="sensorCount",
        geometry_types=["Point", "MultiPoint"],
        required_columns=["Pivot_user", "Datetime_p", "Count"],
        query_type="temporal_aggregation",
        description="Sensor-based counts (e.g., for treatment evaluation)",
        default_buffer_m=20.0,
    ),

    # Curb and Kerb Layers
    "kerb_line": LayerDefinition(
        name="kerb_line",
        geometry_types=["LineString", "MultiLineString"],
        required_columns=[],
        query_type="nearest",
        description="Kerb line segments",
        default_buffer_m=10.0,
    ),
}


def get_layer_definition(layer_name: str) -> Optional[LayerDefinition]:
    """Get definition for a layer by name"""
    return LAYER_DEFINITIONS.get(layer_name)


def list_layer_definitions() -> Dict[str, LayerDefinition]:
    """List all layer definitions"""
    return LAYER_DEFINITIONS.copy()
