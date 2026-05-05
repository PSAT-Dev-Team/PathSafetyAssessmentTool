# Path Safety Assessment Tool (PSAT)

> PSAT Developer & User Guide | Updated April 2026

## What PSAT does

The **Path Safety Assessment Tool (PSAT)** is an internal web application for assessing cycling and active-mobility corridors with the **CycleRAP v2.11** methodology. It combines image-driven coding, GIS lookups, manual review, scoring, and treatment testing in one workflow.

PSAT is used to:

- turn geotagged survey images into segment-based project data
- auto-code attributes with CV models, GIS rules, and gradient profiles
- review and correct coding in a synchronized image-table-map workspace
- calculate **BB**, **BP**, **SB**, and **VB** risk scores plus overall risk bands
- analyze one or more projects together with filters, charts, and exports
- test treatments and compare before/after risk outcomes
- inspect and manage the GIS layers that power the coding rules

## Recent additions covered by this refresh

- multi-road project creation from a drawn polygon or selected planning area
- fuzzy project search that also matches source road names
- persisted project provenance via `dataset` and `source_folders`
- dedicated GIS Layers page with upload, preview, replace, and delete flows
- baseline and autocode-metadata storage used by validation workflows
- treatment-effectiveness ranking for both project-wide and per-segment views

## Documentation

| Document | Description |
|---|---|
| [Installation](docs/installation.md) | Local setup, required assets, and Docker / non-Docker run modes |
| [Architecture](docs/architecture.md) | Application structure, storage model, and key backend/frontend design decisions |
| [API Reference](docs/api-reference.md) | Current REST endpoints, payloads, and response shapes |
| [CV / ML Pipeline](docs/cv-pipeline.md) | Image ingestion, model loading, and auto-coding pipeline details |
| [Scoring Logic](docs/scoring.md) | CycleRAP scoring inputs, mappings, and risk-band behavior |
| [Frontend](docs/frontend.md) | Route map, page behavior, and client-side data flow |
| [Common Issues](docs/common-issues.md) | Setup, GIS, and project-creation troubleshooting |
| [Contributing](docs/contributing.md) | Team conventions and contribution notes |

> The in-app **Help** page loads mirrored markdown from `frontend/public/docs/`. When you update docs in `docs/`, resync the mirrored copies as well.

## Quick start

```bash
# 1. Clone the repository
git clone https://github.com/LinXH8/PathSafetyAssessmentTool.git
cd PathSafetyAssessmentTool

# 2. Create the input folder before Docker creates it for you
mkdir in

# 3. Copy required assets into backend/
#    backend/models/      -> YOLO .pt files
#    backend/shapefiles/  -> GIS shapefiles

# 4. Build and run
docker compose up --build
```

Once running:

- **Frontend:** http://localhost
- **Backend API:** http://localhost:8000/api

## Repository layout

```text
PathSafetyAssessmentTool/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health.py                # /api/ping and /api/health
│   │   │   ├── gis_layers/routes.py     # /api/shapefiles/* endpoints
│   │   │   └── projects/routes.py       # Core /api/projects/* API surface
│   │   ├── services/
│   │   │   ├── prediction.py            # CV inference and bulk autocode helpers
│   │   │   ├── cyclerap_scoring.py      # Native CycleRAP scoring
│   │   │   ├── project_manager.py       # Project and snapshot lifecycle
│   │   │   ├── serializer.py            # Project metadata / CSV / GPKG serialization
│   │   │   ├── cycleRAP_VA.py           # GPS extraction and LineString generation
│   │   │   └── gis_mapping.py           # GIS lookups, width, and curvature logic
│   ├── generate_road_reference.py       # Builds shapefiles/road_reference.csv
│   ├── models/                          # External CV model files
│   ├── shapefiles/                      # External GIS layers and road reference CSV
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   ├── README.md                    # Help-page overview copy of this README
│   │   └── docs/                        # In-app mirrored markdown docs
│   ├── src/
│   │   ├── api/index.ts                # Typed fetch helpers
│   │   ├── layouts/AppLayout.tsx       # Shared shell + sidebar
│   │   ├── pages/
│   │   │   ├── CreateProjectPage/      # Single-folder and polygon-based creation
│   │   │   ├── CodingPage/             # Main coding workspace
│   │   │   ├── GisLayersPage/          # GIS layer browser / manager
│   │   │   ├── HelpPage/               # In-app user and developer guide viewer
│   │   │   ├── PathAnalysisPage/       # Multi-project analysis workspace
│   │   │   ├── Projects/               # Project listing and management
│   │   │   └── TreatmentPage/          # Treatment overview and detail views
│   │   └── utils/projectSearch.ts      # Shared project-or-road fuzzy matcher
├── docs/                               # Canonical markdown docs for developers
├── data/                               # Persisted project storage
├── in/                                 # Source image folders used to build projects
├── backend.Dockerfile
└── docker-compose.yml
```
