# Architecture Overview

PSAT is a two-container application orchestrated by Docker Compose. The frontend is a React SPA served by nginx, and the backend is a Flask API that owns project storage, GIS lookups, CV inference, scoring, and treatment logic. There is **no database**; the file system under `data/`, `in/`, and `backend/shapefiles/` is the source of truth.


## Table of Contents

- [System diagram](#system-diagram)
- [High-level flow](#high-level-flow)
- [Backend structure](#backend-structure)
  - [Registered blueprints](#registered-blueprints)
  - [Lazy initialization](#lazy-initialization)
  - [GIS caches and helper assets](#gis-caches-and-helper-assets)
- [Frontend structure](#frontend-structure)
- [Project storage model](#project-storage-model)
  - [`project_metadata.json`](#project-metadata-json)
  - [Snapshot behavior](#snapshot-behavior)
  - [Sidecar directories](#sidecar-directories)
- [Project creation pipeline](#project-creation-pipeline)
- [Multi-project aggregation pattern](#multi-project-aggregation-pattern)
- [Shapefile management architecture](#shapefile-management-architecture)
- [Key design choices](#key-design-choices)
  - [API-only frontend communication](#api-only-frontend-communication)
  - [Native scoring path](#native-scoring-path)
  - [CRS handling](#crs-handling)
  - [Thread safety](#thread-safety)


## System diagram

```text
Browser
  |
  | HTTP :80
  v
+-----------------------+
| nginx / Vite frontend |
| - serves SPA          |
| - serves help docs    |
| - proxies /api/*      |
+-----------+-----------+
            |
            | HTTP :8000
            v
+-----------------------+
| Flask backend         |
| - projects API        |
| - shapefiles API      |
| - CV + GIS logic      |
| - scoring + treatments|
+-----+-----------+-----+
      |           |      |
      v           v      v
   ./data/      ./in/  backend/shapefiles/
```

Docker bind-mounts `./data/` and `./in/`, so project data and source image folders survive rebuilds and restarts.

## High-level flow

1. The user creates or selects a project in the frontend.
2. The frontend calls `/api/projects/*` and `/api/shapefiles/*` as needed.
3. The backend loads project metadata, geodata, snapshot CSVs, shapefiles, and models lazily.
4. Coding, analysis, and treatment flows mutate the latest snapshot and persist derived artifacts such as scores, baselines, and autocode metadata.
5. The frontend rehydrates the updated data through normal REST reads.

## Backend structure

```text
backend/
├── app.py
├── app/
│   ├── __init__.py
│   ├── api/
│   │   ├── health.py               # /api/ping, /api/health
│   │   ├── gis_layers/routes.py    # /api/shapefiles/*
│   │   └── projects/routes.py      # /api/projects/*
│   ├── services/
│   │   ├── project_manager.py
│   │   ├── serializer.py
│   │   ├── prediction.py
│   │   ├── cyclerap_scoring.py
│   │   ├── cycleRAP_VA.py
│   │   ├── gis_mapping.py
│   │   └── global_var.py
│   └── utils/
│       └── path_width_curvature.py
├── generate_road_reference.py
├── models/
└── shapefiles/
```

### Registered blueprints

- `health.py` exposes the liveness checks
- `projects/routes.py` owns project lifecycle, coding, scoring, treatment, baseline, and project-discovery endpoints
- `gis_layers/routes.py` exposes shapefile inventory, preview, upload, replace, and delete operations under `/api/shapefiles`

### Lazy initialization

`get_ctx()` in `projects/routes.py` lazily initializes and caches:

- `project_manager` over `data/`
- serializer / attribute-mapping data
- the legacy CycleRAP interface helpers where still needed

CV models are loaded separately by `_ensure_models_ready()`. Initialization failures are memoized so repeated requests fail fast with HTTP 503 rather than repeatedly blocking on model load.

### GIS caches and helper assets

The backend also caches GIS layers and project-level gradient/profile lookups. One new helper asset is:

- `backend/shapefiles/road_reference.csv` - sampled EXIF points per road folder, used by the polygon road-selection flow

That CSV is optional, but when present it lets the create-project map show which intersecting roads actually have local image folders.

## Frontend structure

```text
frontend/
├── public/
│   ├── README.md
│   └── docs/
├── src/
│   ├── api/index.ts
│   ├── App.tsx
│   ├── layouts/AppLayout.tsx
│   ├── pages/
│   │   ├── CreateProjectPage/
│   │   ├── CodingPage/
│   │   ├── GisLayersPage/
│   │   ├── HelpPage/
│   │   ├── PathAnalysisPage/
│   │   ├── Projects/
│   │   └── TreatmentPage/
│   ├── components/
│   └── utils/projectSearch.ts
```

Two frontend details are easy to miss but now matter architecturally:

- `frontend/public/docs/` contains the markdown actually served in the Help page
- `utils/projectSearch.ts` centralizes the project-or-road fuzzy matching used across multiple pages

## Project storage model

Each project lives under `data/<ProjectName>/`.

```text
data/
└── ProjectName/
    ├── project_metadata.json
    ├── geo_data.gpkg
    ├── images/
    ├── autocode/
    │   └── ProjectName_metadata.json
    ├── baseline/
    │   └── ProjectName_baseline.csv
    └── versions/
        └── YYYYMMDD/
            ├── snapshot_metadata.csv
            ├── attributes.csv
            ├── results.csv
            └── treatment.csv
```

### `project_metadata.json`

> **Recent Addition:** Persisted project provenance via `dataset` and `source_folders`.

The metadata model now carries more than name and tags. Relevant fields include:

- `project_name`
- `dataset`
- `source_folders`
- `tags`
- `path_key`
- `verified`
- `verified_segment_count`
- `autocoded_segment_count`
- `date_created`
- `last_updated`

`dataset` is a single source-folder name for legacy / single-folder projects, or `MULTI_FOLDER_SELECTION` for projects created from multiple folders. `source_folders` is the durable provenance field used by fuzzy search and by newer UI flows.

### Snapshot behavior

Version folders are date-based (`YYYYMMDD`). Multiple saves on the same day update the same dated snapshot rather than creating many sub-daily versions.

### Sidecar directories

> **Recent Addition:** Baseline and autocode-metadata storage used by validation workflows.

Two newer sidecar directories support analysis workflows:

- `baseline/` stores the attribute baseline used by autocode validation comparisons
- `autocode/` stores changed-field and field-source metadata for the coding UI

## Project creation pipeline

Project creation still starts from geotagged source images in `in/`, but it now supports both single-folder and multi-folder/polygon flows.

Backend steps:

1. enumerate one or more source folders
2. extract EXIF GPS data from images
3. optionally filter nodes by a selection polygon
4. geocode and sample points at the project-creation stage
5. convert sampled points to LineStrings
6. copy images into the project image store
7. create metadata, geodata, and the initial dated snapshot

When multiple source folders are merged, copied image names are namespaced so duplicate filenames do not collide.

## Multi-project aggregation pattern

Several frontend pages load multiple projects into one combined view. The usual pattern is:

- concatenate attributes, results, and geodata into global arrays
- keep a `projectMap` of project name, start index, and count
- resolve UI actions back to `{ projectName, localIndex }` when saving, deleting, or treating a row

This pattern is especially important in coding, treatment, and path-analysis views.

## Shapefile management architecture

The GIS Layers page is backed by the `gis_layers` blueprint. That blueprint:

- scans `backend/shapefiles/`
- groups layers by category (subdirectory)
- can return a selected shapefile as WGS84 GeoJSON
- validates uploaded ZIPs and replacement files
- supports upload, preview, replace, and delete operations

This means the same layer inventory drives both:

- the GIS Layers admin page
- the backend GIS mapping logic used during coding

## Key design choices

### API-only frontend communication

The frontend never reads the filesystem directly. Every read/write goes through REST endpoints, which keeps all storage rules and migration logic on the backend.

### Native scoring path

The current score endpoint uses `calculate_cyclerap_score_native()` instead of Excel COM. Legacy Excel helpers still exist, but native Python scoring is the main path.

### CRS handling

Source image GPS is read in WGS84 (`EPSG:4326`). Stored project geodata is written in Singapore SVY21 (`EPSG:3414`) so geometric distance and width/curvature operations behave sensibly.

### Thread safety

Model loading is protected by a lock and cached error state, which avoids repeated slow failures under concurrent requests.
