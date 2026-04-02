"""
run_delineation_inference.py

Runs path_segmentation.pt on a folder of images and sorts them into:
  delineation/present/  — target class masks found in bottom 20% of image
  delineation/na/       — no qualifying masks detected

Target classes: "Red Stripe", "Wet Red Stripe", "Traffic Crossing", "Zebra Crossing"

Usage:
    python run_delineation_inference.py <images_folder> [--model <model_path>] [--conf <threshold>]
"""

import argparse
import shutil
from pathlib import Path

import numpy as np


TARGET_CLASS_NAMES = {"Red Stripe", "Wet Red Stripe", "Traffic Crossing", "Zebra Crossing", "Cycling Path", "Wet Cycling Path"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".tif"}


def parse_args():
    parser = argparse.ArgumentParser(description="Sort images by delineation class presence in bottom 20%.")
    parser.add_argument("images_folder", type=Path, help="Folder containing input images.")
    parser.add_argument(
        "--model",
        type=Path,
        default=Path(__file__).parent / "backend" / "models" / "path_segmentation.pt",
        help="Path to path_segmentation.pt (default: backend/models/path_segmentation.pt)",
    )
    parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold (default: 0.5)")
    return parser.parse_args()


def load_model(model_path: Path):
    from ultralytics import YOLO
    from ultralytics.nn import tasks as _ul_tasks

    # Patch BaseModel.fuse() for compatibility with older .pt files
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


def get_target_class_ids(model) -> set:
    """Return class IDs that match TARGET_CLASS_NAMES."""
    names = model.names  # dict: {id: name}
    ids = {cid for cid, name in names.items() if name in TARGET_CLASS_NAMES}
    found = {names[cid] for cid in ids}
    missing = TARGET_CLASS_NAMES - found
    if missing:
        print(f"Warning: these classes were not found in the model: {missing}")
    print(f"Target class IDs: { {names[cid]: cid for cid in ids} }")
    return ids


def mask_in_bottom_20(mask_tensor, threshold: float = 0.5) -> bool:
    """Return True if any mask pixel in the bottom 20% of the image is active."""
    mask = mask_tensor.cpu().numpy()  # (H, W), values 0–1
    h = mask.shape[0]
    cutoff = int(h * 0.8)  # row index where bottom 20% starts
    bottom_region = mask[cutoff:, :]
    return bool(np.any(bottom_region > threshold))


def process_images(images_folder: Path, model, target_ids: set, conf_thresh: float, output_root: Path):
    present_dir = output_root / "present"
    na_dir = output_root / "na"
    present_dir.mkdir(parents=True, exist_ok=True)
    na_dir.mkdir(parents=True, exist_ok=True)

    image_paths = [p for p in images_folder.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS]
    if not image_paths:
        print(f"No images found in {images_folder}")
        return

    print(f"Found {len(image_paths)} image(s). Processing...\n")

    for img_path in sorted(image_paths):
        results = model.predict(str(img_path), conf=conf_thresh, verbose=False)
        result = results[0]

        detected = False

        if result.masks is not None and result.boxes is not None:
            cls_ids = result.boxes.cls.int().tolist()
            confs = result.boxes.conf.tolist()
            masks = result.masks.data  # (N, H, W)

            for i, (cid, conf) in enumerate(zip(cls_ids, confs)):
                if cid in target_ids and conf >= conf_thresh:
                    if mask_in_bottom_20(masks[i]):
                        detected = True
                        break

        dest_dir = present_dir if detected else na_dir
        shutil.copy2(img_path, dest_dir / img_path.name)
        label = "PRESENT" if detected else "NA"
        print(f"[{label}] {img_path.name}")

    present_count = len(list(present_dir.iterdir()))
    na_count = len(list(na_dir.iterdir()))
    print(f"\nDone. present/: {present_count}  na/: {na_count}")
    print(f"Output: {output_root.resolve()}")


def main():
    args = parse_args()

    if not args.images_folder.is_dir():
        raise SystemExit(f"Error: '{args.images_folder}' is not a directory.")
    if not args.model.exists():
        raise SystemExit(f"Error: model not found at '{args.model}'.")

    output_root = Path("delineation")
    model = load_model(args.model)
    target_ids = get_target_class_ids(model)

    if not target_ids:
        raise SystemExit("Error: none of the target classes exist in this model. Check class names.")

    process_images(args.images_folder, model, target_ids, args.conf, output_root)


if __name__ == "__main__":
    main()
