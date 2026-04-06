"""
run_attribute_inference.py

Runs path_segmentation.pt on a folder of images and assigns 12 CycleRAP
attributes per image using cascading conditions.  Each image is annotated
with its attribute table and saved to an output directory.

Usage:
    python run_attribute_inference.py <input_dir> [--output cyclerap_output]
                                     [--model backend/models/path_segmentation.pt]
                                     [--obstacle-model obstacle_detector_ema.pt]
                                     [--conf 0.5]
"""

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO
from ultralytics.nn import tasks as _ul_tasks

# Make EMA available for unpickling the obstacle model.
# The model was saved with EMA referenced as ultralytics.nn.modules.block.EMA,
# so we inject our local EMA class into that module before loading.
from ema import EMA  # noqa: F401 – required for torch.load to resolve the class
import ultralytics.nn.modules.block as _ul_block
_ul_block.EMA = EMA

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}

FACILITY_COLORS = {
    "Sidewalk":                 (80, 180, 80),
    "Off-Road Bicycle Path":   (50, 150, 220),
    "Multi-Use Path":          (220, 160, 50),
    "Mixed Traffic Road Lane": (220, 50, 50),
}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Assign CycleRAP attributes to path images and annotate them.",
    )
    parser.add_argument("input_dir", type=Path, help="Folder containing input images.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("cyclerap_output"),
        help="Output directory for annotated images (default: cyclerap_output).",
    )
    parser.add_argument(
        "--model",
        type=Path,
        default=Path(__file__).parent / "backend" / "models" / "path_segmentation.pt",
        help="Path to path_segmentation.pt model.",
    )
    parser.add_argument(
        "--obstacle-model",
        type=Path,
        default=Path(__file__).parent / "obstacle_detector_ema.pt",
        help="Path to obstacle_detector_ema.pt model.",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.5,
        help="Confidence threshold (default: 0.5).",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Model loading (safe fuse-patch from run_delineation_inference.py)
# ---------------------------------------------------------------------------

def load_model(model_path: Path) -> YOLO:
    _orig_fuse = _ul_tasks.BaseModel.fuse

    def _safe_fuse(self, verbose=True):
        try:
            return _orig_fuse(self, verbose=verbose)
        except AttributeError:
            return self

    _ul_tasks.BaseModel.fuse = _safe_fuse

    print(f"Loading model: {model_path}")
    model = YOLO(str(model_path))
    return model


# ---------------------------------------------------------------------------
# Class-set helpers
# ---------------------------------------------------------------------------

def build_class_sets(model) -> dict[str, set[int]]:
    """Return class-ID sets keyed by semantic group."""
    inv = {v: k for k, v in model.names.items()}

    def _ids(*names):
        return {inv[n] for n in names if n in inv}

    return {
        "road":              _ids("Road"),
        "traffic_crossing":  _ids("Traffic Crossing"),
        "zebra_crossing":    _ids("Zebra Crossing"),
        "cycling":           _ids("Cycling Path", "Wet Cycling Path"),
        "red_stripe":        _ids("Red Stripe", "Wet Red Stripe"),
        "pathway":           _ids(
            "Pathway", "Cycling Path", "Stone Pathway", "Wet Pathway",
            "Grey Tiled Pathway", "Wet Cycling Path", "Square Pathway",
        ),
    }


# Fixed and non-fixed obstacle class names (matched against obstacle model's names dict)
FIXED_OBSTACLE_CLASSES = {
    "Pillar", "Bollards", "Fence", "Utility Box",
    "Traffic Light", "Billboard", "Lamp Post",
}
NON_FIXED_OBSTACLE_CLASSES = {"Cone", "Bins", "Bicycle", "Pot", "Barrier"}


def build_masks(
    result,
    class_sets: dict[str, set[int]],
    img_h: int,
    img_w: int,
    conf_thresh: float,
) -> dict[str, np.ndarray]:
    """Build one binary mask (H×W, uint8) per class group from a YOLO result."""
    masks_out = {key: np.zeros((img_h, img_w), dtype=np.uint8) for key in class_sets}

    boxes = result.boxes
    seg_masks = result.masks
    if boxes is None or seg_masks is None:
        return masks_out

    class_ids = boxes.cls.int().tolist()
    confidences = boxes.conf.tolist()
    polygons = seg_masks.xy

    for i, (cid, conf) in enumerate(zip(class_ids, confidences)):
        if conf < conf_thresh or i >= len(polygons):
            continue
        poly = polygons[i]
        if len(poly) < 3:
            continue
        poly_int = np.array(poly, dtype=np.int32)
        for key, id_set in class_sets.items():
            if cid in id_set:
                cv2.fillPoly(masks_out[key], [poly_int], 1)
                break

    return masks_out


# ---------------------------------------------------------------------------
# Obstacle detection
# ---------------------------------------------------------------------------

FIXED_COLOR     = (255, 80,  80)   # red   – fixed obstacles
NON_FIXED_COLOR = (255, 180, 50)   # amber – non-fixed obstacles


def detect_obstacles(
    img_path: Path,
    obstacle_model: YOLO,
    conf_thresh: float,
) -> tuple[str, str, list[dict]]:
    """
    Run the obstacle detector on *img_path* and determine whether Fixed and
    Non-Fixed obstacles are Present.

    A group is "Present" if at least one instance of a target class is detected.

    Returns (fixed_result, non_fixed_result, detections) where each detection is:
        {x1, y1, x2, y2, class_name, group ("fixed"|"non_fixed")}
    """
    results = obstacle_model.predict(source=str(img_path), conf=conf_thresh, verbose=False)
    result = results[0]

    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return ("Not Present", "Not Present", [])

    inv = {v: k for k, v in obstacle_model.names.items()}
    fixed_ids     = {inv[n] for n in FIXED_OBSTACLE_CLASSES     if n in inv}
    non_fixed_ids = {inv[n] for n in NON_FIXED_OBSTACLE_CLASSES if n in inv}
    relevant_ids  = fixed_ids | non_fixed_ids

    class_ids   = boxes.cls.int().tolist()
    confidences = boxes.conf.tolist()
    xyxy_boxes  = boxes.xyxy.cpu().numpy().astype(int)
    img_h, img_w = result.orig_shape

    detections: list[dict] = []
    fixed_present     = False
    non_fixed_present = False

    for i, (cid, conf) in enumerate(zip(class_ids, confidences)):
        if conf < conf_thresh or cid not in relevant_ids:
            continue
        x1, y1, x2, y2 = xyxy_boxes[i]
        x1, y1 = max(x1, 0), max(y1, 0)
        x2, y2 = min(x2, img_w - 1), min(y2, img_h - 1)

        group = "fixed" if cid in fixed_ids else "non_fixed"
        detections.append({
            "x1": x1, "y1": y1, "x2": x2, "y2": y2,
            "class_name": obstacle_model.names[cid],
            "group": group,
        })

        if group == "fixed":
            fixed_present = True
        else:
            non_fixed_present = True

    fixed_result     = "Present" if fixed_present     else "Not Present"
    non_fixed_result = "Present" if non_fixed_present else "Not Present"

    return (fixed_result, non_fixed_result, detections)


# ---------------------------------------------------------------------------
# Obstacle-width analysis  (mirrors obstacle-visualizer/backend/logic.py)
# ---------------------------------------------------------------------------

def analyze_obstacle(obstacle_box, path_mask, threshold=0.1):
    """Return (is_blocking, ratio, path_center_x, obstacle_center_x).

    Measures path width at the bottom edge of the obstacle bounding box using
    the 5th–95th percentile of path-pixel x-coordinates (same technique as
    obstacle-visualizer/backend/logic.py:analyze_obstacle).
    """
    x_min, y_min, x_max, y_max = map(int, obstacle_box)
    obstacle_center_x = int((x_min + x_max) / 2)
    bottom_y = min(y_max, path_mask.shape[0] - 1)

    path_row = path_mask[bottom_y, :]
    if not np.any(path_row):
        return False, 0.0, 0, 0  # obstacle not on path

    path_pixels_x = np.where(path_row > 0)[0]
    path_center_x = int(np.median(path_pixels_x))
    path_width = np.percentile(path_pixels_x, 95) - np.percentile(path_pixels_x, 5)

    if path_width < 10:
        return False, 0.0, 0, 0  # path too narrow to reliably analyse

    deviation = abs(path_center_x - obstacle_center_x)
    ratio = deviation / path_width
    is_blocking = ratio < threshold
    return is_blocking, ratio, path_center_x, obstacle_center_x


def compute_width_restriction(pathway_mask: np.ndarray, detections: list[dict]) -> str:
    """Width Restriction is Present if any detected obstacle blocks the pathway."""
    for det in detections:
        box = (det["x1"], det["y1"], det["x2"], det["y2"])
        is_blocking, _, _, _ = analyze_obstacle(box, pathway_mask)
        if is_blocking:
            return "Present"
    return "Not Present"


# ---------------------------------------------------------------------------
# Adjacent-road logic  (from adjroad_poc.py)
# ---------------------------------------------------------------------------

def compute_adjroad(
    road_mask: np.ndarray,
    crossing_mask: np.ndarray,
    img_h: int,
    img_w: int,
) -> tuple[str, str]:
    """Return (adj_road_01m, adj_road_13m) each 'Present' or 'Not Present'."""
    # Logic 1 – bottom 20 %
    bottom_start = int(0.8 * img_h)
    bottom_pixels = (img_h - bottom_start) * img_w
    bottom_road_ratio = int(np.sum(road_mask[bottom_start:, :])) / max(bottom_pixels, 1)
    crossing_in_bottom = bool(np.any(crossing_mask[bottom_start:, :]))

    if bottom_road_ratio >= 0.75 or crossing_in_bottom:
        return ("Present", "Not Present")

    # Logic 2 – half-width split
    mid_x = img_w // 2
    combined = np.clip(road_mask + crossing_mask, 0, 1)
    left_ratio = int(np.sum(combined[:, :mid_x])) / max(img_h * mid_x, 1)
    right_ratio = int(np.sum(combined[:, mid_x:])) / max(img_h * (img_w - mid_x), 1)
    max_ratio = max(left_ratio, right_ratio)

    if max_ratio > 0.07:
        return ("Present", "Not Present")
    elif max_ratio >= 0.05:
        return ("Not Present", "Present")
    else:
        return ("Not Present", "Not Present")


# ---------------------------------------------------------------------------
# Bottom-region checks
# ---------------------------------------------------------------------------

def check_bottom_presence(mask: np.ndarray, img_h: int, fraction: float) -> bool:
    """True if *any* pixel in the bottom `fraction` of the image is nonzero."""
    cutoff = int(img_h * (1.0 - fraction))
    return bool(np.any(mask[cutoff:, :]))


def check_bottom_majority(
    mask: np.ndarray,
    img_h: int,
    img_w: int,
    fraction: float = 0.10,
    threshold: float = 0.80,
) -> bool:
    """True if mask covers >= `threshold` of the bottom `fraction` region."""
    cutoff = int(img_h * (1.0 - fraction))
    region_pixels = (img_h - cutoff) * img_w
    if region_pixels == 0:
        return False
    ratio = float(np.sum(mask[cutoff:, :])) / region_pixels
    return ratio >= threshold


# ---------------------------------------------------------------------------
# Cascade attribute assignment
# ---------------------------------------------------------------------------

def assign_attributes(
    masks: dict[str, np.ndarray],
    img_h: int,
    img_w: int,
    fixed_obstacles: str = "Not Present",
    non_fixed_obstacles: str = "Not Present",
    width_restriction: str = "Not Present",
    fo_type: str | None = None,
    nfo_type: str | None = None,
) -> dict[str, str]:
    """Apply cascading conditions and return the 12 CycleRAP attributes."""
    # Combined crossing mask for adjroad computation
    crossing_mask = np.clip(
        masks["traffic_crossing"] + masks["zebra_crossing"], 0, 1
    )
    adj_01, adj_13 = compute_adjroad(masks["road"], crossing_mask, img_h, img_w)

    # Step 1 – Defaults (Sidewalk)
    attrs = {
        "Facility Type":                    "Sidewalk",
        "Light Segregation":                "Present",
        "Delineation":                      "Not Present",
        "Adjacent Road Lane 0-1m":          adj_01,
        "Adjacent Road Lane 1-3m":          adj_13,
        "Adjacent Object/Level Change 0-1m": adj_01,
        "Adjacent Object/Level Change 1-3m": adj_13,
        "Adjacent Sidewalk 0-1m":           "Not Present",
        "Crossing Facility":                "Not Present",
        "Crossing Type":                    None,
        "Width Restriction":               width_restriction,
        "Peak Pedestrian Flow":            "Low",
        "Intersection/Road Crossing":       "Not Present",
        "No of Lanes on Intersecting Road": "1 per direction",
    }

    # Step 2 – Cycling Path / Wet Cycling Path in bottom 20 %
    if check_bottom_presence(masks["cycling"], img_h, fraction=0.20):
        attrs["Facility Type"] = "Off-Road Bicycle Path"
        attrs["Delineation"] = "Present"
        attrs["Adjacent Sidewalk 0-1m"] = "Present"

    # Step 3 – Red Stripe / Wet Red Stripe in bottom 20 %
    if check_bottom_presence(masks["red_stripe"], img_h, fraction=0.20):
        attrs["Facility Type"] = "Multi-Use Path"
        attrs["Delineation"] = "Present"

    # Step 4 – Traffic Crossing >= 80 % of bottom 10 %
    if check_bottom_majority(masks["traffic_crossing"], img_h, img_w):
        attrs.update({
            "Facility Type":                    "Mixed Traffic Road Lane",
            "Light Segregation":                "Not Present",
            "Delineation":                      "Present",
            "Adjacent Road Lane 0-1m":          "Present",
            "Adjacent Road Lane 1-3m":          "Not Present",
            "Adjacent Object/Level Change 0-1m": "Not Present",
            "Adjacent Object/Level Change 1-3m": "Not Present",
            "Adjacent Sidewalk 0-1m":           "Not Present",
            "Crossing Facility":                "Present",
            "Crossing Type":                    "Traffic Crossing",
            "Peak Pedestrian Flow":             "Low",
            "Intersection/Road Crossing":       "Present",
            "No of Lanes on Intersecting Road": ">1 per direction",
        })

    # Step 5 – Zebra Crossing >= 80 % of bottom 10 %
    if check_bottom_majority(masks["zebra_crossing"], img_h, img_w):
        attrs.update({
            "Facility Type":                    "Mixed Traffic Road Lane",
            "Light Segregation":                "Not Present",
            "Delineation":                      "Present",
            "Adjacent Road Lane 0-1m":          "Present",
            "Adjacent Road Lane 1-3m":          "Not Present",
            "Adjacent Object/Level Change 0-1m": "Not Present",
            "Adjacent Object/Level Change 1-3m": "Not Present",
            "Adjacent Sidewalk 0-1m":           "Not Present",
            "Crossing Facility":                "Present",
            "Crossing Type":                    "Zebra Crossing",
            "Peak Pedestrian Flow":             "Low",
            "Intersection/Road Crossing":       "Present",
            "No of Lanes on Intersecting Road": "1 per direction",
        })

    # Step 6 – Road >= 80 % of bottom 10 %
    if check_bottom_majority(masks["road"], img_h, img_w):
        attrs.update({
            "Facility Type":                    "Mixed Traffic Road Lane",
            "Light Segregation":                "Not Present",
            "Delineation":                      "Not Present",
            "Adjacent Road Lane 0-1m":          "Present",
            "Adjacent Road Lane 1-3m":          "Not Present",
            "Adjacent Object/Level Change 0-1m": "Not Present",
            "Adjacent Object/Level Change 1-3m": "Not Present",
            "Adjacent Sidewalk 0-1m":           "Not Present",
            "Crossing Facility":                "Not Present",
            "Crossing Type":                    None,
            "Peak Pedestrian Flow":             "Low",
            "Intersection/Road Crossing":       "Not Present",
            "No of Lanes on Intersecting Road": ">1 per direction",
        })

    # Obstacle attributes (appended last so they appear at the bottom of the panel)
    attrs["Fixed Obstacles"]     = fixed_obstacles
    attrs["Non-Fixed Obstacles"] = non_fixed_obstacles
    attrs["FO Type"]             = fo_type
    attrs["NFO Type"]            = nfo_type

    return attrs


# ---------------------------------------------------------------------------
# Annotation
# ---------------------------------------------------------------------------

BLOCKING_LINE_COLOR = (255, 0, 255)   # magenta – path-centre marker and line
PATH_CENTER_RADIUS  = 5               # pixels


def annotate_image(
    img_path: Path,
    attrs: dict[str, str],
    output_dir: Path,
    detections: list[dict] | None = None,
    pathway_mask: np.ndarray | None = None,
) -> None:
    """
    Draw obstacle annotations on the image:
      - Bounding boxes for detected fixed/non-fixed obstacles
      - For blocking obstacles: bottom-edge circles (obstacle centre + path centre)
        and a connecting line, mirroring obstacle-visualizer/backend/logic.py
      - A small panel showing Fixed/Non-Fixed Obstacle and Width Restriction status
    """
    img = Image.open(img_path).convert("RGBA")
    W, H = img.size

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    # Fonts shared by both sections
    det_font_size  = max(11, int(H / 60))
    panel_font_size = max(14, int(H / 42))
    try:
        det_font   = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=det_font_size)
        panel_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=panel_font_size)
        panel_lbl_font = ImageFont.truetype(
            "/System/Library/Fonts/Helvetica.ttc",
            size=max(12, int(panel_font_size * 0.85)),
        )
    except Exception:
        det_font = panel_font = panel_lbl_font = ImageFont.load_default()

    r = PATH_CENTER_RADIUS

    # --- 1. Obstacle bounding boxes + blocking overlay ---
    if detections:
        for det in detections:
            color = FIXED_COLOR if det["group"] == "fixed" else NON_FIXED_COLOR
            x1, y1, x2, y2 = det["x1"], det["y1"], det["x2"], det["y2"]

            # Bounding box border (2 px)
            draw.rectangle([(x1, y1), (x2, y2)], outline=(*color, 255), width=2)

            # Class label above the box
            label = det["class_name"]
            lbbox = draw.textbbox((0, 0), label, font=det_font)
            lw, lh = lbbox[2] - lbbox[0], lbbox[3] - lbbox[1]
            lx, ly = x1, max(y1 - lh - 4, 0)
            draw.rectangle([(lx, ly), (lx + lw + 4, ly + lh + 4)], fill=(*color, 200))
            draw.text((lx + 2, ly + 2), label, font=det_font, fill=(255, 255, 255, 255))

            # Blocking analysis overlay (mirrors obstacle-visualizer logic.py)
            if pathway_mask is not None:
                box = (x1, y1, x2, y2)
                is_blocking, _, p_cx, o_cx = analyze_obstacle(box, pathway_mask)
                if is_blocking and p_cx > 0 and o_cx > 0:
                    bottom_y = min(y2, H - 1)
                    # Obstacle centre dot (detection colour)
                    draw.ellipse(
                        [(o_cx - r, bottom_y - r), (o_cx + r, bottom_y + r)],
                        fill=(*color, 255),
                    )
                    # Path centre dot (magenta)
                    draw.ellipse(
                        [(p_cx - r, bottom_y - r), (p_cx + r, bottom_y + r)],
                        fill=(*BLOCKING_LINE_COLOR, 255),
                    )
                    # Connecting line (magenta)
                    draw.line(
                        [(o_cx, bottom_y), (p_cx, bottom_y)],
                        fill=(*BLOCKING_LINE_COLOR, 255),
                        width=2,
                    )

    # --- 2. Small obstacle-status panel ---
    panel_attrs = {
        k: v for k, v in attrs.items()
        if k in ("Fixed Obstacles", "Non-Fixed Obstacles", "Width Restriction")
    }

    row_height = int(panel_font_size * 1.6)
    panel_h    = row_height * len(panel_attrs) + int(row_height * 0.6)
    panel_w    = min(int(W * 0.45), 480)

    draw.rectangle([(0, 0), (panel_w, panel_h)], fill=(0, 0, 0, 170))
    # Left accent bar
    draw.rectangle([(0, 0), (5, panel_h)], fill=(180, 180, 180, 255))

    y = int(row_height * 0.3)
    padding = 14
    for attr_name, attr_value in panel_attrs.items():
        draw.text((padding, y), f"{attr_name}:", font=panel_lbl_font, fill=(180, 180, 180, 255))
        value_x = padding + int(panel_w * 0.62)
        if attr_value == "Present":
            value_color = (120, 255, 120, 255)
        elif attr_value == "Not Present":
            value_color = (255, 130, 130, 255)
        else:
            value_color = (255, 255, 255, 255)
        draw.text((value_x, y), attr_value, font=panel_font, fill=value_color)
        y += row_height

    img = Image.alpha_composite(img, overlay)
    img = img.convert("RGB")
    img.save(output_dir / img_path.name)


# ---------------------------------------------------------------------------
# Main processing loop
# ---------------------------------------------------------------------------

def process_images(args):
    if not args.input_dir.is_dir():
        raise SystemExit(f"Error: '{args.input_dir}' is not a directory.")
    if not args.model.exists():
        raise SystemExit(f"Error: model not found at '{args.model}'.")

    args.output.mkdir(parents=True, exist_ok=True)

    model = load_model(args.model)
    class_sets = build_class_sets(model)

    print(f"Class sets: { {k: {model.names[cid] for cid in v} for k, v in class_sets.items()} }")

    # Load obstacle detection model (optional — skip gracefully if missing)
    obstacle_model = None
    obstacle_model_path = args.obstacle_model
    if obstacle_model_path.exists():
        print(f"Loading obstacle model: {obstacle_model_path}")
        obstacle_model = load_model(obstacle_model_path)
        print(f"Obstacle model classes: {list(obstacle_model.names.values())}")
    else:
        print(f"Warning: obstacle model not found at '{obstacle_model_path}'. "
              "Fixed/Non-Fixed Obstacles will default to 'Not Present'.")

    image_paths = sorted(
        p for p in args.input_dir.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS
    )
    if not image_paths:
        raise SystemExit(f"No images found in {args.input_dir}")

    print(f"Processing {len(image_paths)} images...\n")

    for img_path in image_paths:
        results = model.predict(source=str(img_path), conf=args.conf, verbose=False)
        result = results[0]
        img_h, img_w = result.orig_shape

        masks = build_masks(result, class_sets, img_h, img_w, args.conf)

        # Detect obstacles against the combined pathway mask
        if obstacle_model is not None:
            fixed_obs, non_fixed_obs, detections = detect_obstacles(
                img_path, obstacle_model, args.conf
            )
        else:
            fixed_obs, non_fixed_obs, detections = "Not Present", "Not Present", []

        width_restriction = compute_width_restriction(masks["pathway"], detections)

        # Collect all detected obstacle class names for FO Type / NFO Type
        all_fixed_classes = sorted(set(d["class_name"] for d in detections if d["group"] == "fixed"))
        all_nf_classes = sorted(set(d["class_name"] for d in detections if d["group"] == "non_fixed"))
        fo_type_str = ", ".join(all_fixed_classes) if all_fixed_classes else None
        nfo_type_str = ", ".join(all_nf_classes) if all_nf_classes else None

        attrs = assign_attributes(
            masks, img_h, img_w, fixed_obs, non_fixed_obs, width_restriction,
            fo_type=fo_type_str, nfo_type=nfo_type_str,
        )

        visible = [
            d for d in detections
            if (d["group"] == "fixed"     and fixed_obs     == "Present")
            or (d["group"] == "non_fixed" and non_fixed_obs == "Present")
        ]
        annotate_image(img_path, attrs, args.output, detections=visible,
                       pathway_mask=masks["pathway"])
        print(f"[{img_path.name}] {attrs['Facility Type']} | "
              f"Fixed: {fixed_obs} | Non-Fixed: {non_fixed_obs}")

    print(f"\nDone! Annotated {len(image_paths)} images.")
    print(f"Output: {args.output.resolve()}")


def main():
    args = parse_args()
    process_images(args)


if __name__ == "__main__":
    main()
