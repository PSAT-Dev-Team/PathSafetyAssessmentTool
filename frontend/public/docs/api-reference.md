# API Reference

All endpoints are prefixed with `/api/`.

- Direct backend base URL: `http://localhost:8000/api`
- Through the frontend: `http://localhost/api`

This mirrored help copy covers the same current API surface as the repository documentation.

## Health

### `GET /api/ping`

```json
{ "status": "ok" }
```

### `GET /api/health`

```json
{ "status": "ok" }
```

## Main project endpoints

- `GET /api/projects`
- `GET /api/projects/<project_name>`
- `GET /api/projects/<project_name>/metadata`
- `PATCH /api/projects/<project_name>`
- `DELETE /api/projects/<project_name>`
- `GET /api/projects/<project_name>/versions/latest/attributes`
- `PUT /api/projects/<project_name>/attributes`
- `GET /api/projects/<project_name>/geodata`
- `GET /api/projects/<project_name>/results`
- `POST /api/projects/<project_name>/score`
- `GET /api/projects/<project_name>/images/<path:filename>`

Project list responses now include:

- `dataset`
- `source_folders`
- `verified_segment_count`
- `autocoded_segment_count`
- `total_segments`

## Project creation and road selection

- `GET /api/projects/folders`
- `POST /api/projects/folders`
- `POST /api/projects/folders/upload-images`
- `POST /api/projects/roads-in-polygon`
- `GET /api/projects/roads-in-bounds`
- `GET /api/projects/planning-areas-in-bounds`

`POST /api/projects/folders` supports both:

- single-folder creation with `folder_name`
- multi-folder creation with `folder_names`
- optional polygon filtering with `polygon`

## Coding, autocode, and validation

- `GET /api/projects/attribute-mappings`
- `POST /api/projects/<project_name>/autocode/image`
- `POST /api/projects/<project_name>/autocode/gis`
- `POST /api/projects/<project_name>/autocode/all`
- `GET /api/projects/<project_name>/autocode-metadata`
- `POST /api/projects/<project_name>/autocode-metadata`
- `GET /api/projects/<project_name>/baseline/exists`
- `GET /api/projects/<project_name>/baseline`
- `POST /api/projects/<project_name>/baseline`
- `POST /api/projects/<project_name>/curvature/visualize`
- `POST /api/projects/<project_name>/width/visualize`
- `POST /api/projects/<project_name>/gis/layers`
- `POST /api/projects/<projectName>/gis/detect`

## Segment management and exports

- `DELETE /api/projects/<project_name>/segments/<segment_index>`
- `POST /api/projects/<project_name>/segments/delete-batch`
- `POST /api/projects/check-collisions`
- `POST /api/projects/copy-segments`
- `POST /api/projects/download-images`

## Treatment endpoints

- `POST /api/projects/<project_name>/treatments/preview`
- `POST /api/projects/<project_name>/treatments/apply`
- `GET /api/projects/<project_name>/treatments/segment/<segment_index>`
- `GET /api/projects/<project_name>/treatments/all`
- `POST /api/projects/<project_name>/treatments/apply-all`
- `POST /api/projects/<project_name>/treatments/apply-specific`
- `POST /api/projects/<project_name>/treatments/reset-all`
- `POST /api/projects/<project_name>/treatments/save`
- `POST /api/projects/<project_name>/treatments/effectiveness`
- `GET /api/projects/<project_name>/treatments/effectiveness/segment/<segment_index>`

## Shapefile management endpoints

- `GET /api/shapefiles`
- `GET /api/shapefiles/categories`
- `POST /api/shapefiles/geojson`
- `POST /api/shapefiles/validate`
- `POST /api/shapefiles/preview-upload`
- `POST /api/shapefiles/upload`
- `POST /api/shapefiles/validate-replacement`
- `PUT /api/shapefiles/replace`
- `DELETE /api/shapefiles/<path:shapefile_path>`

## Common status codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request |
| `404` | Project, folder, image, or shapefile not found |
| `409` | Conflict, usually project already exists |
| `500` | Unexpected backend error |
| `503` | Service unavailable, most often due to missing or failed model initialization |