# 8. GIS Layer Management

PSAT uses external GIS shapefiles and GeoJSON layers to provide spatial context for path coding and risk analysis. Use the **GIS Layer Management** tool to keep these datasets up to date.

---

## Table of Contents

- [8.1 Viewing GIS Layers](#81-viewing-gis-layers)
- [8.2 All GIS Layers in PSAT](#82-all-gis-layers-in-psat)
- [8.3 Adding a New GIS Layer](#83-adding-a-new-gis-layer)
- [8.4 Replacing an Existing GIS Layer](#84-replacing-an-existing-gis-layer)
- [8.5 Updating GIS Layers](#85-updating-gis-layers)

---

## 8.1 Viewing GIS Layers

Click the **View GIS Layers** button in the sidebar to open the GIS Layers dashboard. Here you can:

- Browse all current GIS layers (sorted in alphabetical order)
- View last updated date, required columns, and metadata for each layer
- **Required Columns**: Inspect the mandatory column names needed for PSAT to process the layer. The number in parentheses, e.g., `LU_DESC (1)`, indicates the expected column index in the source data
- Preview any layer on an interactive map by clicking it

## 8.2 All GIS Layers in PSAT

The table below lists all GIS layers currently defined in PSAT, the PSAT attribute they affect, and the required columns:

| Layer Name | Category | Geometry | PSAT Attribute Affected | Required Columns |
|---|---|---|---|---|
| `area_type` | Area Type | Polygon | Area Type (Urban, Industrial, Rural, Recreational) | `LU_DESC (1)`, `LU_TEXT (3)` |
| `LanduseRural2026` | Area Type | Polygon | Area Type (Rural) | `LU_DESC (1)`, `LU_TEXT (3)` |
| `LanduseRecre2026` | Area Type | Polygon | Area Type (Recreational) | `LU_DESC (1)`, `LU_TEXT (3)` |
| `rural` | Area Type | Polygon | Area Type (Rural) | `LU_DESC (1)`, `LU_TEXT (3)` |
| `recreation` | Area Type | Polygon | Area Type (Recreational) | `LU_DESC (1)`, `LU_TEXT (3)` |
| `Mrt_exit` | Transit | Point | Pedestrian Crossing, Peak Flow | `STATION_NA (1)`, `EXIT_CODE (2)` |
| `bus_stop` | Transit | Point | Pedestrian Crossing, Peak Flow | `BUS_STOP_N (1)`, `LOC_DESC (3)` |
| `bus_lane` | Traffic | LineString | Heavy Vehicle Flow | `TYP_CD (1)`, `TYP_NAM (2)` |
| `parking_lot` | Parking | Polygon | Adjacent Vehicle Parking | `PP_CODE (1)`, `LOT_NO (2)`, `TYPE (3)` |
| `roadcrossinglayer` | Crossings | LineString / Point | Pedestrian Crossing | `UNIQUE_ID (1)` |
| `AMG_BC2025_shp` | Crossings | LineString / Point | Intersection or Road Crossing, Crossing Facility | `UNIQUE_ID (1)` |
| `path` | Path Width | LineString | Facility Width per Direction, Curvature | `WIDTH (1)` |
| `cycling_path` | Path Width | LineString | Facility Width per Direction, Curvature | `WIDTH (1)` |
| `shared_path` | Path Width | LineString | Facility Width per Direction, Curvature | `WIDTH (1)` |
| `footpath` | Path Width | LineString | Facility Width per Direction, Curvature | `WIDTH (1)` |
| `CyclingPath_Jul2024` | Path Width | LineString | Facility Width per Direction, Curvature | `path_width (1)`, `path_type (2)` |
| `FootPath_Mar2025` | Path Width | LineString | Facility Width per Direction, Curvature | `WDT_CATG_C (1)`, `TYP_CD (2)` |
| `LinkID_Shape_File` | Road Data | LineString | Road Operating Speed (mean) | `LK_ID_NUM (1)` |
| `Speed_limit` | Road Data | LineString | Road Speed Limit | `SPEEDLIMIT (1)` |
| `kerb_line` | Road Data | LineString | Number of Lanes – Adjacent Road | `LANES (1)`, `LOCATION (2)`, `DIRECTION (3)` |
| `AMGbeforeCount` | Flow Data | Point | Peak Pedestrian Flow, Peak Bicycle Traffic Flow | `DataType (1)`, `DateTime (2)`, `Count_Data (3)` |
| `AMGsensorCount` | Flow Data | Point | Peak Pedestrian Flow, Peak Bicycle Traffic Flow | `Pivot_user (1)`, `Datetime_p (2)`, `Count (3)` |
| `Planning_area` | Reference | Polygon | Area-based reporting | `PLN_AREA_N (1)` |
| `Road_name` | Reference | LineString | Road name reference | `RD_TYP_CD (1)` |

> **Column index numbers** in parentheses indicate the column position (1-based) expected in the source shapefile. These are used during validation when uploading replacement layers.

## 8.3 Adding a New GIS Layer

Use the **Add GIS Layer** workflow to upload entirely new datasets.

- **New Category**: You must provide a name for the category folder (e.g., `school_zones`). Every upload is assigned to a specific category.
- **File Upload**: Drag and drop your GIS files. For shapefiles, ensure you upload all companion files together (`.shp`, `.shx`, `.dbf`, `.prj`).
- **Preview**: Once uploaded, you can preview the geometry on the map before finalising.

## 8.4 Replacing an Existing GIS Layer

Use the **Replace GIS Layer** workflow when you have updated data for an existing layer.

- **Filterable Search**: Use the searchable inputs to quickly find the folder and specific layer you wish to replace. Type a few letters (e.g., `bus`) to filter the list.
- **Safety Checks**: PSAT performs compatibility checks to ensure the new file has the same required columns as the original.
- **Warnings**: If differences are found in the column structure, the system will warn you before overwriting the old data.

## 8.5 Updating GIS Layers

GIS layers should be updated whenever:

- A new version of a dataset is released (e.g., updated cycling path network)
- A new category of infrastructure needs to be tracked
- The existing layer has outdated or incorrect geometry

**Steps to update a layer:**

1. Obtain the new shapefile from the relevant data source (e.g., LTA, URA)
2. Verify the file has the **required columns** listed in the table above
3. Open **GIS Layers** from the sidebar
4. Use **Replace GIS Layer**, search for the existing layer, and upload the new file
5. Review the compatibility check results before confirming the replacement

> For system-level GIS management (file paths, permissions, bulk updates), refer to the **Admin Guide**.
