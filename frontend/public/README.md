# Path Safety Assessment Tool — Documentation

> **PSAT Developer & User Guide** | Updated March 2026

---

## What is PSAT?

The **Path Safety Assessment Tool (PSAT)** is an internal web application for assessing the safety of cycling infrastructure using the **CycleRAP v2.11** risk-scoring methodology. It assists planners, engineers and safety analysts in:

- Ingesting street-level photographs of cycling facilities (footpaths, cycling paths, shared roads, etc.)
- Automatically coding safety-relevant attributes from images using computer-vision (CV) models, GIS infrastructure layer mapping and logit-based models.
- Manually reviewing and correcting auto-coded attributes in an interactive table + map view
- Running the CycleRAP risk-scoring algorithm to produce **BB, BP, SB, and VB** risk scores
- Applying treatment recommendations and evaluating their projected effect on risk scores
- Visualising results on an interactive map and exporting filtered images

**Primary users:** Transport engineers and road-safety analysts performing field surveys or desktop audits of cycling networks.

---

## Table of Contents

| Document | Description |
|---|---|
| [Installation](docs/installation.md) | Prerequisites, folder setup, model files, and running via Docker |
| [Architecture](docs/architecture.md) | System structure, data flow, and key design decisions |
| [API Reference](docs/api-reference.md) | Every endpoint: method, path, request/response schema, and edge cases |
| [CV / ML Pipeline](docs/cv-pipeline.md) | How images are ingested, preprocessed, and auto-coded |
| [Scoring Logic](docs/scoring.md) | CycleRAP risk scoring, the 41 attribute fields, and risk bands |
| [Frontend](docs/frontend.md) | UI structure, pages, and key user flows |
| [Common Issues](docs/common-issues.md) | Setup problems and their fixes |
| [Contributing](docs/contributing.md) | Branch and contribution conventions (placeholder) |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/LinXH8/PathSafetyAssessmentTool.git
cd PathSafetyAssessmentTool

# 2. Create the input folder BEFORE running Docker
mkdir in

# 3. Copy models and shapefiles from the SSD into backend/
#    backend/models/      ← YOLO .pt files (path_seg.pt, etc.)
#    backend/shapefiles/  ← GIS shapefiles

# 4. Build and run
docker compose up --build
```

Once running:
- **Frontend (UI):** http://localhost
- **Backend API:** http://localhost:8000/api

---

## Repository Layout

```
PathSafetyAssessmentTool/
├── backend/                        # Flask API server (Python 3.11)
│   ├── app/
│   │   ├── api/
│   │   │   ├── health.py           # /api/ping and /api/health
│   │   │   └── projects/
│   │   │       └── routes.py       # All /api/projects/* endpoints
│   │   ├── services/
│   │   │   ├── prediction.py       # CV / YOLO inference (CycleRAP_Coding_Helper)
│   │   │   ├── cyclerap_scoring.py # Native Python CycleRAP v2.11 scoring
│   │   │   ├── project_manager.py  # Project & version management (ProjectVersion, Project)
│   │   │   ├── serializer.py       # Data models, mappings, CSV/GPKG I/O
│   │   │   ├── cycleRAP_interface.py # CycleRAP Excel COM interface (legacy/optional)
│   │   │   ├── cycleRAP_VA.py      # GPS → GeoDataFrame helpers
│   │   │   ├── gis_mapping.py      # GIS layer + shapefile helpers
│   │   │   ├── platform_compat.py  # pywin32 compatibility shim
│   │   │   └── global_var.py       # Field name constants & enum mappings
│   │   ├── config.py
│   │   └── __init__.py             # create_app() factory
│   ├── app.py                      # Flask entry point
│   ├── models/          ← NOT in repo; copy from SSD
│   ├── shapefiles/      ← NOT in repo; copy from SSD
│   └── requirements.txt
├── frontend/                       # React + TypeScript SPA
│   ├── src/
│   │   ├── api/index.ts            # Typed API client (all fetch calls)
│   │   ├── pages/                  # Page-level components
│   │   │   ├── LandingPage/
│   │   │   ├── Projects/           # Project list & management
│   │   │   ├── CodingPage/         # Main coding + map + image viewer
│   │   │   ├── TreatmentPage/      # Treatment recommendations
│   │   │   ├── PathAnalysisPage/   # Autocode validation view
│   │   │   └── CreateProjectPage/  # New project wizard
│   │   ├── components/             # Shared UI components
│   │   └── App.tsx                 # React Router routes
│   ├── Dockerfile                  # Multi-stage: Node build → nginx
│   └── nginx.conf                  # Reverse-proxy /api/ → backend:8000
├── docs/                           # Developer & user documentation
├── data/                           # Persisted project data (Docker bind-mount)
├── in/                             # Input image folders (Docker bind-mount)
├── backend.Dockerfile              # Backend Docker image
└── docker-compose.yml              # Orchestrates backend + frontend
```
