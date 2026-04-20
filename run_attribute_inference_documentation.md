# run_attribute_inference.py — Technical Documentation

**PathSafetyAssessmentTool · LTA Project · 2 April 2026**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Dependencies](#2-dependencies)
3. [High-Level Processing Flow](#3-high-level-processing-flow)
4. [Segmentation Model](#4-segmentation-model-path_segmentationpt)
5. [Binary Mask Construction](#5-binary-mask-construction-build_masks)
6. [Adjacent Road Lane Detection](#6-adjacent-road-lane-detection-compute_adjroad)
7. [Bottom-Region Helper Functions](#7-bottom-region-helper-functions)
8. [Cascading Attribute Assignment](#8-cascading-attribute-assignment-assign_attributes)
9. [Full Attribute Reference](#9-full-attribute-reference)
10. [Image Annotation](#10-image-annotation-annotate_image)
11. [Function Reference](#11-function-reference)
12. [Edge Cases and Fallback Behaviour](#12-edge-cases-and-fallback-behaviour)
13. [Relationship to Other Scripts](#13-relationship-to-other-scripts-in-the-project)
14. [Output](#14-output)

---

## 1. Overview

`run_attribute_inference.py` is a command-line Python script that automates the assignment of **12 CycleRAP (Cycling Road Assessment Programme) safety attributes** to street-level images of pedestrian and cycling infrastructure. It is part of the PathSafetyAssessmentTool project developed for the Land Transport Authority (LTA) of Singapore.

The script loads a pre-trained YOLO segmentation model (`path_segmentation_v2.pt`), runs inference on every image in a specified input folder, evaluates a hierarchy of cascading detection conditions to assign the correct facility type and safety attributes, and saves a copy of each image annotated with the resulting attribute table.

### 1.1 Purpose

- Replace manual CycleRAP coding for facility type and adjacent-feature attributes with automated, model-driven inference.
- Produce annotated images reviewable by assessors alongside raw data to catch model errors quickly.
- Act as a standalone batch tool runnable independently from the main web application.

### 1.2 Usage

Run from the project root:

```
python run_attribute_inference.py <input_dir> [--output cyclerap_output] [--model backend/models/path_segmentation_v2.pt] [--conf 0.5]
```

| Argument | Default | Description |
|---|---|---|
| `input_dir` | *(required)* | Path to the folder containing `.jpg` / `.jpeg` / `.png` images to process. |
| `--output` | `cyclerap_output` | Directory where annotated output images are saved. Created automatically if it does not exist. |
| `--model` | `backend/models/path_segmentation_v2.pt` | Path to the YOLO segmentation model `.pt` file. |
| `--conf` | `0.5` | Minimum detection confidence threshold. Detections below this value are ignored during mask building. |

---

## 2. Dependencies

All packages are available in the project's Python environment (declared in `backend/requirements.txt`).

| Package | Import | Role |
|---|---|---|
| `ultralytics` | `ultralytics.YOLO`, `ultralytics.nn.tasks` | Loads and runs the YOLO segmentation model. |
| `opencv-python` | `cv2` | Rasterises polygon masks returned by YOLO into binary NumPy arrays. |
| `Pillow` | `PIL.Image`, `ImageDraw`, `ImageFont` | Opens images, draws the semi-transparent attribute panel, and saves output. |
| `NumPy` | `numpy` | Array arithmetic for mask pixel counting and ratio calculations. |
| `argparse` | `argparse` *(stdlib)* | Parses CLI arguments. |
| `pathlib` | `pathlib.Path` *(stdlib)* | Cross-platform file path handling. |

---

## 3. High-Level Processing Flow

For each image the script performs five sequential stages:

```
Input image folder
        │
        ▼
┌──────────────────────────────────────┐
│ 1. Load YOLO model (once per run)    │
└───────────────────┬──────────────────┘
                    │
       ┌────────────▼─────────────┐
       │ 2. YOLO inference        │  ← one call per image
       │    (path_segmentation_v2.pt)│
       └────────────┬─────────────┘
                    │  polygons + class IDs + confidences
       ┌────────────▼─────────────┐
       │ 3. Build binary masks    │  ← cv2.fillPoly per class group
       └────────────┬─────────────┘
                    │  dict of H×W uint8 arrays
       ┌────────────▼─────────────┐
       │ 4. Assign 12 attributes  │  ← cascade of 6 condition steps
       └────────────┬─────────────┘
                    │  dict of 12 attribute name → value pairs
       ┌────────────▼─────────────┐
       │ 5. Annotate & save image │  ← PIL RGBA overlay
       └──────────────────────────┘
```

---

## 4. Segmentation Model (`path_segmentation_v2.pt`)

The model is a YOLO instance segmentation model trained on Singapore street-level imagery to identify surface materials and road features. For each detected region it returns:

- A **class ID** (integer)
- A **confidence score** (float 0–1)
- A **polygon outline** of the segmented region (list of `(x, y)` coordinates in original image pixel space)

The model's internal class IDs are resolved at runtime via `model.names`, making the script robust to retraining that changes numeric indices.

### 4.1 Relevant Class Groups

The script uses five semantic groups. All other model classes (e.g. pathway surface types) are not used by this script.

| Group Key | Class Names in Model | Role in Logic |
|---|---|---|
| `road` | `Road` | Used in adjroad calculation and the Road-majority check (Step 6). |
| `traffic_crossing` | `Traffic Crossing` | Triggers the ≥80% bottom-10% check with `>1 per direction` lane outcome (Step 4). |
| `zebra_crossing` | `Zebra Crossing` | Triggers the ≥80% bottom-10% check with `1 per direction` lane outcome (Step 5). |
| `cycling` | `Cycling Path`, `Wet Cycling Path` | Triggers Off-Road Bicycle Path classification (Step 2). |
| `red_stripe` | `Red Stripe`, `Wet Red Stripe` | Triggers Multi-Use Path classification (Step 3). |

### 4.2 Safe Model Loading (`load_model`)

`load_model()` patches `ultralytics`' `BaseModel.fuse()` with a `try/except` wrapper **before** loading the `.pt` file. This is necessary because `path_segmentation_v2.pt` was trained with an older version of Ultralytics and its internal layer-fusion step raises an `AttributeError` on newer library versions. The patch silently skips fusion if the error occurs, returning the unfused but fully functional model.

```python
def _safe_fuse(self, verbose=True):
    try:
        return _orig_fuse(self, verbose=verbose)
    except AttributeError:
        return self          # skip fusion; model is still usable
```

---

## 5. Binary Mask Construction (`build_masks`)

After YOLO inference, each detected object is represented by a polygon (a list of `(x, y)` vertex coordinates in original image pixel space). `build_masks()` converts these polygons into **five binary NumPy arrays** of shape `(H, W)` — one per class group — where a pixel value of `1` means that pixel belongs to the group and `0` means it does not.

**For each detection:**

1. Skip if the confidence score is below the `--conf` threshold.
2. Skip if the polygon has fewer than 3 vertices (degenerate shape).
3. Convert float vertex coordinates to integer pixel coordinates.
4. Call `cv2.fillPoly()` to paint the polygon interior as `1`s into the appropriate group mask.

`cv2.fillPoly()` is significantly faster than NumPy-based polygon rasterisation for large images, and was adopted from `adjroad_poc.py`.

If YOLO returns no detections (or no segmentation masks), all five group masks remain zero-filled.

---

## 6. Adjacent Road Lane Detection (`compute_adjroad`)

The presence and distance of an adjacent road lane is determined by `compute_adjroad()`, which encapsulates the logic originally developed in `adjroad_poc.py`. The function returns a tuple `(adj_road_01m, adj_road_13m)`, each being `"Present"` or `"Not Present"`.

The combined crossing mask passed in is the pixel-union of the `traffic_crossing` and `zebra_crossing` masks.

### 6.1 Logic 1 — Bottom 20% Check

The bottom 20% of the image is the immediate foreground — the surface directly in front of the camera mount. If road pixels occupy **≥75%** of this region, or if **any** crossing pixel is present anywhere in this region, the road is classified as within 0–1 m of the facility.

```
bottom_start      = int(0.8 × img_h)
bottom_road_ratio = Σ road_mask[bottom_start:, :] / total_bottom_pixels
crossing_present  = any pixel nonzero in crossing_mask[bottom_start:, :]

if bottom_road_ratio ≥ 0.75  OR  crossing_present:
    → adj_road_01m = "Present",   adj_road_13m = "Not Present"
```

### 6.2 Logic 2 — Half-Width Split

If Logic 1 does not trigger, the road may be visible to the left or right side of the image (running alongside the path rather than directly in front). The image is split vertically at its midpoint and the road+crossing pixel ratio is computed independently for each half. The larger of the two ratios is used:

```
combined    = clip(road_mask + crossing_mask, 0, 1)
left_ratio  = Σ combined[:, :mid_x]  / (img_h × mid_x)
right_ratio = Σ combined[:, mid_x:]  / (img_h × (img_w − mid_x))
max_ratio   = max(left_ratio, right_ratio)

if   max_ratio  > 0.07  →  ("Present",     "Not Present")   # 0–1 m
elif max_ratio ≥ 0.05   →  ("Not Present", "Present")        # 1–3 m
else                    →  ("Not Present", "Not Present")    # no adjacent road
```

Thresholds `0.07` and `0.05` were calibrated empirically on Singapore street imagery in `adjroad_poc.py`.

---

## 7. Bottom-Region Helper Functions

### 7.1 `check_bottom_presence(mask, img_h, fraction)`

Returns `True` if **any** pixel of the given mask is nonzero in the bottom `fraction` of the image. Used by the Cycling Path (Step 2) and Red Stripe (Step 3) conditions, which only require that those classes appear *somewhere* in the bottom 20%.

```
cutoff = int(img_h × (1 − fraction))   # e.g. fraction=0.20 → row at 80% mark
return any pixel in mask[cutoff:, :] > 0
```

### 7.2 `check_bottom_majority(mask, img_h, img_w, fraction=0.10, threshold=0.80)`

Returns `True` if the given mask covers **at least `threshold`** (default 80%) of the pixel area in the bottom `fraction` (default 10%) of the image. Used by the Traffic Crossing (Step 4), Zebra Crossing (Step 5), and Road (Step 6) conditions.

```
cutoff        = int(img_h × (1 − fraction))
region_pixels = (img_h − cutoff) × img_w
ratio         = Σ mask[cutoff:, :] / region_pixels
return ratio ≥ threshold            # default threshold = 0.80
```

---

## 8. Cascading Attribute Assignment (`assign_attributes`)

`assign_attributes()` is the core decision function. It evaluates **six sequential conditions** in order. Because each condition is an independent `if`-statement (not `if/elif`), **later conditions can override earlier ones**. This implements the requirement that conditions "cascade from top down".

The function always returns a dictionary of exactly 12 attribute key-value pairs.

### 8.1 Cascade Step Summary

| Step | Trigger Condition | Detection Method | Facility Type | Key Attribute Changes |
|---|---|---|---|---|
| **1** *(default)* | Always applied first | — | Sidewalk | Light Seg=Present, Delineation=Not Present, Adj Sidewalk=Present, Crossing=Not Present, Intersection=Not Present, Lanes=1 per dir. Adj Road 0-1m / 1-3m from `compute_adjroad`. |
| **2** | Cycling Path *or* Wet Cycling Path pixel detected in bottom 20% | `check_bottom_presence(fraction=0.20)` | Off-Road Bicycle Path | Delineation=Present. All other attributes unchanged from Step 1. |
| **3** | Red Stripe *or* Wet Red Stripe pixel detected in bottom 20% | `check_bottom_presence(fraction=0.20)` | Multi-Use Path | Delineation=Present. All other attributes unchanged from Step 1. |
| **4** | Traffic Crossing pixels cover ≥80% of bottom 10% | `check_bottom_majority(fraction=0.10, threshold=0.80)` | Mixed Traffic Road Lane | Light Seg=Present, Delineation=Present, Adj Road 0-1m=Present, Adj Road 1-3m=Not Present, Adj Object 0-1m/1-3m=Not Present, Adj Sidewalk=Not Present, Crossing=Present, Intersection=Present, Lanes=>1 per dir. |
| **5** | Zebra Crossing pixels cover ≥80% of bottom 10% | `check_bottom_majority(fraction=0.10, threshold=0.80)` | Mixed Traffic Road Lane | Same as Step 4 **except** Lanes=1 per direction. |
| **6** | Road pixels cover ≥80% of bottom 10% | `check_bottom_majority(fraction=0.10, threshold=0.80)` | Mixed Traffic Road Lane | Light Seg=Not Present, Delineation=Not Present, Adj Road 0-1m=Present, Adj Road 1-3m=Not Present, Adj Object 0-1m/1-3m=Not Present, Adj Sidewalk=Not Present, Crossing=Not Present, Intersection=Not Present, Lanes=>1 per dir. |

### 8.2 Priority and Override Behaviour

Because conditions are evaluated as sequential `if`-statements, the **last condition whose trigger fires wins**. Effective priority from highest to lowest:

1. **Step 6 — Road** *(highest priority; overrides everything)*
2. Step 5 — Zebra Crossing
3. Step 4 — Traffic Crossing
4. Step 3 — Red Stripe / Wet Red Stripe
5. Step 2 — Cycling Path / Wet Cycling Path
6. **Step 1 — Sidewalk default** *(lowest priority; applies if nothing else fires)*

In practice, Steps 4–6 are mutually exclusive (only one surface class is expected to dominate the bottom 10% at a time), but the cascade handles edge cases gracefully by letting the last applicable condition win.

### 8.3 Adjacent Object / Level Change Mirroring

In Step 1 (Sidewalk default), the `Adjacent Object/Level Change 0-1m` attribute is set to the **same value** as `Adjacent Road Lane 0-1m`, and `1-3m` mirrors `1-3m`. This implements the specification requirement that adjacent objects are only flagged when a road lane is present at that distance. Steps 4–6 (Mixed Traffic Road Lane) override both attributes to `Not Present` because the camera is positioned on the road surface itself.

---

## 9. Full Attribute Reference

| Attribute | Possible Values | Step 1 Default |
|---|---|---|
| Facility Type | Sidewalk / Off-Road Bicycle Path / Multi-Use Path / Mixed Traffic Road Lane | Sidewalk |
| Light Segregation | Present / Not Present | Present |
| Delineation | Present / Not Present | Not Present |
| Adjacent Road Lane 0-1m | Present / Not Present | From `compute_adjroad` |
| Adjacent Road Lane 1-3m | Present / Not Present | From `compute_adjroad` |
| Adjacent Object/Level Change 0-1m | Present / Not Present | Mirrors Adjacent Road Lane 0-1m |
| Adjacent Object/Level Change 1-3m | Present / Not Present | Mirrors Adjacent Road Lane 1-3m |
| Adjacent Sidewalk 0-1m | Present / Not Present | Present |
| Crossing Facility | Present / Not Present | Not Present |
| Peak Pedestrian Flow | Low / Medium / High | Low |
| Intersection/Road Crossing | Present / Not Present | Not Present |
| No of Lanes on Intersecting Road | 1 per direction / >1 per direction | 1 per direction |

---

## 10. Image Annotation (`annotate_image`)

After attributes are assigned, `annotate_image()` renders a 12-row attribute table directly onto the image and saves it to the output directory. **The original input file is never modified.**

### 10.1 Panel Layout

A semi-transparent dark panel (black, alpha 170/255) is composited onto the **left side** of the image using PIL's RGBA blending (`Image.alpha_composite`). Placing the panel on the left avoids obscuring the bottom of the image — the region the model analyses for facility type detection. Panel width is capped at 55% of image width or 620 pixels, whichever is smaller, so it does not dominate very wide images.

### 10.2 Facility Type Colour Bar

A 6-pixel-wide vertical colour bar on the left edge of the panel provides an at-a-glance colour code for the detected facility type:

| Facility Type | Bar Colour (RGB) |
|---|---|
| Sidewalk | (80, 180, 80) — green |
| Off-Road Bicycle Path | (50, 150, 220) — blue |
| Multi-Use Path | (220, 160, 50) — amber |
| Mixed Traffic Road Lane | (220, 50, 50) — red |

### 10.3 Attribute Rows

Each of the 12 attributes occupies one row. The **attribute name** is shown in grey at 85% of the main font size on the left side of the panel; the **value** is shown at a fixed x-offset (65% of panel width) in a colour that reflects its meaning:

- **Green** — `"Present"`
- **Red** — `"Not Present"`
- **White** — all other values (e.g. `"Low"`, `"1 per direction"`, `">1 per direction"`)

### 10.4 Font and Scaling

Font size is computed as `max(14, image_height ÷ 42)` so the annotation scales proportionally with image resolution. **Helvetica** (macOS path `/System/Library/Fonts/Helvetica.ttc`) is used where available; `ImageFont.load_default()` is the cross-platform fallback, following the same pattern used in `cv_poc.py`.

---

## 11. Function Reference

| Function | Signature | Returns |
|---|---|---|
| `parse_args` | `() → Namespace` | Parsed CLI arguments. |
| `load_model` | `(model_path: Path) → YOLO` | Loaded YOLO model with safe fuse patch applied. |
| `build_class_sets` | `(model) → dict[str, set[int]]` | Mapping of semantic group name to set of class IDs. |
| `build_masks` | `(result, class_sets, img_h, img_w, conf_thresh) → dict[str, ndarray]` | Binary `(H×W, uint8)` mask per class group. |
| `compute_adjroad` | `(road_mask, crossing_mask, img_h, img_w) → tuple[str, str]` | `("Present"\|"Not Present", "Present"\|"Not Present")` for 0-1m and 1-3m. |
| `check_bottom_presence` | `(mask, img_h, fraction) → bool` | `True` if any mask pixel is nonzero in the bottom `fraction` of the image. |
| `check_bottom_majority` | `(mask, img_h, img_w, fraction=0.10, threshold=0.80) → bool` | `True` if mask covers ≥`threshold` of the bottom `fraction` region. |
| `assign_attributes` | `(masks, img_h, img_w) → dict[str, str]` | 12-entry dict of attribute name → value. |
| `annotate_image` | `(img_path, attrs, output_dir) → None` | Saves annotated image to `output_dir`. No return value. |
| `process_images` | `(args: Namespace) → None` | Main loop — orchestrates inference, attribute assignment, and annotation for all images. |
| `main` | `() → None` | Entry point. Calls `parse_args()` then `process_images()`. |

---

## 12. Edge Cases and Fallback Behaviour

| Scenario | Behaviour |
|---|---|
| No detections from YOLO | All masks remain zero-filled. `compute_adjroad` returns `("Not Present", "Not Present")`. All bottom-region checks return `False`. Image is annotated with full Sidewalk defaults. |
| Detections below confidence threshold | Filtered out in `build_masks` before polygon rasterisation. Treated as no detection for those classes. |
| Multiple conditions fire simultaneously | The last `if`-block that fires wins. E.g. if both Cycling Path and Road majority are detected, Road wins because Step 6 is evaluated last. |
| Polygon with fewer than 3 vertices | Skipped in `build_masks`; cannot form a valid filled region with `cv2.fillPoly`. |
| Division by zero in ratio calculations | Guards with `max(..., 1)` or explicit zero-checks prevent `ZeroDivisionError` for degenerate image sizes. |
| Helvetica font not found (non-macOS) | Falls back silently to PIL's built-in default bitmap font via `ImageFont.load_default()`. |
| Input directory is empty | Script exits cleanly with an informative message before loading the model. |
| Model file not found | Raises `SystemExit` with an informative path error before attempting any inference. |

---

## 13. Relationship to Other Scripts in the Project

| Script | What Was Reused | Changes Made |
|---|---|---|
| `adjroad_poc.py` | Full adjacent-road classification logic — both Logic 1 (bottom-20% check) and Logic 2 (half-width split) — including all numerical thresholds (0.75, 0.07, 0.05). | Extracted into the self-contained `compute_adjroad()` function. Removed image-drawing and file-copying side-effects. Returns string values instead of writing files to disk. |
| `cv_poc.py` | PIL annotation pattern: RGBA overlay compositing, `ImageFont` loading with Helvetica fallback, and the facility-type colour scheme. | Replaced the single-line bottom banner with a 12-row attribute panel. Added per-value colour-coding (green / red / white). |
| `run_delineation_inference.py` | Safe `BaseModel.fuse()` patch for loading older `.pt` files on newer Ultralytics versions without crashing on `AttributeError`. | Identical patch; copied directly into `load_model()`. |

---

## 14. Output

The script creates the output directory if it does not exist. For each processed image it saves a **JPEG file with the same filename** as the input into the output directory. Original input files are never modified or moved.

Console output reports the detected Facility Type for each image, allowing progress to be monitored and results spot-checked without opening every annotated image:

```
Loading model: backend/models/path_segmentation_v2.pt
Class sets: {'road': {'Road'}, 'traffic_crossing': {'Traffic Crossing'}, ...}
Processing 4 images...

[IMG_0001.jpeg] Sidewalk
[IMG_0002.jpeg] Off-Road Bicycle Path
[IMG_0003.jpeg] Mixed Traffic Road Lane
[IMG_0004.jpeg] Multi-Use Path

Done! Annotated 4 images.
Output: /path/to/cyclerap_output
```
