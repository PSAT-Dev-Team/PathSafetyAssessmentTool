# API Reference

All endpoints are prefixed with `/api/`. The backend runs on port `8000`; when accessed through the frontend container the nginx reverse proxy handles routing transparently.

**Base URL (direct):** `http://localhost:8000/api`  
**Base URL (via frontend):** `http://localhost/api`

---

## Health

### `GET /api/ping`

Returns a liveness check. Use to verify the backend is running.

**Response**
```json
{ "status": "ok" }
```

---

### `GET /api/health`

Identical liveness check, registered directly on the Flask app (not the Blueprint).

**Response**
```json
{ "status": "ok" }
```

---

## Projects

### `GET /api/projects`

List all projects with metadata.

**Response**
```json
{
  "projects": [
    {
      "name": "FernvaleSurvey",
      "tags": ["completed", "pedestrian"],
      "verified": false,
      "verified_segment_count": 0,
      "autocoded_segment_count": 12,
      "total_segments": 45,
      "date_created": "2025-04-16T09:30:00",
      "last_updated": "2025-04-17T14:22:11"
    }
  ]
}
```

---

### `GET /api/projects/<name>`

Get project details and available version dates.

**Response**
```json
{
  "name": "FernvaleSurvey",
  "versions": ["20250416", "20250417"],
  "latest": "20250417"
}
```

**Errors**
- `404` — project not found

---

### `GET /api/projects/<name>/metadata`

Get detailed project metadata including verification status.

**Response**
```json
{
  "name": "FernvaleSurvey",
  "tags": ["completed"],
  "verified": false,
  "verified_segment_count": 0,
  "autocoded_segment_count": 12,
  "date_created": "2025-04-16T09:30:00",
  "last_updated": "2025-04-17T14:22:11"
}
```

---

### `PATCH /api/projects/<name>`

Update project metadata (name, tags, verified status, segment counts).

**Request body** (all fields optional)
```json
{
  "new_name": "FernvaleCompleted",
  "tags": ["verified", "bicycle"],
  "verified": true,
  "verified_segment_count": 45,
  "autocoded_segment_count": 12
}
```

**Response**
```json
{
  "ok": true,
  "name": "FernvaleCompleted",
  "tags": ["verified", "bicycle"],
  "verified": true
}
```

**Errors**
- `404` — project not found

---

### `DELETE /api/projects/<name>`

Permanently delete a project and all its data.

**Response**
```json
{ "ok": true, "name": "FernvaleSurvey" }
```

**Errors**
- `404` — project not found

---

### `GET /api/projects/<name>/versions/latest/attributes`

Fetch the latest coded attributes for all segments.

If scoring results exist, the response also includes merged **band columns** (`VB Band`, `BB Band`, `SB Band`, `BP Band`, `Overall Risk Level Band`) for each row to support filtering in the UI.

**Response**
```json
{
  "rows": [
    {
      "Facility Type": 1,
      "Adjacent Road Lane 0-1m": 2,
      "Curvature": 2,
      "Road AADT": 6000,
      "VB Band": 2,
      "BB Band": 1,
      ...
    }
  ]
}
```

---

### `PUT /api/projects/<name>/attributes`

Save edited attributes for all segments. **Also recalculates and persists risk scores automatically.**

**Request body**
```json
{
  "rows": [
    { "Facility Type": 4, "Adjacent Road Lane 0-1m": 1, ... },
    ...
  ]
}
```

**Response**
```json
{ "ok": true }
```

**Behaviour:**
- Writes to the latest version's `attributes.csv`
- Calculates CycleRAP scores using `calculate_cyclerap_score_native()` and saves to `results.csv`
- If today's date folder does not exist yet, creates a new versioned snapshot

---

### `GET /api/projects/<name>/geodata`

Return the project's road segment geometry as GeoJSON.

**Response** — GeoJSON `FeatureCollection` of `LineString` features. Each feature's properties include `Image Reference`, `Road Name`, and `Distance (Metres)`.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[103.8, 1.3], [103.81, 1.31]] },
      "properties": {
        "Image Reference": "IMG_001.jpg",
        "Road Name": "Fernvale Road",
        "Distance (Metres)": 45.3
      }
    }
  ]
}
```

---

### `GET /api/projects/<name>/images/<path:filename>`

Serve a project image file. Includes path-traversal protection and conditional caching (`Cache-Control: public, max-age=86400`).

**Response** — binary image file

**Errors**
- `400` — invalid path (traversal attempt)
- `404` — image or folder not found

---

### `POST /api/projects/<name>/score`

Run CycleRAP risk scoring using the native Python implementation.

Optionally accepts modified attributes in the request body; if omitted, the latest saved attributes are used. When a single row is sent (`attributes` array of length 1), results are returned but **not saved to disk** (used for real-time score updates in the UI).

**Request body** (optional)
```json
{
  "attributes": [
    { "Facility Type": 4, "Road AADT": 8000, ... }
  ]
}
```

**Response**
```json
{
  "ok": true,
  "result_rows": [
    {
      "BB": 3.1842,
      "BB Band": 1,
      "BP": 0.0,
      "BP Band": 1,
      "SB": 8.7231,
      "SB Band": 2,
      "VB": 42.1234,
      "VB Band": 3,
      "Overall Risk Level": 54.0307,
      "Overall Risk Level Band": 3
    }
  ]
}
```

---

### `GET /api/projects/<name>/results`

Retrieve previously saved scoring results.

**Response**
```json
{
  "ok": true,
  "result_rows": [
    { "BB": 3.18, "BB Band": 1, ... }
  ]
}
```

Returns `result_rows: []` if no results have been calculated yet.

---

### `POST /api/projects/<name>/treatments`

Generate treatment recommendations using the Excel COM interface (legacy). Returns treatment suggestions based on current attributes and geodata.

**Response**
```json
{ "ok": true, "rows": [ ... ] }
```

> **Note:** The newer treatment workflow uses the attribute-level trigger logic (see below). This endpoint is maintained for compatibility.

---

### `POST /api/projects/<name>/treatments/apply`

Apply one or more treatments to a specific segment. **Saves the result to `treatment.csv`.**

**Request body**
```json
{
  "segment_index": 5,
  "treatment_ids": [1, 9, 14],
  "image_ref": "IMG_006.jpg"
}
```

**Response**
```json
{
  "ok": true,
  "segment_index": 5,
  "treatments_applied": "1,9,14",
  "modified_attributes": { "Facility Type": 4, "Light Segregation": 1, ... },
  "before_scores": { "BB": 2.5, "BP": 1.2, "SB": 3.1, "VB": 42.0, "Overall Risk Level": 48.8 },
  "after_scores":  { "BB": 1.8, "BP": 0.9, "SB": 2.2, "VB": 28.5, "Overall Risk Level": 33.4 }
}
```

**Errors**
- `400` — missing `segment_index`, invalid `treatment_ids`, or index out of range
- `400` — treatment ID must be 1–25

---

### `POST /api/projects/<name>/treatments/preview`

Preview treatment effects without saving. Identical request/response to `/apply` except nothing is written to disk.

---

### `GET /api/projects/<name>/treatments/segment/<int:segment_index>`

Get current treatment state for a specific segment.

**Response**
```json
{
  "ok": true,
  "segment_index": 5,
  "has_treatments": true,
  "treatments_applied": [1, 9, 14],
  "modified_attributes": { "Facility Type": 4, ... },
  "after_scores": { "BB": 1.8, "BP": 0.9, "SB": 2.2, "VB": 28.5, "Overall Risk Level": 33.4 }
}
```

If no treatments have been applied: `"has_treatments": false, "treatments_applied": []`.

---

### `POST /api/projects/<name>/treatments/apply-all`

Apply all applicable treatments to every segment. Results are held in memory; **not saved until the user explicitly calls `/treatments/save`.**

**Response**
```json
{
  "ok": true,
  "total_segments": 50,
  "segments_treated": 48,
  "segments_skipped": 2,
  "details": [
    {
      "segment_index": 0,
      "treatment_ids": [1, 9],
      "before_scores": { "Overall Risk Level": 48.8, ... },
      "after_scores":  { "Overall Risk Level": 33.4, ... }
    }
  ]
}
```

---

### `POST /api/projects/<name>/treatments/reset-all`

Clear all applied treatments for all segments. **Not saved until `/treatments/save` is called.**

**Response**
```json
{
  "ok": true,
  "total_segments": 50,
  "segments_reset": 48,
  "message": "All treatments have been reset"
}
```

---

### `POST /api/projects/<name>/treatments/save`

Persist all pending treatment changes to `treatment.csv`.

**Response**
```json
{ "ok": true, "message": "Treatments saved successfully" }
```

---

### `DELETE /api/projects/<name>/segments/<int:segment_index>`

Delete a single segment by index (0-based). Also deletes the associated image file.

**Response**
```json
{
  "ok": true,
  "message": "Segment 5 deleted successfully",
  "remaining_segments": 44
}
```

---

### `POST /api/projects/<name>/segments/delete-batch`

Batch delete segments by a list of indices.

**Request body**
```json
{ "indices": [0, 3, 7] }
```

**Response** — updated project metadata dict

---

### `GET /api/projects/attribute-mappings`

Return enum option mappings for all discrete attribute fields.

**Response**
```json
{
  "Facility Type": {
    "1": "Sidewalk",
    "2": "Multi-Use Path",
    "3": "Off-Road Bicycle Path",
    "4": "On-road Bicycle Lane",
    "5": "Road Shoulder",
    "6": "Mixed Traffic Road Lane"
  },
  "Adjacent Road Lane 0-1m": {
    "1": "Present",
    "2": "Not Present"
  },
  ...
}
```

Continuous-value fields (`Road AADT`, `Road operating speed (mean)`) are excluded (their `CHOICES` entry is `null`).

---

### `GET /api/projects/folders`

List available subfolders in the `in/` input directory.

**Response**
```json
{ "items": ["FernvaleSurvey", "YishunSurvey"] }
```

Returns `{ "items": [] }` if the `in/` directory does not exist.

---

### `POST /api/projects/folders`

Create a new project from an existing image folder.

**Request body**
```json
{
  "project_name": "FernvaleSurvey",
  "folder_name": "FernvaleSurvey",
  "tags": ["bicycle", "urban"]
}
```

**Pipeline steps:**
1. Extracts GPS EXIF coordinates from all `.jpg`/`.jpeg` files in the folder
2. Geocodes coordinates (road name lookup) via `cycleRAP_VA.geoCode()`
3. Samples points by minimum distance (10 m) via `get_geo_points_by_distance()`
4. Converts point pairs into `LineString` geometries in EPSG:3414
5. Creates project directory under `data/`
6. Copies images into `data/<project_name>/images/`
7. Registers the project in `project_manager`

**Response**
```json
{ "ok": true, "name": "FernvaleSurvey" }
```

**Errors**
- `400` — `project_name` is empty
- `400` — `project_name` contains underscores (e.g. `"Fernvale_Survey"` is invalid)
- `400` — `folder_name` is missing
- `404` — source folder not found in `in/`
- `409` — project with that name already exists
- `500` — geocoding or geometry conversion failure

> **Constraint:** Project names **cannot contain underscores**. The underscore character is reserved internally as a path separator in some URL patterns. Use spaces, hyphens, or camel case instead.

---

### `POST /api/projects/folders/upload-images`

Upload images directly into a source folder in `in/` via multipart form upload.

**Form fields**
- `folder_name` (string) — target subfolder name in `in/`
- `images` (file[]) — one or more image files

**Allowed extensions:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tiff`, `.tif`

**Response**
```json
{
  "count": 12,
  "errors": [],
  "message": "Uploaded 12 image(s) to folder 'FernvaleSurvey'"
}
```

---

### `POST /api/projects/check-collisions`

Check whether segments from a source project would collide (duplicate image references) with an existing target project.

**Request body**
```json
{
  "sourceProject": "ProjectA",
  "targetProject": "ProjectB",
  "indices": [0, 1, 2]
}
```

**Response**
```json
{ "ok": true, "collisions": [] }
```

---

### `POST /api/projects/copy-segments`

Copy segments from one project to another.

**Request body**
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

**Response**
```json
{
  "ok": true,
  "message": "Copied 3 segments to ProjectB",
  "targetProject": "ProjectB",
  "count": 3
}
```

---

### `POST /api/projects/download-images`

Generate and download a ZIP archive of filtered images from one or more projects.

**Request body**
```json
{
  "projects": {
    "FernvaleSurvey": ["IMG_001.jpg", "IMG_003.jpg"],
    "YishunSurvey":   ["IMG_010.jpg"]
  }
}
```

**Response** — `application/zip` file download  
Filename: `filtered_images_YYYYMMDD_HHMMSS.zip`

Inside the archive:
```
FernvaleSurvey images/IMG_001.jpg
FernvaleSurvey images/IMG_003.jpg
YishunSurvey images/IMG_010.jpg
```

---

### `POST /api/projects/<name>/autocode/image`

Auto-code a single image using CV models.

**Request body**
```json
{ "imageRef": "IMG_005.jpg" }
```

**Response**
```json
{
  "updates": {
    "Facility Type": 1,
    "Adjacent Road Lane 0-1m": 2,
    "Delineation": 1
  },
  "changed_fields": ["Facility Type", "Delineation"]
}
```

**Errors**
- `503` — CV models not initialised (missing model files)

---

### `POST /api/projects/<name>/autocode/gis`

Auto-code a segment using GIS / shapefile data.

**Request body**
```json
{ "coords": [[103.81, 1.35], [103.82, 1.36]] }
```

**Response**
```json
{
  "updates": {
    "Road AADT": 12000,
    "Area type": 1
  },
  "changed_fields": ["Road AADT", "Area type"]
}
```

---

### `POST /api/projects/<name>/autocode/all`

Auto-code all or selected segments. Supports three modes via payload shape.

**Payload options:**

| Mode | Shape | Description |
|---|---|---|
| Single | `{ "imageRef": "...", "coords": [...], "index": 0 }` | One segment |
| All | `{ "all": true, "save": false }` | All segments |
| Selected | `{ "indices": [0, 3], "save": false }` | Specific segments |

**Response** (bulk modes)
```json
{
  "ok": true,
  "updated_rows": [
    { "index": 0, "updates": { "Facility Type": 1 }, "sources": { "Facility Type": "CV" } }
  ],
  "errors": []
}
```

When `save: true`, the updated attributes are written to `attributes.csv` immediately.

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request (invalid input, constraint violation) |
| `404` | Not found (project, segment, image, folder) |
| `409` | Conflict (project already exists) |
| `500` | Internal server error (unexpected exception) |
| `503` | Service unavailable (CV models not loaded) |
