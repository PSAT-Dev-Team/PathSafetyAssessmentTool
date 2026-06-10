# Installation

This guide covers local setup for PSAT on Windows. Docker is the standard path, but a non-Docker developer workflow is also supported.

## 2.1 Prerequisites

### 2.11 Required software

| Tool | Purpose | Download |
|---|---|---|
| **Git** | Clone and update the repository | https://git-scm.com |
| **GitHub Desktop** *(optional)* | GUI for Git | https://desktop.github.com |
| **Docker Desktop** | Standard local runtime | https://www.docker.com/products/docker-desktop |

Docker Desktop must be running before you start the stack.

### 2.12 Required assets

Two external asset folders must be copied into `backend/` before CV and GIS-assisted coding will work:

| Folder | Destination | Notes |
|---|---|---|
| `models/` | `backend/models/` | YOLO weights used by CV auto-coding |
| `shapefiles/` | `backend/shapefiles/` | GIS layers used for mapping, road selection, and GIS admin tools |

If these folders are missing, the app can still boot, but GIS and/or CV features will fail at runtime.

## 2.2 Step 1 - Clone the repository

### 2.21 Option A: GitHub Desktop

1. Open GitHub Desktop.
2. Use **File -> Clone Repository**.
3. Clone `LinXH8/PathSafetyAssessmentTool` to a local folder.

### 2.22 Option B: command line

```bash
git clone https://github.com/LinXH8/PathSafetyAssessmentTool.git
cd PathSafetyAssessmentTool
```

If you are cloning on Windows, set Git to preserve LF endings before cloning:

```bash
git config --global core.autocrlf false
```

## 2.3 Step 2 - Prepare the working folders

Expected root structure:

```text
PathSafetyAssessmentTool/
├── backend/
├── frontend/
├── data/                # created on first successful run
├── in/                  # create this manually
├── backend.Dockerfile
└── docker-compose.yml
```

### 2.31 Create `in/` yourself

Create `in/` manually before starting Docker so Docker does not create it with the wrong ownership.

```bash
mkdir in
```

Inside `in/`, each subfolder is a reusable image source. A project can be created from:

- one folder directly
- multiple folders selected from the Create Project map
- a subset of images/nodes inside a polygon across multiple folders

Example:

```text
in/
├── ANG MO KIO AVENUE 1/
│   ├── Cam1_0001.jpg
│   └── ...
├── ANG MO KIO AVENUE 8/
│   └── ...
└── BISHAN STREET 11/
    └── ...
```

### 2.32 Copy models and shapefiles

Populate:

```text
backend/
├── models/
│   ├── path_seg.pt
│   ├── off_road_bicycle_path.pt
│   ├── adj_road_lane.pt
│   ├── LTA_FIXEDOBSTACLE_BEST_2.pt
│   ├── DevelopmentAccess_last_150epochs.pt
│   ├── LTA_Dill_4_Best.pt
│   └── RoadClassification_best.pt
└── shapefiles/
    └── <GIS layer files>
```

### 2.33 Optional but recommended: build `road_reference.csv`

After you have populated `in/`, generate the road-reference CSV used by the polygon road-selection tool:

```bash
cd backend
python generate_road_reference.py
cd ..
```

This writes `backend/shapefiles/road_reference.csv`. The map-based road selector can still work without it, but the CSV improves matching between the selection polygon and locally available road folders.

## 2.4 Step 3 - Start PSAT with Docker

From the repository root:

```bash
docker compose up --build
```

Once the stack is healthy:

- **Frontend:** http://localhost
- **Backend API:** http://localhost:8000/api

Quick liveness check:

```bash
curl http://localhost:8000/api/ping
```

Expected response:

```json
{"status":"ok"}
```

To stop the stack:

```bash
docker compose down
```

## 2.5 First-run checklist inside the app

After the stack is up:

1. Open the Projects page.
2. Use **Create Project**.
3. Choose either a single source folder or draw/select a polygon on the map.
4. If using polygon selection, verify the selected roads are marked as available.
5. Create the project and confirm the app navigates to the coding page.

## 2.6 Persistence

These bind mounts preserve local state:

| Host path | Container path | Contents |
|---|---|---|
| `./data/` | `/app/data` | Project metadata, geodata, snapshots, treatments, baselines |
| `./in/` | `/app/in` | Source image folders |

Do not delete or move these directories while containers are running.

## 2.7 Ports

| Service | Host port | Container port |
|---|---|---|
| Frontend | 80 | 80 |
| Backend | 8000 | 8000 |

If either port is already in use, change the mapping in `docker-compose.yml` or stop the conflicting service.

## 2.8 Updating the stack

```bash
git pull
docker compose up --build
```

Rebuilds do not erase `data/` or `in/`.

## 2.9 Running without Docker

This mode is useful for faster frontend/backend iteration during development.

### 2.91 Requirements

- Python 3.11
- Node.js 20

### 2.92 Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

### 2.93 Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `http://localhost:8000`.

> `pywin32` is Windows-only. If you are running on another platform for development, you may need to skip that dependency.

