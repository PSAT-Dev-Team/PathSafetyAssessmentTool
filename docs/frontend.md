# Frontend

The PSAT frontend is a **React + TypeScript** single-page application (SPA) built with Vite and served by nginx. It communicates with the Flask backend exclusively through the `/api/*` REST interface.

**UI library:** [Chakra UI v3](https://chakra-ui.com)  
**Routing:** React Router v6  
**Maps:** Leaflet (via react-leaflet)  
**Build tool:** Vite

---

## Route Map

| URL pattern | Page component | Description |
|---|---|---|
| `/` | `LandingPage` | Welcome / entry screen |
| `/home` | `Projects` | Project list, management, navigation |
| `/coding/:projectNames` | `CodingPage` | Main attribute coding interface |
| `/treatment` | `TreatmentPage` | Treatment recommendations overview |
| `/treatment/:projectName` | `TreatmentDetailPage` | Per-project treatment detail |
| `/analysis/path` | `PathAnalysisPage` | Autocode validation view |
| `/projects/create` | `CreateProjectPage` | New project wizard |
| `*` | → `/home` | Catch-all redirect |

All routes except `/` are wrapped in `AppLayout`, which provides the shared sidebar navigation shell.

---

## Page Descriptions

### Landing Page (`/`)

Entry screen with a brief description of PSAT and a button to navigate to the project list. No API calls are made here.

---

### Projects (`/home`)

**Purpose:** Browse, manage, and navigate to projects.

**Key features:**
- Displays all projects as cards with name, tags, segment counts, dates, and verification status
- Sort by name, date created, or last updated (ascending/descending)
- Filter by tag using a combobox
- Delete a project (with confirmation dialog)
- Edit project name and tags via `EditProjectModal`
- Navigate to coding for one or more selected projects
- Navigate to create a new project

**API calls:**
- `GET /api/projects` — initial load and after mutations
- `DELETE /api/projects/<name>` — delete
- `PATCH /api/projects/<name>` — rename or update tags

---

### Coding Page (`/coding/:projectNames`)

**Purpose:** The primary work area. Supports one or multiple projects simultaneously (passed as a URL-encoded comma-separated list in `:projectNames`).

**Layout (three-panel grid):**

```
┌────────────────┬──────────────────────────────┬─────────────────┐
│  Image Viewer  │  Attributes Table             │  Map Panel      │
│                │  (41 fields per segment)      │  (GeoJSON +     │
│  Shows segment │                               │   Leaflet)      │
│  photograph    │  Dropdowns for enum fields    │                 │
│                │  Numbers for continuous       │  Click segment  │
│  Score badges  │  fields                       │  to navigate    │
└────────────────┴──────────────────────────────┴─────────────────┘
       ▲                   ▲                              ▲
  ImagePanel         AttributesPanel               GeoDataPanel
```

Additionally renders:
- `CurvatureVisualizationPanel` — overlays curvature detection on the image
- `WidthVisualizationPanel` — overlays path width measurement
- `SegmentScoresCard` — shows BB/BP/SB/VB scores for the current segment in real time
- `AutocodeValidation` — shows CV auto-code results before committing

**Navigation:**
- Clicking a segment in the map selects it in the table and loads its image
- Clicking a row in the table selects the corresponding map segment
- Keyboard shortcuts for next/previous segment

**Save flow:**
1. User edits attributes in the table
2. Auto-save is triggered, or user clicks **Save**
3. `PUT /api/projects/<name>/attributes` is called with all rows
4. The backend recalculates and persists scores; bands are returned and merged into the table

**Auto-code flow:**
1. User clicks **Auto-code** on a segment (or **Auto-code All**)
2. `POST /api/projects/<name>/autocode/all` is called
3. Suggested attribute updates are shown in a validation panel
4. User accepts or rejects individual field suggestions
5. Accepted changes are written back into the attributes table
6. User saves normally

**Key API calls:**
- `GET /api/projects/<name>` — project details
- `GET /api/projects/<name>/versions/latest/attributes` — attribute rows
- `GET /api/projects/<name>/geodata` — segment geometries
- `GET /api/projects/attribute-mappings` — enum option labels
- `GET /api/projects/<name>/metadata` — tags and verification status
- `PUT /api/projects/<name>/attributes` — save attributes
- `POST /api/projects/<name>/score` — calculate score (real-time single row)
- `POST /api/projects/<name>/autocode/image` — auto-code one image
- `POST /api/projects/<name>/autocode/gis` — auto-code via GIS
- `POST /api/projects/<name>/autocode/all` — batch auto-code
- `GET /api/projects/<name>/images/<filename>` — load images

---

### Treatment Page (`/treatment`)

**Purpose:** Overview of treatment recommendations across all (or selected) projects.

**Key features:**
- Select one or more projects
- View applicable treatments per segment
- Apply treatments to individual segments or all at once
- Reset all treatments
- Save applied treatments

---

### Treatment Detail Page (`/treatment/:projectName`)

**Purpose:** Per-project treatment detail with before/after score comparison.

**Key features:**
- Table of all segments with applicable treatment suggestions
- Select treatment IDs to apply to each segment
- Preview projected score improvement (before/after)
- Apply all treatments in one click
- Save / reset treatment state

**API calls:**
- `GET /api/projects/<name>/versions/latest/attributes`
- `POST /api/projects/<name>/treatments/preview`
- `POST /api/projects/<name>/treatments/apply`
- `POST /api/projects/<name>/treatments/apply-all`
- `POST /api/projects/<name>/treatments/reset-all`
- `POST /api/projects/<name>/treatments/save`
- `GET /api/projects/<name>/treatments/segment/<index>`

---

### Path Analysis Page (`/analysis/path`)

**Purpose:** Validate and review auto-coded attributes before committing them to the project.

Displays CV auto-code results side-by-side with the original image so the user can accept or reject individual field suggestions.

---

### Create Project Page (`/projects/create`)

**Purpose:** Create a new project from an image folder in `in/`.

**Flow:**
1. Enter a project name (no underscores)
2. Optionally add tags
3. Select a source folder from the dropdown (populated by `GET /api/projects/folders`)
4. Optionally upload new images directly (via drag-and-drop to `POST /api/projects/folders/upload-images`)
5. Click **Create** → calls `POST /api/projects/folders`
6. On success, redirects to the new project's coding page

**API calls:**
- `GET /api/projects/folders` — list available source folders
- `POST /api/projects/folders/upload-images` — (optional) upload images
- `POST /api/projects/folders` — create project

---

## API Client (`src/api/index.ts`)

All backend communication is centralised in a single typed module. Each function:
- Calls `fetch()` with the correct method, headers, and body
- Throws a descriptive `Error` on non-OK responses
- Returns a typed result

Key exports:

| Function | HTTP | Description |
|---|---|---|
| `ping()` | GET /api/ping | Health check |
| `fetchProjectList()` | GET /api/projects | Project list |
| `fetchProjectDetail(name)` | GET /api/projects/<name> | Versions |
| `fetchProjectMetadata(name)` | GET /api/projects/<name>/metadata | Metadata |
| `fetchProjectAttributes(name)` | GET /api/projects/<name>/versions/latest/attributes | Coding data |
| `fetchProjectGeoJSON(name)` | GET /api/projects/<name>/geodata | GeoJSON |
| `fetchAttributeMappings()` | GET /api/projects/attribute-mappings | Enum labels |
| `saveAttributes(project, rows)` | PUT /api/projects/<name>/attributes | Save coding |
| `calculateScore(project, attrs?)` | POST /api/projects/<name>/score | Full score |
| `calculateScoreForRow(project, attrs)` | POST /api/projects/<name>/score | Single-row score |
| `listSourceFolders()` | GET /api/projects/folders | Input folders |
| `createProjectFromFolder(...)` | POST /api/projects/folders | Create project |
| `deleteProject(name)` | DELETE /api/projects/<name> | Delete project |
| `updateProject(name, updates)` | PATCH /api/projects/<name> | Rename/tag |
| `deleteSegment(project, idx)` | DELETE /api/projects/<name>/segments/<idx> | Delete segment |
| `deleteSegmentsBatch(project, idxs)` | POST /api/projects/<name>/segments/delete-batch | Batch delete |
| `checkCollisions(src, tgt, idxs)` | POST /api/projects/check-collisions | Collision check |
| `copySegments(...)` | POST /api/projects/copy-segments | Copy segments |
| `autocodeImage(project, imageRef)` | POST /api/projects/<name>/autocode/image | CV auto-code |
| `autocodeGIS(project, coords)` | POST /api/projects/<name>/autocode/gis | GIS auto-code |
| `autocodeAll(project, payload)` | POST /api/projects/<name>/autocode/all | Batch auto-code |
| `downloadImages(projects)` | POST /api/projects/download-images | ZIP download |

---

## Visualisation Components

### `CurvatureVisualizationPanel`

Renders a curvature measurement overlay on top of the current segment image. Uses `api/curvatureVisualization.ts` which calls `/api/projects/<name>/width-visualization` (width/curvature analysis endpoint).

The curvature calculation uses a sliding window with a default radius of **5.0 m** (`collect_radius` parameter in `gis_mapping.py`), extended internally to **5.5 m** to capture edge geometry. Path geometry is densified at a **0.25 m** step (hardcoded) for accurate curvature detection.

The path width search uses a separate expanding-ring approach, ranging from **1.0 m to 10.0 m** in 1 m increments (hardcoded in `width_visualization.py`).

### `WidthVisualizationPanel`

Renders a path width measurement overlay. Powered by `backend/app/utils/path_width_curvature.py`.

### `SegmentScoresCard`

A compact card showing BB, BP, SB, VB, and Overall Risk Level for the currently selected segment. Scores update in real time as the user edits attributes (via single-row scoring calls).

---

## State Management

The application uses **React local state** (`useState`, `useEffect`, `useMemo`, `useRef`) — no external state management library (no Redux, Zustand, etc.). Each page owns its data and fetches it on mount. Shared state (e.g., the currently selected segment index) is passed via props or React context where needed.

---

## nginx Configuration

The frontend container uses nginx to:
1. Serve the compiled React SPA from `/usr/share/nginx/html`
2. Handle client-side routing: all non-asset requests return `index.html` (`try_files $uri /index.html`)
3. Reverse-proxy all `/api/*` requests to `http://backend:8000/api/`

```nginx
location / {
    root /usr/share/nginx/html;
    try_files $uri /index.html;
}

location /api/ {
    proxy_pass http://backend:8000/api/;
}
```
