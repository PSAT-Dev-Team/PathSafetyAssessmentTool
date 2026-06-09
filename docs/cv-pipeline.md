# CV / ML Pipeline

PSAT uses a suite of YOLO-based computer-vision models to automatically infer CycleRAP attribute values from street-level photographs. This process is called **auto-coding**.

---


## Table of Contents

- [5.1 Overview](#5-1-overview)
- [5.2 Model Files](#5-2-model-files)
  - [5.21 Model Loading](#5-21-model-loading)
  - [5.22 Replacing or Updating a Model](#5-22-replacing-or-updating-a-model)
  - [5.23 Entry Point: `autocode(image_path)`](#5-23-entry-point-autocode-image-path)
  - [5.24 Step 1 — Path Segmentation](#5-24-step-1-path-segmentation)
  - [5.25 Step 2 — Light Segregation (Default)](#5-25-step-2-light-segregation-default)
  - [5.26 Step 3 — Adjacent Road (if road class `1` is present)](#5-26-step-3-adjacent-road-if-road-class-1-is-present)
  - [5.27 Step 4 — Off-Road Bicycle Path Classification](#5-27-step-4-off-road-bicycle-path-classification)
  - [5.28 Step 5 — Facility Type Decision (via Fixed Obstacle Model)](#5-28-step-5-facility-type-decision-via-fixed-obstacle-model)
  - [5.29 Step 6 — Fixed Obstacle & Delineation Detection](#5-29-step-6-fixed-obstacle-delineation-detection)
- [5.3 Auto-coding in Bulk](#5-3-auto-coding-in-bulk)
- [5.4 Confidence Thresholds (Summary)](#5-4-confidence-thresholds-summary)
- [5.5 Attributes Auto-coded by CV](#5-5-attributes-auto-coded-by-cv)
- [5.6 GIS Auto-coding](#5-6-gis-auto-coding)

## 5.1 Overview

```
Street-level photograph (.jpg)
        │
        ▼
1. Path Segmentation (path_seg.pt)
   └─ Detects: path (0), road (1), buffer zone, etc.
        │
        ├── No path detected → manual review required
        │
        └── Path detected
              │
              ├─ 2. Off-Road Bicycle Classifier (off_road_bicycle_path.pt)
              │     └─ Is this an off-road bicycle path?
              │
              ├─ 3. Adjacent Road Lane Classifier (adj_road_lane.pt)
              │     └─ Road within 0–1m? 1–3m? Neither?
              │
              ├─ 4. Fixed Obstacle Detector (LTA_FIXEDOBSTACLE_BEST_2.pt)
              │     └─ Obstacles, bus stops, delineation markers
              │
              ├─ 5. Development Access Classifier (DevelopmentAccess_last_150epochs.pt)
              │     └─ Driveway / property access present?
              │
              └─ 6. Delineation Classifier (LTA_Dill_4_Best.pt)
                    └─ Road markings / lane delineation present?

7. Road Classification Model (RoadClassification_best.pt)
   └─ Determines facility type context

        │
        ▼
Attribute dictionary {field: coded_value}
        │
        ▼
Stored in attributes.csv (merged with any existing values)
```

---

## 5.2 Model Files

All model files are YOLO `.pt` files and must be placed in `backend/models/`. They are **not included in the repository** and must be copied from the project SSD.

| File | Model type | Detects / classifies |
|---|---|---|
| `path_seg.pt` | Segmentation | Path (0), road (1), buffer zone, zebra crossing, etc. |
| `off_road_bicycle_path.pt` | Classifier | Off-road bicycle path vs. other facility types |
| `adj_road_lane.pt` | Classifier | Adjacent road: 0–1m (class 1), 1–3m (class 2), or none |
| `LTA_FIXEDOBSTACLE_BEST_2.pt` | Segmentation | Fixed obstacles, bus stops, delineation markers |
| `DevelopmentAccess_last_150epochs.pt` | Classifier | Development/property access |
| `LTA_Dill_4_Best.pt` | Classifier | Delineation / road markings |
| `RoadClassification_best.pt` | Classifier | Road type classification |

### 5.21 Model Loading

Models are loaded once at first use by `CycleRAP_Coding_Helper.initialise(model_dir)` in `prediction.py`. The backend searches for `path_seg.pt` in these locations (in order):

1. `MODEL_DIR` environment variable (if set)
2. `backend/model/`
3. `backend/models/`
4. Adjacent `model/` or `models/` relative to the source path

If no model directory is found, the backend raises a `RuntimeError` and returns HTTP 503 for all subsequent CV requests.

### 5.22 Replacing or Updating a Model

When a retrained or improved `.pt` file becomes available, follow these steps:

1. **Drop the new file into `backend/models/`**, using the **exact same filename** as the model it replaces (e.g. `path_seg.pt`). The filename is hardcoded in `prediction.py` — changing it will break loading.

   ```
   backend/models/
   ├── path_seg.pt                          ← replace this
   ├── off_road_bicycle_path.pt
   ├── adj_road_lane.pt
   ├── LTA_FIXEDOBSTACLE_BEST_2.pt
   ├── DevelopmentAccess_last_150epochs.pt
   ├── LTA_Dill_4_Best.pt
   └── RoadClassification_best.pt
   ```

2. **Rebuild the Docker image** so the new file is copied into the container:

   ```bash
   docker compose up --build
   ```

3. **Verify the model loaded correctly** by checking the backend logs on startup and sending a test auto-code request. The models are loaded lazily on the first CV request, not at boot.

> **If you need to rename the new file** (e.g. the new model has a different name): update the corresponding filename string in `prediction.py` inside `CycleRAP_Coding_Helper.initialise()`, then rebuild.

> **Storing multiple versions:** Keep old `.pt` files archived on the SSD. Only the file with the exact expected name in `backend/models/` will be used by the app.



All inference logic lives in the `CycleRAP_Coding_Helper` class (static methods only).

### 5.23 Entry Point: `autocode(image_path)`

Returns a dictionary mapping every `Attributes.Fields` field to a coded integer value (or `None` if the field cannot be determined from the image).

### 5.24 Step 1 — Path Segmentation

```python
seg_results = cls.path_segmentation_model.predict(image_path)
result = cls._filter_segmentation_results(seg_results[0], confidence_threshold=0.5)
```

The segmentation model produces per-pixel class masks. Detected class IDs:
- `0` = path / cycle facility
- `1` = road

If no path (class `0`) is detected, a warning is logged and manual review is flagged.

### 5.25 Step 2 — Light Segregation (Default)

If a path is detected, `Light Segregation` is set to `Present (1)` by default.

### 5.26 Step 3 — Adjacent Road (if road class `1` is present)

```python
adj_result = cls.adj_road_lanes_classifier.predict(cropped)[0]
pred_adj_class = int(adj_result.probs.top1)
```

The cropped path bounding box is passed to the adjacency classifier:
- Class `1` → road is within **0–1m**: sets `Adjacent Road Lane 0-1m = Present`, `1-3m = Not Present`
- Class `2` → road is within **1–3m**: sets `Adjacent Road Lane 0-1m = Not Present`, `1-3m = Present`
- Class `0` or low confidence → uncertain, logged for manual review

Confidence threshold: `0.8`. Results below this threshold default to class `0` (uncertain).

### 5.27 Step 4 — Off-Road Bicycle Path Classification

```python
cls_result = cls.off_road_bicycle_classifier.predict(cropped)[0]
```

Confidence threshold: `0.8`. If classified as an off-road bicycle path:
- Sets `Facility Type = Off-Road Bicycle Path (3)`
- Sets `Delineation = Present (1)`
- If multiple path indices detected: sets `Adjacent Sidewalk 0-1m = Present`

### 5.28 Step 5 — Facility Type Decision (via Fixed Obstacle Model)

The fixed obstacle model is run on the full image. A pixel-level segmentation map is built:

```
pathway_area    = pixels with label 0
road_area       = pixels with label 8
left_road_area  = road in left half of image
right_road_area = road in right half of image
```

Decision logic:
| Condition | Facility Type |
|---|---|
| Bus stop or bus-related obstacle detected (labels `1`, `4`) | Sidewalk |
| Bottom half >90% pathway AND pathway > road | Multi-Use Path |
| Road confined to one side (>80%) | Sidewalk |
| Only pathway, no road | Sidewalk |
| Default (road visible across full width) | Mixed Traffic Road Lane |

### 5.29 Step 6 — Fixed Obstacle & Delineation Detection

A second pass with `LTA_FIXEDOBSTACLE_BEST_2.pt` checks whether detected obstacle masks overlap the path mask:

```python
FIXED_OBSTACLE_RELEVANT_LABELS = {1, 2, 4, 6, 7}
NON_FIXED_OBSTACLE_LABEL = 9
DELINEATION_RELEVANT_LABELS = {0, 1, 2, 5}
```

- If any relevant obstacle intersects the path: sets `Fixed Obstacle on Facility = Present`
- If label `9` (non-fixed) intersects path: sets `Non-Fixed Obstacle on Facility = Present`
- Delineation markers on path: sets `Delineation = Present`

---

## 5.3 Auto-coding in Bulk

The `/autocode/all` endpoint supports three modes:

| Mode | Payload | Behaviour |
|---|---|---|
| Single image | `{ "imageRef": "...", "coords": [[lon, lat], ...] }` | Codes one segment |
| All rows | `{ "all": true, "save": false }` | Codes every segment in the project |
| Selected rows | `{ "indices": [0, 3, 5], "save": false }` | Codes specified segments |

When `save: false`, results are returned to the frontend for review but **not written to disk**. The user must explicitly save from the coding interface.

---

## 5.4 Confidence Thresholds (Summary)

| Model | Threshold | Below threshold → |
|---|---|---|
| Path segmentation | 0.5 | No path; flag for manual review |
| Adjacent road lane | 0.8 | Class `0` (uncertain) |
| Off-road bicycle | 0.8 | Not classified as off-road |
| Fixed obstacle | 0.6 | No obstacles detected |
| Development access | 0.5 | No access detected |
| Delineation | 0.5 | No delineation detected |

---

## 5.5 Attributes Auto-coded by CV

The following fields can be set by the CV pipeline. All other fields require manual coding or GIS auto-coding.

| Field | Set by |
|---|---|
| Facility Type | Off-road classifier + fixed obstacle decision |
| Light Segregation | Default (Present) when path detected |
| Adjacent Road Lane 0–1m | Adjacent road classifier |
| Adjacent Road Lane 1–3m | Adjacent road classifier |
| Adjacent object or level change 0–1m | Adjacent road classifier (inferred) |
| Adjacent object or level change 1–3m | Adjacent road classifier (inferred) |
| Adjacent Sidewalk 0–1m | Multi-path detection |
| Fixed Obstacle on Facility | Fixed obstacle segmentation |
| Non-Fixed Obstacle on Facility | Fixed obstacle segmentation (label 9) |
| Delineation | Delineation classifier |

---

## 5.6 GIS Auto-coding

In addition to image-based CV, the `/autocode/gis` endpoint derives attributes from spatial context using the shapefiles in `backend/shapefiles/`. The following layers are used and the attributes each one sets:

| Layer | Attribute(s) Set | Notes |
|---|---|---|
| `inner` (polygon) | Area Type = 1 (Urban/CBD) | Containment query |
| `industrial` (polygon) | Area Type = 4 (Industrial) | Containment query |
| `rural` (polygon) | Area Type = 3 (Rural) | Containment query |
| *(no layer match)* | Area Type = 2 (Suburban) | Default fallback |
| `cycling_path` / `shared_path` / `footpath` | Facility Width per Direction | Reads `WIDTH` field from shapefile |
| `road_links` | Road Operating Speed (mean) | Looks up mean speed via `LK_ID_NUM` from linked CSV |
| `speed_limit` | Road Speed Limit | Reads `SPEEDLIMIT` field |
| `mrt` | MRT proximity | 20 m buffer |
| `bus_lane` / `bus_stop` | Bus lane/stop proximity | 20 m buffer |
| `road_crossing` | Road crossing proximity | 5 m buffer |
| `parking` | Adjacent Vehicle Parking | 20 m buffer |
| `beforeCount` / `sensorCount` | Peak Pedestrian Flow | Aggregated from count data |

> **Note:** Road AADT has no GIS auto-coding path — it must be coded manually.

