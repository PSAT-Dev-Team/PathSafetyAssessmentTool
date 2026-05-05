# Architecture Overview

PSAT is a two-container application orchestrated by Docker Compose. The frontend is a React SPA served by nginx, and the backend is a Flask API that owns project storage, GIS lookups, CV inference, scoring, and treatment logic. There is no database; the file system under `data/`, `in/`, and `backend/shapefiles/` is the source of truth.

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

## Key ideas

- projects are stored on disk, not in a database
- the backend owns project metadata, snapshots, geodata, and image references
- the frontend reads and writes everything through REST endpoints
- the Help page reads mirrored markdown from `frontend/public/docs/`
- polygon-based project creation depends on both source folders in `in/` and GIS helper assets in `backend/shapefiles/`

## Project storage

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

Important metadata fields now include `dataset`, `source_folders`, `verified_segment_count`, and `autocoded_segment_count`.

## Frontend architecture notes

- multi-project pages aggregate rows into global arrays and keep an index map back to each project
- fuzzy project search matches project name, tags, dataset, and source roads
- GIS Layers is a separate admin-style page for inspecting and updating shapefiles

## Backend architecture notes

- `projects/routes.py` owns project creation, coding, scoring, treatment, baseline, and road-selection endpoints
- `gis_layers/routes.py` owns shapefile listing, preview, upload, replace, and delete endpoints
- `gis_layer_definition.py` defines the source of truth for all required GIS columns and their source indices
- `generate_road_reference.py` builds `backend/shapefiles/road_reference.csv` for polygon road selection

## GIS Layer Definition System

The application maintains a strict schema for GIS layers to ensure compatibility with auto-coding rules.
- **Location**: `backend/app/services/gis_layer_definition.py`
- **Structure**: Each layer defines its `layer_name`, `affects_psat_attribute`, and `required_columns`.
- **Mapping Indices**: Required columns now include 1-based indices (e.g., `LU_DESC (1)`) which are used by both the backend for validation and the frontend for user guidance.