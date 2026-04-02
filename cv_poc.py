import argparse
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO

CATEGORY_COLORS = {
    "MIXED TRAFFIC": (220, 50, 50),
    "OFF ROAD BP":   (50, 150, 220),
    "MULTI":         (220, 160, 50),
    "SIDEWALK":      (80, 180, 80),
}

def annotate_image(img_path: Path, category: str, reasoning: str, output_dir: Path):
    img = Image.open(img_path).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    W, H = img.size
    banner_h = max(60, int(H * 0.08))
    color = CATEGORY_COLORS.get(category, (100, 100, 100))

    # Semi-transparent banner at bottom
    draw.rectangle([(0, H - banner_h), (W, H)], fill=(*color, 200))

    # Try to load a font, fall back to default
    font_large = font_small = None
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=int(banner_h * 0.42))
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size=int(banner_h * 0.30))
    except Exception:
        font_large = ImageFont.load_default()
        font_small = font_large

    padding = int(banner_h * 0.12)
    label_y = H - banner_h + padding
    reason_y = label_y + int(banner_h * 0.44)

    draw.text((padding, label_y), category, font=font_large, fill=(255, 255, 255))
    draw.text((padding, reason_y), reasoning, font=font_small, fill=(230, 230, 230))

    out_path = output_dir / img_path.name
    img.save(out_path)


def build_reasoning(detected: list[str]) -> str:
    if not detected:
        return "No targeted path classes detected"
    return f"Detected: {', '.join(detected)}"


def process_images(input_dir: str):
    base_dir = Path(__file__).parent.resolve()
    model_path = base_dir / "backend" / "models" / "path_segmentation.pt"

    output_dir = base_dir / "cv_output_annotated"
    output_dir.mkdir(parents=True, exist_ok=True)

    if not model_path.exists():
        print(f"Error: Model not found at {model_path}")
        return

    print(f"Loading model from {model_path}...")
    model = YOLO(model_path)

    input_path = Path(input_dir)
    if not input_path.exists() or not input_path.is_dir():
        print(f"Error: Input directory {input_dir} not found or is not a directory.")
        return

    valid_extensions = {".jpg", ".jpeg", ".png"}
    image_paths = [p for p in input_path.iterdir() if p.suffix.lower() in valid_extensions]

    if not image_paths:
        print(f"No images found in {input_dir}.")
        return

    print(f"Processing {len(image_paths)} images from {input_dir}...")

    names = model.names
    inv_names = {v: k for k, v in names.items()}

    # Classes grouped by category
    ROAD_CROSSING_CLASSES = {
        inv_names[k] for k in ('Traffic Crossing', 'Zebra Crossing') if k in inv_names
    }
    CYCLING_CLASSES = {
        inv_names[k] for k in ('Cycling Path', 'Wet Cycling Path') if k in inv_names
    }
    RED_STRIPE_CLASSES = {
        inv_names[k] for k in ('Red Stripe', 'Wet Red Stripe') if k in inv_names
    }
    SIDEWALK_CLASSES = {
        inv_names[k] for k in ('Pathway', 'Stone Pathway', 'Wet Pathway', 'Grey Tiled Pathway', 'Square Pathway') if k in inv_names
    }

    for img_path in image_paths:
        results = model.predict(source=str(img_path), verbose=False)
        result = results[0]

        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            annotate_image(img_path, "SIDEWALK", "No detections", output_dir)
            print(f"[{img_path.name}] -> SIDEWALK (no detections)")
            continue

        confidences = boxes.conf.tolist()
        class_ids = boxes.cls.int().tolist()
        masks = result.masks

        if masks is None:
            annotate_image(img_path, "SIDEWALK", "No segmentation masks", output_dir)
            print(f"[{img_path.name}] -> SIDEWALK (no masks)")
            continue

        mask_data = masks.data.cpu().numpy()  # (N, H_mask, W_mask)
        H_mask = mask_data.shape[1]
        bottom_row = int(H_mask * 0.65)       # rows >= this are the bottom 35%

        # Accumulate bottom-35% pixel area per group
        group_areas: dict[str, float] = {
            "MIXED TRAFFIC": 0.0,
            "OFF ROAD BP":   0.0,
            "MULTI":         0.0,
            "SIDEWALK":      0.0,
        }
        red_stripe_present = False
        detected_names: list[str] = []

        for i, (cid, conf) in enumerate(zip(class_ids, confidences)):
            if conf <= 0.75 or i >= len(mask_data):
                continue
            bottom_area = float(mask_data[i, bottom_row:, :].sum())
            if bottom_area == 0:
                continue

            class_name = names.get(cid, str(cid))
            detected_names.append(class_name)

            if cid in RED_STRIPE_CLASSES:
                red_stripe_present = True
                group_areas["MULTI"] += bottom_area
            elif cid in ROAD_CROSSING_CLASSES:
                group_areas["MIXED TRAFFIC"] += bottom_area
            elif cid in CYCLING_CLASSES:
                group_areas["OFF ROAD BP"] += bottom_area
            elif cid in SIDEWALK_CLASSES:
                group_areas["SIDEWALK"] += bottom_area

        if red_stripe_present:
            category = "MULTI"
        elif any(a > 0 for a in group_areas.values()):
            category = max(group_areas, key=lambda g: group_areas[g])
        else:
            category = "SIDEWALK"

        reasoning = build_reasoning(detected_names)
        print(f"[{img_path.name}] -> {category} | {reasoning}")
        annotate_image(img_path, category, reasoning, output_dir)

    print(f"\nDone! Annotated {len(image_paths)} images.")
    print(f"Results saved in: {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Classify and annotate path images with category and reasoning.")
    parser.add_argument("input_dir", type=str, help="Path to the folder containing images to process.")
    args = parser.parse_args()

    process_images(args.input_dir)
