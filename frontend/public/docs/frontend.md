# Frontend

The PSAT frontend is a React + TypeScript SPA built with Vite and served by nginx. It talks to the Flask backend only through `/api/*` requests.

## Route map

| URL pattern | Component | Purpose |
|---|---|---|
| `/` | `LandingPage` | Entry screen |
| `/help` | `HelpPage` | In-app user and developer guide |
| `/home` | `Projects` | Project listing and management |
| `/coding/:projectNames` | `CodingPage` | Main coding workspace for one or more projects |
| `/treatment` | `TreatmentPage` | Project picker for treatment workflows |
| `/treatment/:projectName` | `TreatmentDetailPage` | Treatment detail for one or more selected projects |
| `/analysis/path` | `PathAnalysisPage` | Multi-project analysis and export workspace |
| `/projects/create` | `CreateProjectPage` | Project creation wizard |
| `/gis-layers` | `GisLayersPage` | GIS layer browser and management page |

## Current page behavior

### Projects

- fuzzy search by project or road
- tag filtering and richer sorting
- multi-select navigation into coding, analysis, and treatment flows
- rename, tag editing, and delete actions

### Create Project

- single-folder creation
- polygon-based multi-road creation
- planning-area selection on the map
- local availability checks for selected roads

### Coding

- multi-project sessions
- CV and GIS autocode
- baseline comparison and autocode metadata
- curvature and width visualizations
- GIS overlay context on the map

### Path Analysis

- multi-project load and filter workflow
- charts and aggregated score views
- CSV table export
- filtered image ZIP export

### Treatment

- project-wide and per-segment treatment workflows
- ranking by treatment effectiveness
- apply, reset, and save actions

### GIS Layers

- list and preview shapefiles
- upload, validate, replace, and delete GIS layers

## Supporting implementation details

- the Help page reads markdown from `frontend/public/docs/`
- shared fuzzy matching lives in `src/utils/projectSearch.ts`
- all backend calls are centralized in `src/api/index.ts`