# API Reference

All endpoints are prefixed with `/api/`.

- Direct backend base URL: `http://localhost:8000/api`
- Through the frontend: `http://localhost/api`

This reference covers the current API surface that backs project creation, coding, analysis, treatments, and GIS-layer management.

## Health

### `GET /api/ping`

Liveness check.

```json
{ "status": "ok" }
```

### `GET /api/health`

Equivalent liveness check registered directly on the Flask app.

```json
{ "status": "ok" }
```

## Project listing and metadata

### `GET /api/projects`

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

### `GET /api/projects/<project_name>`

Returns the available version folders and the current latest snapshot.

```json
{
  "name": "AMK Analysis Batch",
  "versions": ["20260425", "20260429"],
  "latest": "20260429"
}
```

### `GET /api/projects/<project_name>/metadata`

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

### `PATCH /api/projects/<project_name>`

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

### `DELETE /api/projects/<project_name>`

Deletes the entire project directory.

```json
{ "ok": true, "name": "AMK Analysis Batch" }
```

## Project data

### `GET /api/projects/<project_name>/versions/latest/attributes`

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

### `PUT /api/projects/<project_name>/attributes`

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

### `GET /api/projects/<project_name>/geodata`

Returns project geometry as GeoJSON `FeatureCollection`.

### `GET /api/projects/<project_name>/results`

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

### `POST /api/projects/<project_name>/score`

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

### `GET /api/projects/<project_name>/images/<path:filename>`

Serves a project image file with path-traversal protection.

## Attribute mappings

### `GET /api/projects/attribute-mappings`

Returns label mappings for discrete coding fields.

```json
{
  "Facility Type": {
    "1": "Sidewalk",
    "2": "Multi-Use Path"
  }
}
```

## Project creation and source discovery

### `GET /api/projects/folders`

Lists subfolders under `in/`.

```json
{ "items": ["ANG MO KIO AVENUE 1", "ANG MO KIO AVENUE 8"] }
```

### `POST /api/projects/folders`

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

### `POST /api/projects/folders/upload-images`

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

### `POST /api/projects/roads-in-polygon`

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

### `GET /api/projects/roads-in-bounds`

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

### `GET /api/projects/planning-areas-in-bounds`

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

## Segment management and copying

### `DELETE /api/projects/<project_name>/segments/<segment_index>`

Deletes a single segment and its associated image reference where applicable.

### `POST /api/projects/<project_name>/segments/delete-batch`

Deletes multiple segments.

```json
{ "indices": [0, 3, 7] }
```

### `POST /api/projects/check-collisions`

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

### `POST /api/projects/copy-segments`

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

## Autocode endpoints

### `POST /api/projects/<project_name>/autocode/image`

CV auto-code for one image.

```json
{ "imageRef": "AMK_AVE_1__Cam1_0001.jpg" }
```

Response includes at least `updates` and `changed_fields`, and may also include `gradient_pct` when LAZ-derived grade data is available.

### `POST /api/projects/<project_name>/autocode/gis`

GIS auto-code for one segment.

```json
{ "coords": [[103.81, 1.35], [103.82, 1.36]] }
```

Optional field filtering is supported through a `fields` array in the request body.

### `POST /api/projects/<project_name>/autocode/all`

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

### `GET /api/projects/<project_name>/autocode-metadata`

Reads saved autocode provenance metadata.

```json
{
  "changedFieldsByRow": { "0": ["Curvature"] },
  "fieldSourcesByRow": { "0": { "Curvature": "GIS" } }
}
```

### `POST /api/projects/<project_name>/autocode-metadata`

Writes the autocode metadata JSON used by the coding page.

## Baseline endpoints

### `GET /api/projects/<project_name>/baseline/exists`

```json
{ "exists": true }
```

### `GET /api/projects/<project_name>/baseline`

Returns baseline attribute rows, or `rows: []` if none exist yet.

### `POST /api/projects/<project_name>/baseline`

Persists a baseline attribute table.

```json
{
  "rows": [
    { "Facility Type": 2 }
  ]
}
```

## Visualization and GIS-context endpoints

### `POST /api/projects/<project_name>/curvature/visualize`

Returns geometry and numeric context for the curvature visualization panel.

### `POST /api/projects/<project_name>/width/visualize`

Returns geometry and search-ring context for the width visualization panel.

### `POST /api/projects/<project_name>/gis/layers`

Returns nearby GIS features around a point for the coding map overlay.

### `POST /api/projects/<projectName>/gis/detect`

Diagnostic endpoint used to inspect nearby GIS features such as bus stops and bus lanes.

## Treatment endpoints

### `POST /api/projects/<project_name>/treatments/preview`

Preview one or more treatments for a segment without persisting.

### `POST /api/projects/<project_name>/treatments/apply`

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

### `GET /api/projects/<project_name>/treatments/segment/<segment_index>`

Returns the current treatment state for a specific segment.

### `GET /api/projects/<project_name>/treatments/all`

Returns all stored treatment states in one call. Only segments with treatments are included.

### `POST /api/projects/<project_name>/treatments/apply-all`

Applies all applicable treatments across the project.

### `POST /api/projects/<project_name>/treatments/apply-specific`

Applies one specific treatment ID across all applicable segments.

```json
{ "treatment_id": 7 }
```

### `POST /api/projects/<project_name>/treatments/reset-all`

Clears pending treatment state.

### `POST /api/projects/<project_name>/treatments/save`

Persists pending treatment edits.

### `POST /api/projects/<project_name>/treatments/effectiveness`

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

### `GET /api/projects/<project_name>/treatments/effectiveness/segment/<segment_index>`

Returns per-treatment score drops for one segment.

```json
{
  "ok": true,
  "score_drops": { "1": 4.2, "3": 0.0 }
}
```

## Image export

### `POST /api/projects/download-images`

Returns a ZIP blob containing filtered images grouped by project.

```json
{
  "projects": {
    "ProjectA": ["IMG_001.jpg"],
    "ProjectB": ["IMG_010.jpg"]
  }
}
```

## Shapefile management API

These endpoints are served from the `gis_layers` blueprint under `/api/shapefiles`.

### `GET /api/shapefiles`

Lists discovered shapefiles with metadata such as category, year, source, and relative path.

### `GET /api/shapefiles/categories`

Lists immediate shapefile categories (subdirectories).

### `POST /api/shapefiles/geojson`

Reads one shapefile and returns WGS84 GeoJSON.

```json
{ "path": "Road_name/ROADSECTIONLINE.shp", "max_features": 10000 }
```

### `POST /api/shapefiles/validate`

Validates an uploaded ZIP before import.

### `POST /api/shapefiles/preview-upload`

Returns temporary GeoJSON preview data for uploaded shapefile files without saving them.

### `POST /api/shapefiles/upload`

Uploads one or more shapefile assets or ZIPs into a category.

Multipart fields:

- `files`
- optional `category`

### `POST /api/shapefiles/validate-replacement`

Checks whether an uploaded replacement is compatible with an existing layer.

```json
{
  "new_file_path": "temp/new.shp",
  "target_file_path": "Road_name/ROADSECTIONLINE.shp",
  "layer_name": "road_sections"
}
```

### `PUT /api/shapefiles/replace`

Copies uploaded files over target shapefiles and writes `.bak` backups where applicable.

```json
{
  "replacements": [
    { "uploaded_path": "temp/new.shp", "target_path": "Road_name/ROADSECTIONLINE.shp" }
  ]
}
```

### `DELETE /api/shapefiles/<path:shapefile_path>`

Deletes a shapefile and its companion files.

## Common status codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request |
| `404` | Project, folder, image, or shapefile not found |
| `409` | Conflict, usually project already exists |
| `500` | Unexpected backend error |
| `503` | Service unavailable, most often due to missing or failed model initialization |