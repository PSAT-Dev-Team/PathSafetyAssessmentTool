# GIS Layer Management Guide

PSAT uses external GIS shapefiles and GeoJSON layers to provide context for path coding and risk analysis. Use the **GIS Layer Management** tool to keep these datasets up to date.

## 1. Viewing GIS Layers

Click the **View GIS Layers** button in the sidebar to open the GIS Layers dashboard. Here you can:
- Browse all current layers grouped by category (e.g., `area_type`, `bus_lane`).
- View metadata for each layer, including the geometry type and feature count.
- **Required Columns**: Inspect the mandatory column names needed for PSAT to process the layer. The number in parentheses, e.g., `LU_DESC (1)`, indicates the expected column index in the source data.

## 2. Adding a New GIS Layer

Use the **Add GIS Layer** workflow to upload entirely new datasets.
- **New Category**: You must provide a name for the category folder (e.g., `school_zones`). Every upload is assigned to a specific category.
- **File Upload**: Drag and drop your GIS files. For shapefiles, ensure you upload all companion files together (`.shp`, `.shx`, `.dbf`, `.prj`).
- **Preview**: Once uploaded, you can preview the geometry on the map before finalizing.

## 3. Replacing an Existing GIS Layer

Use the **Replace GIS Layer** workflow when you have updated data for an existing layer.
- **Filterable Search**: Use the searchable inputs to quickly find the folder and specific layer you wish to replace. Simply type a few letters (e.g., "bus") to filter the list.
- **Safety Checks**: PSAT performs compatibility checks to ensure the new file has the same required columns as the original.
- **Warnings**: If differences are found in the column structure, the system will warn you before overwriting the old data.
