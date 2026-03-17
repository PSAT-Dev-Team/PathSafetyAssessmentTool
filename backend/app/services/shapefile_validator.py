"""
Shapefile Validator
Validates GIS shapefiles for compatibility before replacement
"""

import geopandas as gpd
from pathlib import Path
from typing import Dict, List, Optional
import logging

from .gis_layer_definition import LayerDefinition, get_layer_definition

logger = logging.getLogger(__name__)


class ShapefileValidator:
    """Validates shapefile compatibility before replacement"""

    @staticmethod
    def validate_replacement(
        new_file_path: str,
        old_file_path: str,
        layer_name: Optional[str] = None,
    ) -> Dict:
        """
        Validate that a new shapefile is compatible with the one being replaced.

        Args:
            new_file_path: Path to new shapefile to validate
            old_file_path: Path to existing shapefile being replaced
            layer_name: Layer identifier (e.g., "cycling_path", optional)

        Returns:
            {
                'valid': bool,                          # True if no errors
                'errors': List[str],                    # Fatal issues - don't replace
                'warnings': List[str],                  # Non-fatal issues - warn user
                'info': Dict,                           # Comparison data
                'column_mapping': Dict[str, str],      # Mapping of required columns
            }
        """
        result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "info": {},
            "column_mapping": {},
        }

        # Validate files exist
        new_path = Path(new_file_path)
        old_path = Path(old_file_path)

        if not new_path.exists():
            result["errors"].append(f"New file not found: {new_file_path}")
            result["valid"] = False
            return result

        if not old_path.exists():
            result["errors"].append(f"Original file not found: {old_file_path}")
            result["valid"] = False
            return result

        try:
            # Load both shapefiles
            new_gdf = gpd.read_file(new_file_path)
            old_gdf = gpd.read_file(old_file_path)
        except Exception as e:
            result["errors"].append(f"Failed to read shapefile: {str(e)}")
            result["valid"] = False
            return result

        # Get layer definition if available
        layer_def = get_layer_definition(layer_name) if layer_name else None

        # Check 1: CRS Compatibility
        result_crs = ShapefileValidator._validate_crs(new_gdf, old_gdf)
        if result_crs["error"]:
            result["errors"].append(result_crs["error"])
        if result_crs["warning"]:
            result["warnings"].append(result_crs["warning"])
        result["info"]["crs_new"] = str(new_gdf.crs) if new_gdf.crs else "None"
        result["info"]["crs_old"] = str(old_gdf.crs) if old_gdf.crs else "None"

        # Check 2: Geometry Type Compatibility
        result_geom = ShapefileValidator._validate_geometry_type(
            new_gdf, old_gdf, layer_def
        )
        if result_geom["error"]:
            result["errors"].append(result_geom["error"])
        if result_geom["warning"]:
            result["warnings"].append(result_geom["warning"])
        result["info"]["geometry_new"] = result_geom["geometry_type"]
        result["info"]["geometry_old"] = result_geom["geometry_type_old"]

        # Check 3: Required Columns (with alias resolution)
        result_cols = ShapefileValidator._validate_required_columns(
            new_gdf, layer_def
        )
        if result_cols["missing"]:
            result["errors"].append(
                f"Missing required columns: {', '.join(result_cols['missing'])}"
            )
        if result_cols["column_mapping"]:
            result["column_mapping"] = result_cols["column_mapping"]
        if result_cols["warnings"]:
            result["warnings"].extend(result_cols["warnings"])

        result["info"]["columns_new"] = list(new_gdf.columns)
        result["info"]["columns_old"] = list(old_gdf.columns)

        # Check 4: Feature Count
        result_count = ShapefileValidator._validate_feature_count(new_gdf, old_gdf)
        if result_count["warning"]:
            result["warnings"].append(result_count["warning"])
        result["info"]["feature_count_new"] = len(new_gdf)
        result["info"]["feature_count_old"] = len(old_gdf)

        # Check 5: Empty Geometries
        result_empty = ShapefileValidator._validate_empty_geometries(new_gdf)
        if result_empty["warning"]:
            result["warnings"].append(result_empty["warning"])
        result["info"]["empty_geometries_count"] = result_empty["count"]

        # Check 6: Spatial Bounds
        result_bounds = ShapefileValidator._validate_spatial_bounds(new_gdf, old_gdf)
        if result_bounds["warning"]:
            result["warnings"].append(result_bounds["warning"])

        # Determine validity
        result["valid"] = len(result["errors"]) == 0

        return result

    @staticmethod
    def _validate_crs(new_gdf, old_gdf) -> Dict:
        """Check CRS compatibility"""
        result = {"error": None, "warning": None}

        # Check if both have CRS
        if new_gdf.crs is None:
            result["error"] = (
                "New shapefile is missing CRS (projection) information"
            )
            return result

        if old_gdf.crs is None:
            result["warning"] = "Original shapefile has no CRS information"
            return result

        # Check if CRS matches
        try:
            new_epsg = new_gdf.crs.to_epsg()
            old_epsg = old_gdf.crs.to_epsg()

            if new_epsg != old_epsg:
                result["warning"] = (
                    f"CRS mismatch: new={new_gdf.crs}, old={old_gdf.crs}. "
                    f"Will be auto-converted to EPSG:3414 during use."
                )
        except Exception as e:
            logger.warning(f"Could not compare CRS: {e}")

        return result

    @staticmethod
    def _validate_geometry_type(
        new_gdf, old_gdf, layer_def: Optional[LayerDefinition]
    ) -> Dict:
        """Check geometry type compatibility"""
        result = {
            "error": None,
            "warning": None,
            "geometry_type": None,
            "geometry_type_old": None,
        }

        # Get geometry types
        new_types = set(new_gdf.geometry.geom_type.unique())
        old_types = set(old_gdf.geometry.geom_type.unique())

        result["geometry_type"] = ", ".join(sorted(new_types))
        result["geometry_type_old"] = ", ".join(sorted(old_types))

        # Check if new geometry is compatible with layer definition
        if layer_def and layer_def.geometry_types:
            expected = set(layer_def.geometry_types)
            invalid_types = new_types - expected

            if invalid_types:
                result["error"] = (
                    f"Unexpected geometry type(s): {', '.join(invalid_types)}. "
                    f"Expected: {', '.join(expected)}"
                )

        # Warn if geometry type changed
        if new_types != old_types:
            result["warning"] = (
                f"Geometry type changed: {old_types} → {new_types}. "
                f"This may affect autocoding results."
            )

        return result

    @staticmethod
    def _validate_required_columns(
        gdf: gpd.GeoDataFrame, layer_def: Optional[LayerDefinition]
    ) -> Dict:
        """Check for required columns with alias resolution"""
        result = {"missing": [], "column_mapping": {}, "warnings": []}

        if not layer_def or not layer_def.required_columns:
            return result

        gdf_cols = list(gdf.columns)
        gdf_cols_upper = {col.upper(): col for col in gdf_cols}

        for req_col in layer_def.required_columns:
            actual_col = layer_def.get_column_name(req_col, gdf_cols)

            if actual_col:
                # Found the column (either exact match or alias)
                result["column_mapping"][req_col] = actual_col

                if actual_col != req_col:
                    # Column alias was used
                    result["warnings"].append(
                        f"Column '{req_col}' resolved to '{actual_col}' in new file"
                    )
            else:
                # Column not found
                result["missing"].append(req_col)

        return result

    @staticmethod
    def _validate_feature_count(new_gdf, old_gdf) -> Dict:
        """Warn if feature count differs drastically"""
        result = {"warning": None}

        old_count = len(old_gdf)
        new_count = len(new_gdf)

        if old_count == 0:
            return result

        change_pct = abs(new_count - old_count) / old_count * 100

        # Warn if more than 50% difference
        if change_pct > 50:
            result["warning"] = (
                f"Feature count changed significantly: {old_count} → {new_count} "
                f"({change_pct:+.1f}%). Review to ensure this is intentional."
            )

        return result

    @staticmethod
    def _validate_empty_geometries(gdf: gpd.GeoDataFrame) -> Dict:
        """Check for empty/invalid geometries"""
        result = {"warning": None, "count": 0}

        try:
            empty_count = gdf.geometry.is_empty.sum()
            result["count"] = int(empty_count)

            if empty_count > 0:
                result["warning"] = (
                    f"Found {empty_count} empty geometry/geometries in new file"
                )
        except Exception as e:
            logger.warning(f"Could not validate empty geometries: {e}")

        return result

    @staticmethod
    def _validate_spatial_bounds(new_gdf, old_gdf) -> Dict:
        """Warn if spatial bounds differ drastically"""
        result = {"warning": None}

        try:
            old_bounds = old_gdf.total_bounds  # [minx, miny, maxx, maxy]
            new_bounds = new_gdf.total_bounds

            # Calculate area of bounding boxes
            old_area = (old_bounds[2] - old_bounds[0]) * (
                old_bounds[3] - old_bounds[1]
            )
            new_area = (new_bounds[2] - new_bounds[0]) * (
                new_bounds[3] - new_bounds[1]
            )

            if old_area == 0:
                return result

            area_change_pct = abs(new_area - old_area) / old_area * 100

            # Warn if bounds changed more than 30%
            if area_change_pct > 30:
                result["warning"] = (
                    f"Spatial extent changed significantly ({area_change_pct:+.1f}%). "
                    f"Verify coverage area is correct."
                )
        except Exception as e:
            logger.warning(f"Could not validate spatial bounds: {e}")

        return result
