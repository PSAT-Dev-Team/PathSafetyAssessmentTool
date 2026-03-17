# Installation

This guide covers everything needed to get PSAT running locally on a **Windows** machine using Docker.

---

## Prerequisites

### Required Software

| Tool | Purpose | Download |
|---|---|---|
| **Git** | Clone the repository | https://git-scm.com |
| **GitHub Desktop** *(optional)* | GUI for Git | https://desktop.github.com |
| **Docker Desktop** | Run the containerised app | https://www.docker.com/products/docker-desktop |

Install all three before proceeding. Docker Desktop must be **running** before you attempt to start the app.

### Required Files (from the SSD)

Two folders must be copied from the shared SSD before the app can use its CV features:

| Folder | Destination | Contents |
|---|---|---|
| `models/` | `backend/models/` | YOLO `.pt` model files (see [CV Pipeline](cv-pipeline.md)) |
| `shapefiles/` | `backend/shapefiles/` | GIS shapefiles used by the GIS autocoder |

> **Important:** If these folders are absent, the app will still start, but any attempt to auto-code images or run GIS-based coding will fail. See [Common Issues](common-issues.md).

---

## Step 1 — Obtain the Project Files

### Option A: GitHub Desktop

1. Open GitHub Desktop.
2. Press **Ctrl + Shift + O** (or **File → Clone Repository** if that shortcut opens "Add Repository").
3. Search for `LinXH8/PathSafetyAssessmentTool` and clone it to a local folder of your choice.

### Option B: Command Line

```bash
git clone https://github.com/LinXH8/PathSafetyAssessmentTool.git
cd PathSafetyAssessmentTool
```

> **Windows line endings:** If your Git is configured with `autocrlf=true`, shell scripts inside the Docker container may break. Set it to false **before cloning**:
> ```bash
> git config --global core.autocrlf false
> ```

---

## Step 2 — Prepare the Folder Structure

After cloning, the root of the repository should contain the following:

```
PathSafetyAssessmentTool/
├── backend/
├── frontend/
├── data/                ← created automatically by Docker on first run
├── in/                  ← YOU MUST CREATE THIS MANUALLY
├── backend.Dockerfile
└── docker-compose.yml
```

### Create the `in/` folder

**Create the `in/` folder manually before running Docker.** If Docker creates it, it may be owned by root and cause permission errors on subsequent writes.

```bash
# In the project root:
mkdir in
```

Inside `in/`, you will place subfolders containing the `.jpg` images for each survey. Each subfolder becomes the source for one project. For example:

```
in/
├── FernvaleSurvey/
│   ├── IMG_001.jpg
│   ├── IMG_002.jpg
│   └── ...
└── YishunSurvey/
    └── ...
```

### Copy Models and Shapefiles

```
# From the SSD:
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
    └── <shapefile assets>
```

---

## Step 3 — Run the App

Open a terminal (Command Prompt or PowerShell) in the project root and run:

```bash
docker compose up --build
```

The first run will take several minutes as Docker downloads the base images and installs Python/Node dependencies. Subsequent runs are much faster.

Once started:
- **Frontend (UI):** http://localhost
- **Backend API:** http://localhost:8000/api

### Verify the backend is responding

```bash
curl http://localhost:8000/api/ping
# Expected: {"status": "ok"}
```

### Stop the app

```bash
docker compose down
```

---

## Data Persistence

The following folders are bind-mounted as Docker volumes. **Data persists between container restarts.**

| Host path | Container path | Contents |
|---|---|---|
| `./data/` | `/app/data` | All project data (attributes, results, geodata) |
| `./in/` | `/app/in` | Input image source folders |

Do **not** delete or move these folders while the container is running.

---

## Port Reference

| Service | Host port | Container port |
|---|---|---|
| Frontend (nginx) | 80 | 80 |
| Backend (Flask) | 8000 | 8000 |

If port 80 or 8000 is already in use on your machine, another service is conflicting. See [Common Issues](common-issues.md).

---

## Updating the App

```bash
git pull
docker compose up --build
```

The `--build` flag ensures the Docker image is rebuilt with any code changes. Project data in `./data/` is unaffected by rebuilds.

---

## Advanced: Running Without Docker

For active development, you can run the backend and frontend directly on your machine without Docker. This gives faster iteration (no rebuild required) at the cost of having to manage dependencies yourself.

### Prerequisites

- **Python 3.11** (match the Docker base image version)
- **Node.js 20**

### Backend (Flask)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The backend starts on `http://localhost:8000`. The `data/` and `in/` paths are resolved relative to the `backend/` directory when running locally (not `/app/`).

### Frontend (Vite dev server)

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on `http://localhost:5173`. It is pre-configured to proxy all `/api/*` requests to `http://localhost:8000`, so the backend must be running first.

> **Note:** `pywin32` (required for Excel COM automation) is Windows-only and is listed in `requirements.txt`. On non-Windows machines, remove or skip that line, or use:
> ```bash
> grep -v 'pywin32' requirements.txt | pip install -r /dev/stdin
> ```

