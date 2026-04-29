# Common Issues

This page focuses on the issues that show up most often in current PSAT workflows, especially around Docker setup, polygon-based project creation, and GIS-layer management.

## Docker and startup

### Docker Desktop is not running

**Symptom:** `docker compose up --build` fails immediately with a Docker pipe / connection error.

**Fix:** Start Docker Desktop and wait for it to report that the engine is running, then retry.

### Port 80 or 8000 is already in use

**Symptom:** The stack starts partially, but the frontend or backend is unreachable.

**Fix:** Stop the conflicting service or change the port mappings in `docker-compose.yml`.

### Backend health check fails after build

**Symptom:** `http://localhost:8000/api/ping` does not respond.

**Fix:** Check `docker compose logs backend` first. The most common causes are:

- missing `backend/models/`
- missing `backend/shapefiles/`
- a bad local edit that breaks imports

## Models and shapefiles

### Auto-code fails because models are missing

**Symptom:** CV auto-code returns 503 or logs show `missing path_seg.pt`.

**Fix:** Copy the shared model files into `backend/models/` and rebuild.

### GIS auto-code or GIS Layers page is empty

**Symptom:** GIS-assisted coding returns nothing, or the GIS Layers page has no usable layers.

**Fix:** Confirm the shapefile tree exists under `backend/shapefiles/` and contains the expected layer files, not just empty folders.

## `in/` folder and source images

### `in/` was created by Docker instead of manually

**Symptom:** File writes into `in/` fail or behave strangely.

**Fix:** Stop Docker, recreate `in/` manually from the host, then restart.

### Images are directly under `in/` instead of inside subfolders

**Symptom:** The folder dropdown is empty or project creation fails.

**Fix:** Put images inside subdirectories of `in/`, one folder per source road / survey batch.

### Images have no GPS EXIF data

**Symptom:** Project creation fails, or you get zero usable segments.

**Fix:** The source images must contain GPS EXIF metadata. Screenshots, stripped images, and many exported image sets will not work.

## Polygon and road selection

### Polygon selection returns planning areas instead of roads

**Symptom:** The map selection tool only returns high-level planning-area names, or the road list looks incomplete.

**Cause:** The backend falls back when it cannot get better road matches from `road_reference.csv` and road-name shapefiles.

**Fix:**

1. Make sure `backend/shapefiles/road_reference.csv` exists.
2. Regenerate it after adding or renaming folders in `in/`:

```bash
cd backend
python generate_road_reference.py
```

3. Confirm the road-name shapefiles are present under `backend/shapefiles/`.

### Selected roads are marked unavailable

**Symptom:** The Create Project page shows roads, but some are flagged as missing and block creation.

**Fix:** Those roads do not currently have matching local folders under `in/`. Either:

- add the missing source folders and images
- or deselect the unavailable roads before creating the project

### Create Project says no geotagged images were found inside the polygon

**Symptom:** `POST /api/projects/folders` returns a 400 error about no geotagged images inside the selected polygon.

**Cause:** The selected roads may exist, but none of their sampled GPS points survived the polygon filter.

**Fix:**

- redraw a larger polygon
- verify the images in those folders have GPS EXIF data
- regenerate `road_reference.csv` if the source folders changed recently

## Project metadata and search

### Searching by road name does not return the expected project

**Symptom:** The Projects, Treatment, or Path Analysis page does not surface a project when you search for a road.

**Cause:** Newer projects store `source_folders` explicitly. Older projects are reconstructed from image namespaces on a best-effort basis, which may be incomplete if images predate the multi-folder naming convention.

**Fix:** For older projects, check the actual project metadata or recreate the project if road-level provenance is critical.

### Project name cannot contain underscores

**Symptom:** Project creation returns `Project name cannot contain underscores (_)`.

**Fix:** Use spaces, hyphens, or camel case instead.

## Scoring and coding

### Scores do not update after save

**Symptom:** The attributes save succeeds but the displayed scores look stale.

**Fix:** Check backend logs for scoring errors. `PUT /api/projects/<name>/attributes` recalculates and persists scores automatically.

### First auto-code request is very slow

**Expected behavior:** The first CV request loads the YOLO models into memory. Subsequent requests are much faster.

## Documentation drift

### The repository docs were updated, but the Help page still shows old content

**Cause:** The Help page reads mirrored markdown from `frontend/public/docs/`, not directly from `docs/`.

**Fix:** Sync both locations whenever docs change.

## Data recovery

### Projects disappear after container restart

**Symptom:** `docker compose down` followed by `up` appears to lose projects.

**Fix:** Confirm that `./data:/app/data` is still present in `docker-compose.yml` and that the host `data/` directory still exists.

### A project was deleted accidentally

**Cause:** Project deletion removes the project directory recursively.

**Fix:** Restore it from a filesystem backup if available. There is no soft-delete layer.
