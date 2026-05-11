# Path Safety Assessment Tool (PSAT)

> Developer & User Guide — May 2026

## Overview

The **Path Safety Assessment Tool (PSAT)** is a web application for assessing cycling and active-mobility corridors using the **CycleRAP v2.11** methodology. It brings together image-based auto-coding, GIS spatial lookups, manual review, risk scoring, treatment testing, and multi-project analysis in one unified workflow.

PSAT is used to:

- ingest geotagged survey images and build segment-based projects
- auto-code CycleRAP attributes using CV models, GIS spatial rules, and gradient profiles
- review and correct coding in a synchronized image–table–map workspace
- calculate **BB**, **BP**, **SB**, and **VB** risk scores and overall risk bands per segment
- analyse one or more projects together with filters, charts, and CSV exports
- explore and rank safety treatments with before/after score comparisons
- manage the GIS layers that power spatial auto-coding rules

## Documentation

| Document | Contents |
|---|---|
| [Installation](docs/installation.md) | Local setup, required assets, Docker and non-Docker run modes |
| [Architecture](docs/architecture.md) | Two-container design, storage model, and key design decisions |
| [API Reference](docs/api-reference.md) | All REST endpoints with payloads and response shapes |
| [CV / ML Pipeline](docs/cv-pipeline.md) | Image ingestion, model loading, and auto-coding pipeline details |
| [Scoring Logic](docs/scoring.md) | CycleRAP scoring inputs, risk-band thresholds, and treatment list |
| [Frontend](docs/frontend.md) | Route map, page behaviour, and client-side data flow |
| [Common Issues](docs/common-issues.md) | Setup, GIS, and project-creation troubleshooting |
| [Contributing](docs/contributing.md) | Team conventions and contribution notes |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Chakra UI v3, React Router v6, Leaflet / react-leaflet |
| Backend | Python 3.11, Flask 3, Geopandas, Shapely, Fiona, PyProj |
| CV / ML | Ultralytics YOLO (`.pt` weight files), OpenCV, Pillow |
| Scoring | Pure-Python CycleRAP v2.11 (`cyclerap_scoring.py`) — no Excel or Windows COM required |
| Maps | Leaflet (frontend preview), Geopandas / STRtree (backend spatial queries) |
| Storage | File system — no database; projects stored under `data/`, images under `in/` |
| Runtime | Docker Compose (two containers: nginx + Flask/Gunicorn) |

---

## Prerequisites

### Required software

| Tool | Purpose |
|---|---|
| **Git** | Clone and update the repository |
| **Docker Desktop** | Standard local runtime (must be running before startup) |
| **Node.js 20** *(non-Docker only)* | Frontend dev server |
| **Python 3.11** *(non-Docker only)* | Backend without Docker |

### Required external assets

Two asset folders must be placed in `backend/` before CV and GIS-assisted coding will work. They are not included in the repository and must be copied from the project SSD.

| Folder | Destination | Contents |
|---|---|---|
| `models/` | `backend/models/` | YOLO `.pt` weight files for CV auto-coding |
| `shapefiles/` | `backend/shapefiles/` | GIS layers used for spatial lookups and road selection |

#### Model files

| File | Role |
|---|---|
| `path_seg.pt` | Path segmentation (main entry model) |
| `off_road_bicycle_path.pt` | Off-road bicycle path classifier |
| `adj_road_lane.pt` | Adjacent road lane distance classifier |
| `LTA_FIXEDOBSTACLE_BEST_2.pt` | Fixed obstacle and delineation segmentation |
| `DevelopmentAccess_last_150epochs.pt` | Development / property access classifier |
| `LTA_Dill_4_Best.pt` | Delineation / road marking classifier |
| `RoadClassification_best.pt` | Road type classifier |

---

## Getting started

### Option A — Docker (recommended)

```bash
git clone https://github.com/LinXH8/PathSafetyAssessmentTool.git
cd PathSafetyAssessmentTool
mkdir in
# Place backend/models/ and backend/shapefiles/ as described above
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost |
| Backend API | http://localhost:8000/api |

### Option B — Windows one-click (`Run-PSAT.bat`)

Double-click **`Run-PSAT.bat`** from the repository root. The script detects a conda `psat` environment or creates a `.venv`, installs requirements, and starts both servers.

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |

### Option C — Manual

```bash
# Backend
cd backend && pip install -r requirements.txt && python app.py

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

---

## Application pages

| Page | Route | Purpose |
|---|---|---|
| Projects | `/home` | Project listing with fuzzy search, multi-select, and management |
| Create Project | `/projects/create` | Single-folder or polygon/multi-road creation |
| Coding | `/coding/:projectNames` | Main coding workspace — image, table, map, autocode, scoring |
| Path Analysis | `/analysis/path` | Multi-project analysis, charts, CSV/image export |
| Treatment | `/treatment` | Project picker for treatment workflows |
| Treatment Detail | `/treatment/:projectName` | Apply, preview, and rank treatments by effectiveness |
| GIS Layers | `/gis-layers` | Browse, upload, replace, and delete GIS shapefiles |
| Help | `/help` | In-app documentation viewer |

---

## CV / ML pipeline summary

1. **Path segmentation** (`path_seg.pt`) — detects path area and road area
2. **Off-road bicycle classifier** — identifies off-road bicycle paths
3. **Adjacent road lane classifier** — 0–1 m or 1–3 m adjacency
4. **Fixed obstacle segmentation** (`LTA_FIXEDOBSTACLE_BEST_2.pt`) — detects obstacles, bus stops, determines facility type
5. **Development access classifier** — driveway / property access
6. **Delineation classifier** (`LTA_Dill_4_Best.pt`) — road markings

GIS auto-coding runs spatial queries for area type, facility width, road speed, pedestrian flow, and other GIS-derivable attributes.

---

## Scoring summary

Four scores per segment (CycleRAP v2.11):

| Score | Crash scenario |
|---|---|
| **BB** | Bicyclist–Bicyclist |
| **BP** | Bicyclist–Pedestrian |
| **SB** | Single Bicyclist (departure / fall) |
| **VB** | Vehicle–Bicyclist |

| Band | BB / BP / SB | VB |
|---|---|---|
| Low | < 5 | < 10 |
| Medium | 5–10 | 10–25 |
| High | 10–20 | 25–60 |
| Extreme | > 20 | > 60 |

25 predefined treatments can be previewed, applied, and ranked by effectiveness.

---

## Data persistence

| Host path | Contents |
|---|---|
| `./data/` | Project metadata, geodata, snapshots, baselines, treatment state |
| `./in/` | Source image folders |

`data/` and `in/` survive `docker compose down` and rebuilds.
