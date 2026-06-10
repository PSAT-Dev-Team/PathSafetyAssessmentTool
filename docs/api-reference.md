# API Reference

All endpoints are prefixed with `/api/`.

- Direct backend base URL: `http://localhost:8000/api`
- Through the frontend: `http://localhost/api`

This reference covers the current API surface that backs project creation, coding, analysis, treatments, and GIS-layer management.


## Table of Contents

- [4.1 Health](#4-1-health)
  - [4.11 `GET /api/ping`](#4-11-get-api-ping)
  - [4.12 `GET /api/health`](#4-12-get-api-health)
- [4.2 Project listing and metadata](#4-2-project-listing-and-metadata)
  - [4.21 `GET /api/projects`](#4-21-get-api-projects)
  - [4.22 `GET /api/projects/<project_name>`](#4-22-get-api-projects-project-name)
  - [4.23 `GET /api/projects/<project_name>/metadata`](#4-23-get-api-projects-project-name-metadata)
  - [4.24 `PATCH /api/projects/<project_name>`](#4-24-patch-api-projects-project-name)
  - [4.25 `DELETE /api/projects/<project_name>`](#4-25-delete-api-projects-project-name)
- [4.3 Project data](#4-3-project-data)
  - [4.31 `GET /api/projects/<project_name>/versions/latest/attributes`](#4-31-get-api-projects-project-name-versions-latest-attributes)
  - [4.32 `PUT /api/projects/<project_name>/attributes`](#4-32-put-api-projects-project-name-attributes)
  - [4.33 `GET /api/projects/<project_name>/geodata`](#4-33-get-api-projects-project-name-geodata)
  - [4.34 `GET /api/projects/<project_name>/results`](#4-34-get-api-projects-project-name-results)
  - [4.35 `POST /api/projects/<project_name>/score`](#4-35-post-api-projects-project-name-score)
  - [4.36 `GET /api/projects/<project_name>/images/<path:filename>`](#4-36-get-api-projects-project-name-images-path-filename)
- [4.4 Attribute mappings](#4-4-attribute-mappings)
  - [4.41 `GET /api/projects/attribute-mappings`](#4-41-get-api-projects-attribute-mappings)
- [4.5 Project creation and source discovery](#4-5-project-creation-and-source-discovery)
  - [4.51 `GET /api/projects/folders`](#4-51-get-api-projects-folders)
  - [4.52 `POST /api/projects/folders`](#4-52-post-api-projects-folders)
  - [4.53 `POST /api/projects/folders/upload-images`](#4-53-post-api-projects-folders-upload-images)
  - [4.54 `POST /api/projects/roads-in-polygon`](#4-54-post-api-projects-roads-in-polygon)
  - [4.55 `GET /api/projects/roads-in-bounds`](#4-55-get-api-projects-roads-in-bounds)
  - [4.56 `GET /api/projects/planning-areas-in-bounds`](#4-56-get-api-projects-planning-areas-in-bounds)
- [4.6 Segment management and copying](#4-6-segment-management-and-copying)
  - [4.61 `DELETE /api/projects/<project_name>/segments/<segment_index>`](#4-61-delete-api-projects-project-name-segments-segment-index)
  - [4.62 `POST /api/projects/<project_name>/segments/delete-batch`](#4-62-post-api-projects-project-name-segments-delete-batch)
  - [4.63 `POST /api/projects/check-collisions`](#4-63-post-api-projects-check-collisions)
  - [4.64 `POST /api/projects/copy-segments`](#4-64-post-api-projects-copy-segments)
- [4.7 Autocode endpoints](#4-7-autocode-endpoints)
  - [4.71 `POST /api/projects/<project_name>/autocode/image`](#4-71-post-api-projects-project-name-autocode-image)
  - [4.72 `POST /api/projects/<project_name>/autocode/gis`](#4-72-post-api-projects-project-name-autocode-gis)
  - [4.73 `POST /api/projects/<project_name>/autocode/all`](#4-73-post-api-projects-project-name-autocode-all)
  - [4.74 `GET /api/projects/<project_name>/autocode-metadata`](#4-74-get-api-projects-project-name-autocode-metadata)
  - [4.75 `POST /api/projects/<project_name>/autocode-metadata`](#4-75-post-api-projects-project-name-autocode-metadata)
- [4.8 Baseline endpoints](#4-8-baseline-endpoints)
  - [4.81 `GET /api/projects/<project_name>/baseline/exists`](#4-81-get-api-projects-project-name-baseline-exists)
  - [4.82 `GET /api/projects/<project_name>/baseline`](#4-82-get-api-projects-project-name-baseline)
  - [4.83 `POST /api/projects/<project_name>/baseline`](#4-83-post-api-projects-project-name-baseline)
- [4.9 Visualization and GIS-context endpoints](#4-9-visualization-and-gis-context-endpoints)
  - [4.91 `POST /api/projects/<project_name>/curvature/visualize`](#4-91-post-api-projects-project-name-curvature-visualize)
  - [4.92 `POST /api/projects/<project_name>/width/visualize`](#4-92-post-api-projects-project-name-width-visualize)
  - [4.93 `POST /api/projects/<project_name>/gis/layers`](#4-93-post-api-projects-project-name-gis-layers)
  - [4.94 `POST /api/projects/<projectName>/gis/detect`](#4-94-post-api-projects-projectname-gis-detect)
- [4.10 Treatment endpoints](#4-10-treatment-endpoints)
  - [4.101 `POST /api/projects/<project_name>/treatments/preview`](#4-101-post-api-projects-project-name-treatments-preview)
  - [4.102 `POST /api/projects/<project_name>/treatments/apply`](#4-102-post-api-projects-project-name-treatments-apply)
  - [4.103 `GET /api/projects/<project_name>/treatments/segment/<segment_index>`](#4-103-get-api-projects-project-name-treatments-segment-segment-index)
  - [4.104 `GET /api/projects/<project_name>/treatments/all`](#4-104-get-api-projects-project-name-treatments-all)
  - [4.105 `POST /api/projects/<project_name>/treatments/apply-all`](#4-105-post-api-projects-project-name-treatments-apply-all)
  - [4.106 `POST /api/projects/<project_name>/treatments/apply-specific`](#4-106-post-api-projects-project-name-treatments-apply-specific)
  - [4.107 `POST /api/projects/<project_name>/treatments/reset-all`](#4-107-post-api-projects-project-name-treatments-reset-all)
  - [4.108 `POST /api/projects/<project_name>/treatments/save`](#4-108-post-api-projects-project-name-treatments-save)
  - [4.109 `POST /api/projects/<project_name>/treatments/effectiveness`](#4-109-post-api-projects-project-name-treatments-effectiveness)
  - [4.1010 `GET /api/projects/<project_name>/treatments/effectiveness/segment/<segment_index>`](#4-1010-get-api-projects-project-name-treatments-effectiveness-segment-segment-index)
- [4.11 Image export](#4-11-image-export)
  - [4.111 `POST /api/projects/download-images`](#4-111-post-api-projects-download-images)
- [4.12 Shapefile management API](#4-12-shapefile-management-api)
  - [4.121 `GET /api/shapefiles`](#4-121-get-api-shapefiles)
  - [4.122 `GET /api/shapefiles/categories`](#4-122-get-api-shapefiles-categories)
  - [4.123 `POST /api/shapefiles/geojson`](#4-123-post-api-shapefiles-geojson)
  - [4.124 `POST /api/shapefiles/validate`](#4-124-post-api-shapefiles-validate)
  - [4.125 `POST /api/shapefiles/preview-upload`](#4-125-post-api-shapefiles-preview-upload)
  - [4.126 `POST /api/shapefiles/upload`](#4-126-post-api-shapefiles-upload)
  - [4.127 `POST /api/shapefiles/validate-replacement`](#4-127-post-api-shapefiles-validate-replacement)
  - [4.128 `PUT /api/shapefiles/replace`](#4-128-put-api-shapefiles-replace)
  - [4.129 `DELETE /api/shapefiles/<path:shapefile_path>`](#4-129-delete-api-shapefiles-path-shapefile-path)
- [4.13 Common status codes](#4-13-common-status-codes)

## 4.1 Health

### 4.11 `GET /api/ping`

Liveness check.

```json
{ "status": "ok" }
```

### 4.12 `GET /api/health`

Equivalent liveness check registered directly on the Flask app.

```json
{ "status": "ok" }
```

## 4.2 Project listing and metadata

### 4.21 `GET /api/projects`

Returns the project list used by the Projects, Treatment, and Path Analysis pages.

```json
{
  "projects": [
    {
      "name": "AMK Analysis Batch",
      "tags": ["AMK", "Pre"],
      "dataset": "MULTI_FOLDER_SELECTION",
      "source_folders": ["ANG MO KIO AVENUE 1", "ANG MO KIO AVENUE 8"],
      "verified": false,
      "verified_segment_count": 42,
      "autocoded_segment_count": 56,
      "total_segments": 71,
      "date_created": "2026-04-25T14:35:11.210000",
      "last_updated": "2026-04-29T10:42:55.883000"
    }
  ]
}
```

Notes:

- `dataset` is the legacy single-source field and is still returned.
- `source_folders` is the durable provenance list used by project-or-road fuzzy search.

### 4.22 `GET /api/projects/<project_name>`

Returns the available version folders and the current latest snapshot.

```json
{
  "name": "AMK Analysis Batch",
  "versions": ["20260425", "20260429"],
  "latest": "20260429"
}
```

### 4.23 `GET /api/projects/<project_name>/metadata`

Returns the detailed metadata object for one project.

```json
{
  "name": "AMK Analysis Batch",
  "tags": ["AMK", "Pre"],
  "dataset": "MULTI_FOLDER_SELECTION",
  "source_folders": ["ANG MO KIO AVENUE 1", "ANG MO KIO AVENUE 8"],
  "verified": false,
  "verified_segment_count": 42,
  "autocoded_segment_count": 56,
  "path_key": null,
  "date_created": "2026-04-25T14:35:11.210000",
  "last_updated": "2026-04-29T10:42:55.883000"
}
```

### 4.24 `PATCH /api/projects/<project_name>`

Updates project metadata and optionally renames the project.

Accepted fields:

```json
{
  "new_name": "AMK Analysis Batch 2",
  "tags": ["AMK", "Post"],
  "path_key": "AMK_AVE_1",
  "verified": true,
  "verified_segment_count": 71,
  "autocoded_segment_count": 71
}
```

Response:

```json
{
  "ok": true,
  "name": "AMK Analysis Batch 2",
  "tags": ["AMK", "Post"],
  "verified": true,
  "verified_segment_count": 71,
  "autocoded_segment_count": 71
}
```

### 4.25 `DELETE /api/projects/<project_name>`

Deletes the entire project directory.

```json
{ "ok": true, "name": "AMK Analysis Batch" }
```

## 4.3 Project data

### 4.31 `GET /api/projects/<project_name>/versions/latest/attributes`

Returns the latest attribute rows. If results exist, score-band columns are merged into the row payload.

```json
{
  "rows": [
    {
      "Facility Type": 2,
      "Curvature": 1,
      "VB Band": 3,
      "BB Band": 1,
      "Overall Risk Level Band": 3
    }
  ]
}
```

### 4.32 `PUT /api/projects/<project_name>/attributes`

Persists the latest attributes table and recalculates results.

```json
{
  "rows": [
    { "Facility Type": 2, "Curvature": 1 }
  ]
}
```

Typical response:

```json
{ "ok": true }
```

### 4.33 `GET /api/projects/<project_name>/geodata`

Returns project geometry as GeoJSON `FeatureCollection`.

### 4.34 `GET /api/projects/<project_name>/results`

Returns saved results rows.

```json
{
  "ok": true,
  "result_rows": [
    {
      "BB": 3.18,
      "BB Band": 1,
      "Overall Risk Level": 33.4,
      "Overall Risk Level Band": 2
    }
  ]
}
```

### 4.35 `POST /api/projects/<project_name>/score`

Runs native CycleRAP scoring.

Optional body:

```json
{
  "attributes": [
    { "Facility Type": 2, "Curvature": 1 }
  ]
}
```

If a single row is posted, the result is typically used as an in-memory preview and not persisted.

### 4.36 `GET /api/projects/<project_name>/images/<path:filename>`

Serves a project image file with path-traversal protection.

## 4.4 Attribute mappings

### 4.41 `GET /api/projects/attribute-mappings`

Returns label mappings for discrete coding fields.

```json
{
  "Facility Type": {
    "1": "Sidewalk",
    "2": "Multi-Use Path"
  }
}
```

## 4.5 Project creation and source discovery

### 4.51 `GET /api/projects/folders`

Lists subfolders under `in/`.

```json
{ "items": ["ANG MO KIO AVENUE 1", "ANG MO KIO AVENUE 8"] }
```

### 4.52 `POST /api/projects/folders`

Creates a project from one or more input folders.

Single-folder request:

```json
{
  "project_name": "AMK Ave 1 Review",
  "folder_name": "ANG MO KIO AVENUE 1",
  "tags": ["AMK"]
}
```

Multi-folder plus polygon request:

```json
{
  "project_name": "AMK Polygon Selection",
  "folder_names": ["ANG MO KIO AVENUE 1", "ANG MO KIO AVENUE 8"],
  "tags": ["AMK", "Pre"],
  "polygon": [
    [1.3720, 103.8480],
    [1.3730, 103.8510],
    [1.3700, 103.8530]
  ]
}
```

Response:

```json
{
  "ok": true,
  "name": "AMK Polygon Selection",
  "source_count": 2,
  "skipped_sources": []
}
```

Important behavior:

- accepts `folder_name` or `folder_names`
- rejects underscores in `project_name`
- when `polygon` is present, only geotagged images whose nodes fall inside the polygon are kept
- stores `source_folders` in project metadata
- uses `MULTI_FOLDER_SELECTION` as `dataset` when more than one source folder is used

Common errors:

- `400` missing `project_name`
- `400` invalid polygon
- `400` no geotagged images inside the selected polygon
- `404` one or more folders not found
- `409` project already exists

### 4.53 `POST /api/projects/folders/upload-images`

Multipart upload into a source folder under `in/`.

Form fields:

- `folder_name`
- one or more `images`

Response:

```json
{
  "count": 12,
  "errors": [],
  "message": "Uploaded 12 image(s) to folder 'ANG MO KIO AVENUE 1'"
}
```

### 4.54 `POST /api/projects/roads-in-polygon`

Returns road candidates intersecting a user-drawn polygon.

Request:

```json
{
  "polygon": [
    [1.3720, 103.8480],
    [1.3730, 103.8510],
    [1.3700, 103.8530]
  ]
}
```

Response:

```json
{
  "roads": [
    { "name": "ANG MO KIO AVENUE 1", "points": 12, "exists": true },
    { "name": "ANG MO KIO AVENUE 8", "points": 5, "exists": false }
  ],
  "fallback": false
}
```

If the backend can only return planning-area fallback results, `fallback` is `true` and items will not be preselected by the frontend.

### 4.55 `GET /api/projects/roads-in-bounds`

Returns road polylines for the current viewport.

Query params:

- `minLat`
- `minLng`
- `maxLat`
- `maxLng`
- optional `limit`

Response:

```json
{
  "roads": [
    {
      "name": "ANG MO KIO AVENUE 1",
      "exists": true,
      "coords": [[1.3720, 103.8480], [1.3722, 103.8485]]
    }
  ]
}
```

### 4.56 `GET /api/projects/planning-areas-in-bounds`

Returns planning-area polygon parts for the viewport.

```json
{
  "areas": [
    {
      "name": "Ang Mo Kio",
      "region": "North-East",
      "partIndex": 0,
      "coords": [[1.37, 103.84], [1.38, 103.84], [1.38, 103.85], [1.37, 103.84]]
    }
  ]
}
```

## 4.6 Segment management and copying

### 4.61 `DELETE /api/projects/<project_name>/segments/<segment_index>`

Deletes a single segment and its associated image reference where applicable.

### 4.62 `POST /api/projects/<project_name>/segments/delete-batch`

Deletes multiple segments.

```json
{ "indices": [0, 3, 7] }
```

### 4.63 `POST /api/projects/check-collisions`

Checks image-reference collisions before copying segments between projects.

```json
{
  "sourceProject": "ProjectA",
  "targetProject": "ProjectB",
  "indices": [0, 1, 2]
}
```

```json
{ "ok": true, "collisions": [] }
```

### 4.64 `POST /api/projects/copy-segments`

Copies selected segments into another project.

```json
{
  "sourceProject": "ProjectA",
  "targetProject": "ProjectB",
  "indices": [0, 1, 2],
  "createTarget": true,
  "replace": false,
  "tags": ["copied"]
}
```

## 4.7 Autocode endpoints

### 4.71 `POST /api/projects/<project_name>/autocode/image`

CV auto-code for one image.

```json
{ "imageRef": "AMK_AVE_1__Cam1_0001.jpg" }
```

Response includes at least `updates` and `changed_fields`, and may also include `gradient_pct` when LAZ-derived grade data is available.

### 4.72 `POST /api/projects/<project_name>/autocode/gis`

GIS auto-code for one segment.

```json
{ "coords": [[103.81, 1.35], [103.82, 1.36]] }
```

Optional field filtering is supported through a `fields` array in the request body.

### 4.73 `POST /api/projects/<project_name>/autocode/all`

Supports three shapes:

| Mode | Example payload |
|---|---|
| single segment | `{ "imageRef": "...", "coords": [...], "index": 0 }` |
| all rows | `{ "all": true, "save": false, "fields": ["Curvature"] }` |
| selected rows | `{ "indices": [0, 3], "save": false }` |

Bulk response shape:

```json
{
  "saved": false,
  "total": 2,
  "ok": 2,
  "fail": 0,
  "errors": [],
  "changed_by_row": {
    "0": ["Curvature"]
  },
  "sources_by_row": {
    "0": { "Curvature": "GIS" }
  },
  "updated_attributes": [
    { "Curvature": 1 }
  ]
}
```

### 4.74 `GET /api/projects/<project_name>/autocode-metadata`

Reads saved autocode provenance metadata.

```json
{
  "changedFieldsByRow": { "0": ["Curvature"] },
  "fieldSourcesByRow": { "0": { "Curvature": "GIS" } }
}
```

### 4.75 `POST /api/projects/<project_name>/autocode-metadata`

Writes the autocode metadata JSON used by the coding page.

## 4.8 Baseline endpoints

### 4.81 `GET /api/projects/<project_name>/baseline/exists`

```json
{ "exists": true }
```

### 4.82 `GET /api/projects/<project_name>/baseline`

Returns baseline attribute rows, or `rows: []` if none exist yet.

### 4.83 `POST /api/projects/<project_name>/baseline`

Persists a baseline attribute table.

```json
{
  "rows": [
    { "Facility Type": 2 }
  ]
}
```

## 4.9 Visualization and GIS-context endpoints

### 4.91 `POST /api/projects/<project_name>/curvature/visualize`

Returns geometry and numeric context for the curvature visualization panel.

### 4.92 `POST /api/projects/<project_name>/width/visualize`

Returns geometry and search-ring context for the width visualization panel.

### 4.93 `POST /api/projects/<project_name>/gis/layers`

Returns nearby GIS features around a point for the coding map overlay.

### 4.94 `POST /api/projects/<projectName>/gis/detect`

Diagnostic endpoint used to inspect nearby GIS features such as bus stops and bus lanes.

## 4.10 Treatment endpoints

### 4.101 `POST /api/projects/<project_name>/treatments/preview`

Preview one or more treatments for a segment without persisting.

### 4.102 `POST /api/projects/<project_name>/treatments/apply`

Apply one or more treatments to a segment and persist the treatment state.

Request:

```json
{
  "segment_index": 5,
  "treatment_ids": [1, 9, 14],
  "image_ref": "Cam1_0006.jpg"
}
```

Response includes:

- `treatments_applied`
- `modified_attributes`
- `before_scores`
- `after_scores`

### 4.103 `GET /api/projects/<project_name>/treatments/segment/<segment_index>`

Returns the current treatment state for a specific segment.

### 4.104 `GET /api/projects/<project_name>/treatments/all`

Returns all stored treatment states in one call. Only segments with treatments are included.

### 4.105 `POST /api/projects/<project_name>/treatments/apply-all`

Applies all applicable treatments across the project.

### 4.106 `POST /api/projects/<project_name>/treatments/apply-specific`

Applies one specific treatment ID across all applicable segments.

```json
{ "treatment_id": 7 }
```

### 4.107 `POST /api/projects/<project_name>/treatments/reset-all`

Clears pending treatment state.

### 4.108 `POST /api/projects/<project_name>/treatments/save`

Persists pending treatment edits.

### 4.109 `POST /api/projects/<project_name>/treatments/effectiveness`

Ranks treatments by the number of segments whose overall risk band improves when the treatment is applied in isolation.

Optional request:

```json
{ "treatment_ids": [1, 2, 3] }
```

Response:

```json
{
  "ok": true,
  "total_segments": 412,
  "counts": { "1": 180, "2": 0, "3": 45 }
}
```

### 4.1010 `GET /api/projects/<project_name>/treatments/effectiveness/segment/<segment_index>`

Returns per-treatment score drops for one segment.

```json
{
  "ok": true,
  "score_drops": { "1": 4.2, "3": 0.0 }
}
```

## 4.11 Image export

### 4.111 `POST /api/projects/download-images`

Returns a ZIP blob containing filtered images grouped by project.

```json
{
  "projects": {
    "ProjectA": ["IMG_001.jpg"],
    "ProjectB": ["IMG_010.jpg"]
  }
}
```

## 4.12 Shapefile management API

These endpoints are served from the `gis_layers` blueprint under `/api/shapefiles`.

### 4.121 `GET /api/shapefiles`

Lists discovered shapefiles with metadata such as category, year, source, and relative path.

### 4.122 `GET /api/shapefiles/categories`

Lists immediate shapefile categories (subdirectories).

### 4.123 `POST /api/shapefiles/geojson`

Reads one shapefile and returns WGS84 GeoJSON.

```json
{ "path": "Road_name/ROADSECTIONLINE.shp", "max_features": 10000 }
```

### 4.124 `POST /api/shapefiles/validate`

Validates an uploaded ZIP before import.

### 4.125 `POST /api/shapefiles/preview-upload`

Returns temporary GeoJSON preview data for uploaded shapefile files without saving them.

### 4.126 `POST /api/shapefiles/upload`

Uploads one or more shapefile assets or ZIPs into a category.

Multipart fields:

- `files`
- optional `category`

### 4.127 `POST /api/shapefiles/validate-replacement`

Checks whether an uploaded replacement is compatible with an existing layer.

```json
{
  "new_file_path": "temp/new.shp",
  "target_file_path": "Road_name/ROADSECTIONLINE.shp",
  "layer_name": "road_sections"
}
```

### 4.128 `PUT /api/shapefiles/replace`

Copies uploaded files over target shapefiles and writes `.bak` backups where applicable.

```json
{
  "replacements": [
    { "uploaded_path": "temp/new.shp", "target_path": "Road_name/ROADSECTIONLINE.shp" }
  ]
}
```

### 4.129 `DELETE /api/shapefiles/<path:shapefile_path>`

Deletes a shapefile and its companion files.

## 4.13 Common status codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request |
| `404` | Project, folder, image, or shapefile not found |
| `409` | Conflict, usually project already exists |
| `500` | Unexpected backend error |
| `503` | Service unavailable, most often due to missing or failed model initialization |