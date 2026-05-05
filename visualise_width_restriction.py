#!/usr/bin/env python3
"""
Visualise Width Restriction detections for a folder of images.

Two-stage logic (mirrors _compute_width_restriction in prediction.py):
  Stage 1 — Image-centre pre-filter: obstacle centre must be within ±15% of
             image width from the image horizontal centre.
  Stage 2 — Pathway-centre check: obstacle centre must be within 10% of the
             segmented pathway width from the pathway centre (_analyze_obstacle).

Only images where at least one obstacle passes BOTH stages are saved.

Annotation legend:
  ── White solid line         Image horizontal centre
  ╌╌ Cyan dashed lines        ±15% image-centre zone boundary
  ── Yellow solid line        Pathway centre (from segmentation mask)
  ╌╌ Yellow dashed lines      Pathway ±10% blocking threshold
  Green  box / vline          Obstacle passed both stages → triggers Width Restriction
  Orange box / vline          Obstacle passed Stage 1 but failed Stage 2 (pathway check)
  Red    box / vline          Obstacle failed Stage 1 (outside image-centre zone)

Usage:
    python visualise_width_restriction.py <input_folder> [output_folder]

    output_folder defaults to <input_folder>/width_restriction_output
"""

import sys
from pathlib import Path
import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Bootstrap: make backend services importable and patch ultralytics
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services.ema import EMA  # noqa: F401
import ultralytics.nn.modules.block as _ul_block
_ul_block.EMA = EMA

from ultralytics import YOLO
from ultralytics.nn import tasks as _ul_tasks

_orig_fuse = _ul_tasks.BaseModel.fuse
def _safe_fuse(self, verbose=True):
    try:
        return _orig_fuse(self, verbose=verbose)
    except AttributeError:
        return self
_ul_tasks.BaseModel.fuse = _safe_fuse

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SEG_MODEL_PATH      = REPO_ROOT / "backend" / "models" / "path_segmentation_v2.pt"
OBS_MODEL_PATH      = REPO_ROOT / "backend" / "models" / "obstacle_detector_ema.pt"
CONF_THRESH         = 0.5

IMAGE_CENTRE_RATIO  = 0.15   # Stage 1: max |obj_cx - img_cx| / img_w
PATHWAY_THRESHOLD   = 0.1    # Stage 2: max deviation / pathway_width

FIXED_CLASSES     = {"Pillar", "Bollards", "Fence", "Utility Box",
                     "Traffic Light", "Billboard", "Lamp Post"}
NON_FIXED_CLASSES = {"Cone", "Bins", "Bicycle", "Pot", "Barrier"}
IMAGE_EXTS        = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

PATHWAY_CLASS_NAMES = {
    "Pathway", "Cycling Path", "Stone Pathway", "Wet Pathway",
    "Grey Tiled Pathway", "Wet Cycling Path", "Square Pathway",
}

# BGR colours
COL_IMG_CENTRE    = (255, 255, 255)   # white  — image centre line
COL_ZONE_BOUND    = (220, 220,   0)   # cyan   — ±15% boundary
COL_PATH_CENTRE   = (0,   220, 220)   # yellow — pathway centre
COL_PATH_THRESH   = (0,   160, 160)   # darker yellow — pathway ±threshold lines
COL_PASS          = (0,   200,   0)   # green  — passed both stages
COL_STAGE2_FAIL   = (0,   140, 255)   # orange — passed stage 1, failed stage 2
COL_STAGE1_FAIL   = (0,   0,   200)   # red    — failed stage 1
COL_LABEL_BG      = (30,  30,   30)


# ---------------------------------------------------------------------------
# Model helpers
# ---------------------------------------------------------------------------
def build_pathway_mask(seg_model, img_path: Path, img_h: int, img_w: int) -> np.ndarray:
    inv = {v: k for k, v in seg_model.names.items()}
    pathway_ids = {inv[n] for n in PATHWAY_CLASS_NAMES if n in inv}

    results = seg_model.predict(source=str(img_path), conf=CONF_THRESH, verbose=False)
    result  = results[0]
    mask    = np.zeros((img_h, img_w), dtype=np.uint8)

    boxes     = result.boxes
    seg_masks = result.masks
    if boxes is None or seg_masks is None:
        return mask

    class_ids   = boxes.cls.int().tolist()
    confidences = boxes.conf.tolist()
    polygons    = seg_masks.xy

    for i, (cid, conf) in enumerate(zip(class_ids, confidences)):
        if conf < CONF_THRESH or cid not in pathway_ids or i >= len(polygons):
            continue
        poly = polygons[i]
        if len(poly) < 3:
            continue
        cv2.fillPoly(mask, [np.array(poly, dtype=np.int32)], 1)

    return mask


def detect_obstacles(obs_model, img_path: Path, img_h: int, img_w: int) -> list[dict]:
    inv           = {v: k for k, v in obs_model.names.items()}
    fixed_ids     = {inv[n] for n in FIXED_CLASSES     if n in inv}
    non_fixed_ids = {inv[n] for n in NON_FIXED_CLASSES if n in inv}
    relevant_ids  = fixed_ids | non_fixed_ids

    results    = obs_model.predict(source=str(img_path), conf=CONF_THRESH, verbose=False)
    result     = results[0]
    boxes      = result.boxes

    if boxes is None or len(boxes) == 0:
        return []

    class_ids   = boxes.cls.int().tolist()
    confidences = boxes.conf.tolist()
    xyxy_boxes  = boxes.xyxy.cpu().numpy().astype(int)

    detections = []
    for i, (cid, conf) in enumerate(zip(class_ids, confidences)):
        if conf < CONF_THRESH or cid not in relevant_ids:
            continue
        x1, y1, x2, y2 = xyxy_boxes[i]
        x1, y1 = max(x1, 0), max(y1, 0)
        x2, y2 = min(x2, img_w - 1), min(y2, img_h - 1)
        detections.append({
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "class_name": obs_model.names[cid],
            "group": "fixed" if cid in fixed_ids else "non_fixed",
            "conf": conf,
        })
    return detections


def analyze_obstacle(obstacle_box, path_mask, threshold=PATHWAY_THRESHOLD):
    """Returns (is_blocking, path_center_x, path_width)."""
    x_min, y_min, x_max, y_max = map(int, obstacle_box)
    obstacle_center_x = int((x_min + x_max) / 2)
    bottom_y = min(y_max, path_mask.shape[0] - 1)

    path_row = path_mask[bottom_y, :]
    if not np.any(path_row):
        return False, None, None

    path_pixels_x = np.where(path_row > 0)[0]
    path_center_x = int(np.median(path_pixels_x))
    path_width    = np.percentile(path_pixels_x, 95) - np.percentile(path_pixels_x, 5)

    if path_width < 10:
        return False, path_center_x, path_width

    deviation  = abs(path_center_x - obstacle_center_x)
    ratio      = deviation / path_width
    is_blocking = ratio < threshold
    return is_blocking, path_center_x, path_width


def classify_detections(detections: list[dict], pathway_mask: np.ndarray, img_w: int):
    """
    Returns list of (det, stage, path_center_x, path_width) where stage is:
      'pass'         — both stages passed
      'stage2_fail'  — passed image-centre filter, failed pathway check
      'stage1_fail'  — failed image-centre filter
    """
    img_cx   = img_w / 2
    results  = []
    is_present = False

    for det in detections:
        obj_cx = (det["x1"] + det["x2"]) / 2
        if abs(obj_cx - img_cx) / img_w > IMAGE_CENTRE_RATIO:
            results.append((det, "stage1_fail", None, None))
            continue

        box = (det["x1"], det["y1"], det["x2"], det["y2"])
        is_blocking, path_cx, path_w = analyze_obstacle(box, pathway_mask)
        if is_blocking:
            results.append((det, "pass", path_cx, path_w))
            is_present = True
        else:
            results.append((det, "stage2_fail", path_cx, path_w))

    return is_present, results


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------
def draw_dashed_vline(img, x: int, colour, gap: int = 12, thickness: int = 1):
    h, y, draw = img.shape[0], 0, True
    while y < h:
        if draw:
            cv2.line(img, (x, y), (x, min(y + gap, h)), colour, thickness)
        y   += gap
        draw = not draw


def put_label(img, text: str, x: int, y: int, colour):
    font  = cv2.FONT_HERSHEY_SIMPLEX
    scale, thick = 0.45, 1
    (tw, th), bl = cv2.getTextSize(text, font, scale, thick)
    lx = max(0, min(x, img.shape[1] - tw - 4))
    ly = max(th + 4, min(y, img.shape[0] - bl - 2))
    cv2.rectangle(img, (lx - 2, ly - th - 2), (lx + tw + 2, ly + bl), COL_LABEL_BG, -1)
    cv2.putText(img, text, (lx, ly), font, scale, colour, thick, cv2.LINE_AA)


def annotate(img: np.ndarray, classified: list) -> np.ndarray:
    out  = img.copy()
    h    = out.shape[0]

    path_centres_drawn = set()

    for det, stage, path_cx, path_w in classified:
        obj_cx = (det["x1"] + det["x2"]) // 2

        # Obstacle centre vertical line (red)
        cv2.line(out, (obj_cx, 0), (obj_cx, h - 1), (0, 0, 255), 3)

        # Pathway centre line (black), drawn once per unique path_cx
        if path_cx is not None and path_cx not in path_centres_drawn:
            path_centres_drawn.add(path_cx)
            cv2.line(out, (path_cx, 0), (path_cx, h - 1), (0, 0, 0), 3)

    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_dir  = Path(sys.argv[1]).expanduser().resolve()
    output_dir = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) > 2 \
                 else input_dir / "width_restriction_output"

    if not input_dir.is_dir():
        print(f"Error: {input_dir} is not a directory")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading segmentation model : {SEG_MODEL_PATH}")
    seg_model = YOLO(str(SEG_MODEL_PATH))
    print(f"Loading obstacle model     : {OBS_MODEL_PATH}")
    obs_model = YOLO(str(OBS_MODEL_PATH))
    print("Models loaded.\n")

    images = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in IMAGE_EXTS)
    if not images:
        print(f"No images found in {input_dir}")
        sys.exit(0)

    present_count = 0
    for img_path in images:
        print(f"  {img_path.name} ...", end=" ", flush=True)

        img = cv2.imread(str(img_path))
        if img is None:
            print("(unreadable, skipped)")
            continue

        img_h, img_w = img.shape[:2]

        detections   = detect_obstacles(obs_model, img_path, img_h, img_w)
        pathway_mask = build_pathway_mask(seg_model, img_path, img_h, img_w)
        is_present, classified = classify_detections(detections, pathway_mask, img_w)

        if not is_present:
            n_det = len(detections)
            print(f"Not Present  ({n_det} detection{'s' if n_det != 1 else ''} found, none passed both stages)")
            continue

        annotated = annotate(img, classified)
        out_path  = output_dir / img_path.name
        cv2.imwrite(str(out_path), annotated)
        present_count += 1
        passed = sum(1 for _, s, _, _ in classified if s == "pass")
        print(f"Present  ({passed}/{len(detections)} detections passed both stages)  → {out_path.name}")

    print(f"\nDone. {present_count}/{len(images)} images flagged as Present.")
    print(f"Saved to: {output_dir}")


if __name__ == "__main__":
    main()
