# Common Issues

This page covers the setup and workflow issues that most often block current PSAT usage.

---

## Docker

### Docker Desktop not running

**Symptom:** `docker compose up --build` fails immediately with a connection error like `error during connect: ... pipe/docker_engine: The system cannot find the file specified`.

**Fix:** Open Docker Desktop from the Start menu and wait until it shows "Docker Desktop is running" (the tray icon turns solid). Then retry.

---

### Port already in use

**Symptom:** Docker starts but the app is unreachable, or you see an error like `Bind for 0.0.0.0:80 failed: port is already allocated` or `address already in use`.

**Fix:** Another process is using port 80 or 8000. Common culprits on Windows:
- IIS (port 80) — stop it via `services.msc` or `iisreset /stop`
- Another Docker container — run `docker ps` and stop conflicting containers
- Another local web server

Alternatively, temporarily change the host ports in `docker-compose.yml`:
```yaml
ports:
  - "8080:80"    # frontend now on :8080
  - "8001:8000"  # backend now on :8001
```

---

### Container builds but health check fails

**Symptom:** `curl http://localhost:8000/api/ping` returns nothing or a connection refused error.

**Steps:**
1. Check container logs: `docker compose logs backend`
2. Look for Python import errors or missing file errors on startup
3. Most commonly caused by missing models (see below)

---

## Models and Shapefiles

### Missing model files

**Symptom:** The app starts, but auto-coding fails with an error, or the backend logs show:

```
RuntimeError: Cannot find model_dir (missing path_seg.pt). Tried:
  /app/model
  /app/models
  ...
```

**Fix:** Copy the `models/` folder from the SSD into `backend/`:
```
backend/
└── models/
    ├── path_seg.pt
    ├── off_road_bicycle_path.pt
    ├── adj_road_lane.pt
    ├── LTA_FIXEDOBSTACLE_BEST_2.pt
    ├── DevelopmentAccess_last_150epochs.pt
    ├── LTA_Dill_4_Best.pt
    └── RoadClassification_best.pt
```

Then rebuild: `docker compose up --build`.

---

### Models copied to the wrong location

**Symptom:** `path_seg.pt` exists on disk, but the error above still appears.

**Fix:** Models must be inside `backend/models/` (or `backend/model/`), **not** in the project root or `data/`. The backend only searches within the container's `/app` directory.

---

### Missing shapefiles

**Symptom:** GIS auto-coding or the GIS Layers page returns empty results.

**Fix:** Copy the `shapefiles/` folder from the SSD into `backend/shapefiles/`. Rebuild afterwards.

### Polygon road selection returns poor matches

**Symptom:** The Create Project map only shows planning-area fallback results or incomplete road matches.

**Fix:** Regenerate `backend/shapefiles/road_reference.csv` after updating `in/`:

```bash
cd backend
python generate_road_reference.py
```

---

## The `in/` Folder

### Folder not created before running Docker

**Symptom:** Docker creates `in/` automatically, but it's owned by `root:root`. When the app tries to write to it, a permission error occurs.

**Fix:** Create `in/` **manually** before running Docker:
```bash
# In the project root:
mkdir in
```

Docker will then mount the existing user-owned folder instead of creating a root-owned one.

---

### Images placed in the wrong location

**Symptom:** When creating a project, the source folder shows up in the dropdown but project creation fails with a geometry error, or the project is created with 0 segments.

**Fix:** Images must be inside a **subfolder** of `in/`, not directly in `in/` itself:

```
# CORRECT
in/
└── FernvaleSurvey/
    ├── IMG_001.jpg
    └── IMG_002.jpg

# WRONG — images directly in in/
in/
├── IMG_001.jpg
└── IMG_002.jpg
```

---

### Images have no GPS EXIF data

**Symptom:** Project creation fails with an error like `Missing 'geometry' after geocoding` or the project is created with 0 segments.

**Cause:** PSAT extracts GPS coordinates from JPEG EXIF metadata. Images without GPS tags (e.g., scanned photos, screenshots, or images stripped of EXIF) cannot be georeferenced automatically.

**Fix:** Ensure images were captured on a GPS-enabled device (e.g., GoPro with GPS enabled, or a smartphone with location services on). If GPS data is missing, segments cannot be created automatically.

---

## Project Names

### Underscore in project name

**Symptom:** Project creation returns HTTP 400 with message: `Project name cannot contain underscores (_)`.

**Fix:** Remove underscores from the project name. Use spaces, hyphens, or camel case:
- ❌ `Fernvale_Survey`
- ✅ `Fernvale Survey`
- ✅ `FernvaleSurvey`
- ✅ `Fernvale-Survey`

This is a hard constraint enforced in `routes.py`. The error message from the UI may not make this obvious, so double-check the name before submitting.

---

### Project already exists

**Symptom:** `POST /api/projects/folders` returns HTTP 409.

**Fix:** A project with that name already exists in `data/`. Either choose a different name or delete the existing project from the Projects page first.

---

## Git / Windows

### Line ending issues in Docker container

**Symptom:** The Docker container fails to start with a shell error like `$'\r': command not found` or `exec format error`.

**Cause:** Git on Windows may be configured with `autocrlf=true`, which converts Unix line endings (`LF`) to Windows line endings (`CRLF`) in shell scripts. These scripts then fail inside the Linux container.

**Fix:** Set `autocrlf` to `false` **before cloning**:
```bash
git config --global core.autocrlf false
```

If you've already cloned, re-clone the repository after changing the setting.

---

### GitHub Desktop clone option not found

**Symptom:** Pressing `Ctrl + Shift + O` opens "Add Repository" instead of "Clone Repository".

**Fix:** Use **File → Clone Repository** from the menu bar instead.

---

## Scoring

### Scores not updating after editing attributes

**Symptom:** You edit attributes and save, but the scores shown in the results panel appear stale.

**Cause:** The `PUT /api/projects/<name>/attributes` endpoint recalculates and saves scores automatically. If it failed silently, the scores file (`results.csv`) may not have been updated.

**Fix:**
1. Check the backend logs for any scoring errors: `docker compose logs backend`
2. Manually trigger re-scoring by clicking the **Score** button in the UI, which calls `POST /api/projects/<name>/score` directly.

---

### Scores all show 0 or identical values

**Cause:** This can happen if attribute values were saved as strings instead of integers. The scoring algorithm uses integer keys to look up risk factors; string keys will miss the lookup and default to 1.0.

**Fix:** The `PUT /api/projects/<name>/attributes` endpoint calls `_convert_attribute_types()` to coerce types before scoring. If you are posting directly to the API (e.g. via `curl`), ensure all enum attribute values are sent as **integers**, not strings.

---

## Performance

### First auto-code request is very slow

**Cause:** YOLO models are loaded lazily on the first CV request. Loading 7 models from disk takes 10–30 seconds on first use.

**Expected behaviour:** Subsequent requests are fast. The models stay in memory for the lifetime of the container.

---

### Docker build is very slow on first run

**Cause:** The first build downloads the Python base image, installs all pip dependencies (including PyTorch/ultralytics), and compiles the frontend. This is normal.

**Expected build time:** 5–15 minutes on a typical office machine.  
**Subsequent builds:** Much faster (Docker layer caching).

---

## Data Recovery

### Project data missing after container restart

**Symptom:** After `docker compose down` and `docker compose up`, projects are gone.

**Cause:** The `./data/` bind mount was deleted or the `docker-compose.yml` volume section was changed.

**Fix:** Verify `docker-compose.yml` has the correct bind mounts:
```yaml
volumes:
  - ./data:/app/data
  - ./in:/app/in
```

And that `./data/` exists on the host and was not accidentally deleted.

---

### Accidentally deleted a project

**Cause:** `DELETE /api/projects/<name>` calls `shutil.rmtree()` on the project directory — this is permanent.

**Fix:** If you have a file-system backup of `./data/`, restore the project folder. Otherwise, data cannot be recovered.
