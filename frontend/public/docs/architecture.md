# Architecture Overview

PSAT is a two-container web application orchestrated by Docker Compose. The **frontend** is a React SPA served by nginx; the **backend** is a Flask REST API. They share no database — all communication is via HTTP through the `/api/*` interface.

---

## System Diagram

```
Browser
  │
  │  HTTP :80
  ▼
┌─────────────────────┐
│   nginx (frontend)  │  Serves compiled React SPA (static files)
│   Port 80           │  Reverse-proxies /api/* → backend:8000
└─────────┬───────────┘
          │  HTTP :8000
          ▼
┌─────────────────────┐
│   Flask (backend)   │  REST API, CV inference, CycleRAP scoring
│   Port 8000         │
└─────────┬───────────┘
          │
   ┌──────┴──────┐
   │             │
   ▼             ▼
./data/       ./in/
(project      (input
 storage)      images)
```

Both `./data/` and `./in/` are **bind-mounted Docker volumes**, so all project data persists between container restarts and across rebuilds.

---

## Backend Structure

The backend is a **Flask** application (`Python 3.11`) built as a package under `backend/app/`.

```
backend/
├── app.py                      # Entry point: create_app() + /api/health
├── app/
│   ├── __init__.py             # create_app() factory, CORS setup
│   ├── config.py               # Config object
│   ├── api/
│   │   ├── health.py           # GET /api/ping
│   │   └── projects/
│   │       ├── __init__.py     # Blueprint registration
│   │       └── routes.py       # All /api/projects/* endpoints (~2000 lines)
│   ├── services/
│   │   ├── prediction.py       # CV inference (CycleRAP_Coding_Helper class)
│   │   ├── cyclerap_scoring.py # Native Python CycleRAP v2.11 scoring
│   │   ├── project_manager.py  # ProjectVersion, Project, project_manager classes
│   │   ├── serializer.py       # Attributes, Results, Treatment, ProjectGeoData models
│   │   ├── cycleRAP_interface.py   # Legacy Excel COM interface (optional)
│   │   ├── cycleRAP_VA.py      # GPS EXIF extraction, geocoding, LineString building
│   │   ├── gis_mapping.py      # GIS layer queries via shapefiles
│   │   ├── platform_compat.py  # Windows/pywin32 compatibility shim
│   │   └── global_var.py       # Field name constants, enum mappings, defaults
│   └── utils/
│       └── path_width_curvature.py  # Path width & curvature measurement utils
└── src/
    └── CycleRAP/
        └── defaults.json       # CycleRAP resource path defaults
```

### Application Factory

`create_app()` in `app/__init__.py`:
1. Creates the Flask app
2. Enables CORS for all `/api/*` routes (allow all origins)
3. Registers blueprints (health + projects)
4. Returns the app

### Lazy Initialisation

On first request, `get_ctx()` in `routes.py` lazily initialises:
- `project_manager` — scans `data/` for project directories
- `serializer.data_loader` — loads attribute mapping data
- `CRI.cycleRAP_interface` — sets up the CycleRAP resource path

CV models (YOLO) are loaded separately via `_ensure_models_ready()`, also lazily on first CV request. Model load errors are **memoised** — a failed load will return HTTP 503 on all subsequent CV requests without retrying.

---

## Frontend Structure

The frontend is a **React + TypeScript** SPA built with Vite and served by nginx.

```
frontend/src/
├── api/index.ts        # All backend fetch calls (typed)
├── App.tsx             # React Router route definitions
├── pages/
│   ├── LandingPage/    # Entry / welcome screen
│   ├── Projects/       # Project list, tags, delete, edit
│   ├── CodingPage/     # Main work area: image + attributes table + map
│   ├── TreatmentPage/  # Treatment recommendations list & detail
│   ├── PathAnalysisPage/  # Autocode validation view
│   └── CreateProjectPage/ # New project wizard (folder select → create)
├── components/
│   └── visualization/
│       ├── curvature/  # Curvature overlay panel
│       ├── width/      # Path width overlay panel
│       └── scoreband/  # Per-segment score badge component
├── layouts/
│   └── AppLayout.tsx   # Shared shell (sidebar + outlet)
└── types/              # Shared TypeScript type definitions
```

The frontend communicates **exclusively** through the `/api/*` REST interface. There is no shared database, no WebSocket, and no direct file access — every read and write goes through the backend API.

### nginx Reverse Proxy

```nginx
location /api/ {
    proxy_pass http://backend:8000/api/;
}
```

This means the frontend can call `/api/projects` and nginx transparently forwards it to the Flask container. The frontend never needs to know the backend's port.

---

## Data Model

### Project Storage Layout

Each project lives as a directory under `data/`:

```
data/
└── ProjectName/
    ├── metadata.csv            # Project-level metadata (name, tags, verified status)
    ├── geo_data.gpkg           # GeoPackage with LineString segments (EPSG:3414)
    ├── images/                 # Copies of the source images
    └── versions/
        ├── 20250416/           # Snapshot from 16 Apr 2025
        │   ├── attributes.csv
        │   ├── results.csv
        │   └── treatment.csv
        └── 20250417/           # Snapshot from 17 Apr 2025
            ├── attributes.csv
            ├── results.csv
            └── treatment.csv
```

### Date-Versioned Snapshots

Every time `save_all()` is called, the backend checks whether a folder for today's date (`YYYYMMDD`) already exists under `versions/`. If not, it creates a new snapshot by copying the current state forward. **Multiple saves on the same calendar day overwrite the existing snapshot.** This means the history retains one snapshot per day, not one per save.

### Key Data Classes (`serializer.py`)

| Class | File | Description |
|---|---|---|
| `Attributes` | `attributes.csv` | The 41 CycleRAP coding fields per segment |
| `Results` | `results.csv` | BB, BP, SB, VB scores + risk bands per segment |
| `Treatment` | `treatment.csv` | Applied treatment IDs + modified attribute values |
| `ProjectGeoData` | `geo_data.gpkg` | LineString geometry + image reference per segment |
| `ProjectMetadata` | `metadata.csv` | Name, tags, dates, verified status |
| `SnapshotMetadata` | `snapshot_metadata.csv` | Coder name, coding date, status per version |

All classes extend `BaseTable`, which wraps a pandas `DataFrame` with dirty-tracking (`df_dirty` flag) and CSV/XLSX/JSON serialisation.

---

## Key Design Decisions

### API-Only Frontend Communication

The frontend never reads from disk directly. All data flows through the REST API. This means:
- The backend is the single source of truth
- Frontend and backend can be deployed independently
- CORS is enabled on the backend for all `/api/*` routes

### Excel COM Automation (Legacy / Optional)

The original CycleRAP scoring used an Excel `.xlsm` macro file via the Windows COM interface (`pywin32`). This is encapsulated in `cycleRAP_interface.py` and guarded by `platform_compat.py`:

```python
# platform_compat.py
IS_WINDOWS = platform.system() == "Windows"
if IS_WINDOWS:
    import pythoncom, win32com.client
    WINDOWS_MODULES_AVAILABLE = True
else:
    WINDOWS_MODULES_AVAILABLE = False  # Non-Windows stubs
```

**The scoring endpoint no longer uses Excel COM.** It calls `calculate_cyclerap_score_native()` in `cyclerap_scoring.py` — a pure Python port of the CycleRAP v2.11 algorithm that runs on any platform without Excel.

### CRS: EPSG:3414 (SVY21)

All geodata is stored and measured in **EPSG:3414** (Singapore SVY21 projected CRS). GPS EXIF coordinates (WGS84, EPSG:4326) are reprojected at project creation time.

### Thread Safety

Model loading is protected by a threading lock (`_INIT_LOCK`) in `routes.py`. A memoised error (`_INIT_ERR`) prevents repeated failed initialisation attempts from blocking requests. Flask is run with `threaded=True`.
