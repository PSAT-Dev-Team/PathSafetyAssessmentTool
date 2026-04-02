import argparse
from pathlib import Path
from ultralytics import YOLO
import cv2
import numpy as np

def process_images(input_dir: str):
    # Setup paths
    base_dir = Path(__file__).parent.resolve()
    model_path = base_dir / "backend" / "models" / "path_segmentation.pt"

    output_dir = base_dir / "adj_road_out"
    adjroad_01_dir = output_dir / "adjroad_01"
    adjroad_13_dir = output_dir / "adjroad_13"
    unclassed_dir = output_dir / "unclassed"

    for d in [adjroad_01_dir, adjroad_13_dir, unclassed_dir]:
        d.mkdir(parents=True, exist_ok=True)

    if not model_path.exists():
        print(f"Error: Model not found at {model_path}")
        print("Please ensure you are running this script from the project root.")
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
        print(f"No images found in {input_dir}. Make sure the folder contains .jpg or .png files.")
        return

    print(f"Processing {len(image_paths)} images from {input_dir}...")

    names = model.names
    inv_names = {v: k for k, v in names.items()}
    ROAD_CLASS = inv_names.get('Road', 5)
    CROSSING_CLASSES = {inv_names[n] for n in ('Traffic Crossing', 'Zebra Crossing') if n in inv_names}

    for img_path in image_paths:
        results = model.predict(source=str(img_path), verbose=False)
        result = results[0]

        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            print(f"[{img_path.name}] -> No detections.")
            continue

        class_ids = boxes.cls.int().tolist()
        masks = result.masks

        if masks is None:
            print(f"[{img_path.name}] -> No segmentation masks found.")
            continue

        polygons = masks.xy
        img_h, img_w = result.orig_shape

        # Build combined road mask and crossing mask (binary)
        road_mask = np.zeros((img_h, img_w), dtype=np.uint8)
        crossing_mask = np.zeros((img_h, img_w), dtype=np.uint8)
        road_polys = []
        crossing_polys = []
        for i, cid in enumerate(class_ids):
            if i < len(polygons):
                poly = polygons[i]
                if len(poly) >= 3:
                    poly_int = np.array(poly, dtype=np.int32)
                    if cid == ROAD_CLASS:
                        cv2.fillPoly(road_mask, [poly_int], 1)
                        road_polys.append(poly_int)
                    elif cid in CROSSING_CLASSES:
                        cv2.fillPoly(crossing_mask, [poly_int], 1)
                        crossing_polys.append(poly_int)

        if not road_polys and not crossing_polys:
            print(f"[{img_path.name}] -> No Road or Crossing detected.")
            continue

        img = cv2.imread(str(img_path))
        if img is None:
            print(f"[{img_path.name}] -> Could not read image, skipping.")
            continue

        # Draw green road mask and cyan crossing mask overlay on image
        overlay = img.copy()
        for poly in road_polys:
            cv2.fillPoly(overlay, [poly], (0, 255, 0))
        for poly in crossing_polys:
            cv2.fillPoly(overlay, [poly], (255, 255, 0))
        cv2.addWeighted(overlay, 0.4, img, 0.6, 0, img)

        # --- Logic 1: Bottom 20% check ---
        bottom_start = int(0.8 * img_h)
        bottom_total_pixels = (img_h - bottom_start) * img_w
        bottom_road_ratio = int(np.sum(road_mask[bottom_start:, :])) / bottom_total_pixels
        crossing_in_bottom = bool(np.any(crossing_mask[bottom_start:, :]))

        if bottom_road_ratio >= 0.75 or crossing_in_bottom:
            reason = f"Road:{bottom_road_ratio:.2%}" if bottom_road_ratio >= 0.75 else "Crossing detected"
            dest_path = adjroad_01_dir / img_path.name
            annotation = f"Logic: Bottom 20% | {reason} -> adj01"
            print(f"[{img_path.name}] -> adjroad_01 (bottom 20%: {reason})")

        else:
            # --- Logic 2: Half-width split ---
            mid_x = img_w // 2
            combined_mask = np.clip(road_mask + crossing_mask, 0, 1)
            left_road_ratio = int(np.sum(combined_mask[:, :mid_x])) / (img_h * mid_x)
            right_road_ratio = int(np.sum(combined_mask[:, mid_x:])) / (img_h * (img_w - mid_x))

            # Draw vertical center line
            cv2.line(img, (mid_x, 0), (mid_x, img_h - 1), (255, 0, 0), 2)

            max_half_ratio = max(left_road_ratio, right_road_ratio)

            if max_half_ratio > 0.07:
                dest_path = adjroad_01_dir / img_path.name
                annotation = f"Logic: Half-split | L:{left_road_ratio:.2%} R:{right_road_ratio:.2%} -> adj01"
                print(f"[{img_path.name}] -> adjroad_01 (half-split L:{left_road_ratio:.2%} R:{right_road_ratio:.2%})")
            elif max_half_ratio >= 0.05 and max_half_ratio <= 0.07:
                dest_path = adjroad_13_dir / img_path.name
                annotation = f"Logic: Half-split | L:{left_road_ratio:.2%} R:{right_road_ratio:.2%} -> adj13"
                print(f"[{img_path.name}] -> adjroad_13 (half-split L:{left_road_ratio:.2%} R:{right_road_ratio:.2%})")
            else:
                dest_path = unclassed_dir / img_path.name
                annotation = f"Logic: Half-split | L:{left_road_ratio:.2%} R:{right_road_ratio:.2%} -> unclassed"
                print(f"[{img_path.name}] -> unclassed (half-split L:{left_road_ratio:.2%} R:{right_road_ratio:.2%}, below thresholds)")

        cv2.putText(img, annotation, (10, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2, cv2.LINE_AA)
        cv2.imwrite(str(dest_path), img)

    print(f"\nDone! Processed {len(image_paths)} images.")
    print(f"Results are saved in: {output_dir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process a folder of images and classify them based on Road mask.")
    parser.add_argument("input_dir", type=str, help="Path to the folder containing images to process.")
    args = parser.parse_args()

    process_images(args.input_dir)
