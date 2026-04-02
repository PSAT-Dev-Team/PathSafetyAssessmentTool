"""
run_attribute_inference.py

Runs path_segmentation.pt on a folder of images and assigns 12 CycleRAP
attributes per image using cascading conditions.  Each image is annotated
with its attribute table and saved to an output directory.

Usage:
    python run_attribute_inference.py <input_dir> [--output cyclerap_output]
                                     [--model backend/models/path_segmentation.pt]
                                     [--conf 0.5]
"""

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO
from ultralytics.nn import tasks as _ul_tasks

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
    }


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
        "Peak Pedestrian Flow":             "Low",
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
            "Peak Pedestrian Flow":             "Low",
            "Intersection/Road Crossing":       "Not Present",
            "No of Lanes on Intersecting Road": ">1 per direction",
        })

    return attrs


# ---------------------------------------------------------------------------
# Annotation
# ---------------------------------------------------------------------------

def annotate_image(
    img_path: Path,
    attrs: dict[str, str],
    output_dir: Path,
) -> None:
    """Draw a left-side attribute panel on the image and save it."""
    img = Image.open(img_path).convert("RGB")
    W, H = img.size

    # Font setup
    font_size = max(14, int(H / 42))
    label_font_size = max(12, int(font_size * 0.85))
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=font_size)
        label_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=label_font_size)
    except Exception:
        font = ImageFont.load_default()
        label_font = font

    # Compute panel dimensions
    row_height = int(font_size * 1.6)
    num_rows = len(attrs)
    panel_h = row_height * num_rows + int(row_height * 0.6)
    panel_w = min(int(W * 0.55), 620)
    panel_x = 0
    panel_y = 0

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    # Semi-transparent background
    draw.rectangle(
        [(panel_x, panel_y), (panel_x + panel_w, panel_y + panel_h)],
        fill=(0, 0, 0, 170),
    )

    # Facility type color bar
    facility_type = attrs.get("Facility Type", "")
    bar_color = FACILITY_COLORS.get(facility_type, (100, 100, 100))
    draw.rectangle(
        [(panel_x, panel_y), (panel_x + 6, panel_y + panel_h)],
        fill=(*bar_color, 255),
    )

    # Draw attribute rows
    y = panel_y + int(row_height * 0.3)
    padding_left = panel_x + 14

    for attr_name, attr_value in attrs.items():
        # Attribute name
        draw.text((padding_left, y), f"{attr_name}:", font=label_font, fill=(180, 180, 180, 255))
        # Value (right-aligned portion)
        value_x = padding_left + int(panel_w * 0.65)
        value_color = (120, 255, 120, 255) if attr_value == "Present" else (255, 255, 255, 255)
        if attr_value == "Not Present":
            value_color = (255, 130, 130, 255)
        draw.text((value_x, y), attr_value, font=font, fill=value_color)
        y += row_height

    # Composite overlay onto original
    img = img.convert("RGBA")
    img = Image.alpha_composite(img, overlay)
    img = img.convert("RGB")

    out_path = output_dir / img_path.name
    img.save(out_path)


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
        attrs = assign_attributes(masks, img_h, img_w)

        annotate_image(img_path, attrs, args.output)
        print(f"[{img_path.name}] {attrs['Facility Type']}")

    print(f"\nDone! Annotated {len(image_paths)} images.")
    print(f"Output: {args.output.resolve()}")


def main():
    args = parse_args()
    process_images(args)


if __name__ == "__main__":
    main()
