"""
Summarise and de-duplicate the in/ folder.

Phases:
  1. Rename plain (no quarter suffix) folders using image capture dates.
  2. De-duplicate: same road + same quarter appearing in multiple folders.
  3. Merge region splits (e.g. ROAD_NE1_1Q2026 + ROAD_NE4_1Q2026 -> ROAD_1Q2026).

Set DRY_RUN = False to apply changes. DRY_RUN = True (default) only prints
what would happen — nothing is renamed, merged, or deleted.
"""

# =============================================================
# CONFIGURATION
# =============================================================
DRY_RUN = True   # ← Set False to actually rename / merge / delete
# =============================================================

import io
import re
import sys
import shutil
from pathlib import Path
from collections import defaultdict

# Force UTF-8 output on Windows terminals
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).parent.parent
IN_DIR = ROOT / "in"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"}
METADATA_FILENAME = "psat-folder-summary.json"

# Matches e.g. Cam4_20260124_081110_726_A.jpeg -> captures YYYY MM DD
FILENAME_DATE_RE = re.compile(r"_(\d{4})(\d{2})\d{2}_")

# Matches [1-4]Q YYYY quarter suffix at end of folder name (with optional __N counter)
QUARTER_ONLY_RE = re.compile(r"^(.+)_([1-4]Q\d{4})(?:__\d+)?$", re.IGNORECASE)

# Matches REGION_QUARTER suffix: e.g. _NE1_1Q2026
REGION_QUARTER_RE = re.compile(r"^(.+)_([A-Z]{2}\d+)_([1-4]Q\d{4})(?:__\d+)?$", re.IGNORECASE)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _image_files(folder: Path) -> list[Path]:
    return [f for f in sorted(folder.iterdir())
            if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]


def _derive_quarter(folder: Path) -> str | None:
    """Return '1Q2026'-style label derived from embedded Cam4 filename dates.
    Returns None if folder has no parseable images or images span multiple quarters."""
    quarters: set[str] = set()
    for f in folder.iterdir():
        if not (f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS):
            continue
        m = FILENAME_DATE_RE.search(f.name)
        if m:
            year, month = int(m.group(1)), int(m.group(2))
            q = ((month - 1) // 3) + 1
            quarters.add(f"{q}Q{year}")
    if len(quarters) == 1:
        return next(iter(quarters))
    return None   # ambiguous or empty


def _parse_folder_name(name: str) -> tuple[str, str | None, str | None]:
    """Return (road_base, region_code, quarter).  Any component may be None."""
    m = REGION_QUARTER_RE.match(name)
    if m:
        return m.group(1).strip(), m.group(2).upper(), m.group(3).upper()
    m = QUARTER_ONLY_RE.match(name)
    if m:
        return m.group(1).strip(), None, m.group(2).upper()
    return name.strip(), None, None


def _has_quarter_suffix(name: str) -> bool:
    return bool(QUARTER_ONLY_RE.match(name)) or bool(REGION_QUARTER_RE.match(name))


def _filenames(folder: Path) -> set[str]:
    return {f.name for f in _image_files(folder)}


def _delete_metadata(folder: Path) -> None:
    meta = folder / METADATA_FILENAME
    if meta.exists():
        if not DRY_RUN:
            meta.unlink()


def _action(verb: str, detail: str) -> None:
    prefix = "[DRY RUN] " if DRY_RUN else "[ACTION]  "
    print(f"  {prefix}{verb}: {detail}")


def _info(msg: str) -> None:
    print(f"  {msg}")


# ------------------------------------------------------------------
# Phase 1 — Rename plain folders
# ------------------------------------------------------------------

def phase1_rename_plain():
    print("\n" + "=" * 60)
    print("PHASE 1: Rename unsuffixed folders")
    print("=" * 60)

    renamed = 0
    skipped_mixed = []
    skipped_empty = []
    conflict_pending = []   # (source_dir, target_name) for phase-2 follow-up

    for folder in sorted(IN_DIR.iterdir()):
        if not folder.is_dir():
            continue
        if _has_quarter_suffix(folder.name):
            continue

        quarter = _derive_quarter(folder)
        img_count = len(_image_files(folder))

        if img_count == 0:
            _info(f"SKIP  '{folder.name}' — no images found")
            skipped_empty.append(folder.name)
            continue

        if quarter is None:
            _info(f"SKIP  '{folder.name}' — mixed quarters in {img_count} images, manual review needed")
            skipped_mixed.append(folder.name)
            continue

        target_name = f"{folder.name}_{quarter}"
        target = IN_DIR / target_name

        if target.exists():
            _info(f"NOTE  '{folder.name}' -> '{target_name}' already exists -> queued for de-dup (Phase 2)")
            conflict_pending.append((folder, target_name, quarter))
        else:
            _action("RENAME", f"'{folder.name}' -> '{target_name}'  ({img_count} images, {quarter})")
            if not DRY_RUN:
                _delete_metadata(folder)
                folder.rename(target)
            renamed += 1

    print(f"\n  Summary: {renamed} renamed, {len(skipped_mixed)} mixed-quarter, "
          f"{len(skipped_empty)} empty, {len(conflict_pending)} conflict (see Phase 2)")
    return conflict_pending


# ------------------------------------------------------------------
# Phase 2 — De-duplicate (same road + same quarter)
# ------------------------------------------------------------------

def phase2_dedup(conflict_pending: list):
    print("\n" + "=" * 60)
    print("PHASE 2: De-duplicate same road + same quarter")
    print("=" * 60)

    # Build a map: (road_base.upper(), quarter) -> list of folders
    groups: dict[tuple[str, str], list[Path]] = defaultdict(list)

    for folder in sorted(IN_DIR.iterdir()):
        if not folder.is_dir():
            continue
        road_base, region, quarter = _parse_folder_name(folder.name)
        if quarter is None or region is not None:
            continue  # plain unsuffixed or region-split handled elsewhere
        groups[(road_base.upper(), quarter)].append(folder)

    # Also include the pending conflicts from phase 1 (plain -> renamed to existing target)
    # These are plain folders that share a quarter with an existing suffixed folder
    for plain_dir, target_name, quarter in conflict_pending:
        road_base, _, _ = _parse_folder_name(target_name)
        group_key = (road_base.upper(), quarter)
        if plain_dir not in groups[group_key]:
            groups[group_key].append(plain_dir)

    deleted = 0
    for (road_base, quarter), folders in sorted(groups.items()):
        if len(folders) < 2:
            continue

        print(f"\n  Road: {road_base}  Quarter: {quarter}")
        for f in folders:
            _info(f"    {f.name}: {len(_filenames(f))} images")

        # Identify the "canonical" folder: prefer the one whose name ends with _{quarter}
        # (i.e. no region code, no plain name) — highest image count as tiebreaker
        def rank(p: Path) -> tuple:
            _, reg, q = _parse_folder_name(p.name)
            has_quarter_suffix_and_no_region = (q == quarter and reg is None
                                                and _has_quarter_suffix(p.name))
            return (0 if has_quarter_suffix_and_no_region else 1, -len(_filenames(p)))

        canonical = sorted(folders, key=rank)[0]
        _info(f"    -> canonical: {canonical.name}")

        canonical_files = _filenames(canonical)

        for other in folders:
            if other == canonical:
                continue

            other_files = _filenames(other)
            unique_to_other = other_files - canonical_files

            if not unique_to_other:
                _action("DELETE", f"'{other.name}' — all {len(other_files)} images already in '{canonical.name}'")
                if not DRY_RUN:
                    _delete_metadata(other)
                    shutil.rmtree(other)
                deleted += 1
            else:
                _info(f"    ⚠ '{other.name}' has {len(unique_to_other)} unique images "
                      f"not in canonical — keeping both (run merge manually or re-check)")

    print(f"\n  Summary: {deleted} duplicate folders removed")


# ------------------------------------------------------------------
# Phase 3 — Merge region splits
# ------------------------------------------------------------------

def phase3_merge_regions():
    print("\n" + "=" * 60)
    print("PHASE 3: Merge region-split folders")
    print("=" * 60)

    # Build map: (road_base.upper(), quarter) -> list of region-split folders
    region_groups: dict[tuple[str, str], list[Path]] = defaultdict(list)

    for folder in sorted(IN_DIR.iterdir()):
        if not folder.is_dir():
            continue
        road_base, region, quarter = _parse_folder_name(folder.name)
        if region is None or quarter is None:
            continue
        region_groups[(road_base.upper(), quarter)].append(folder)

    merged_count = 0
    for (road_base_upper, quarter), region_folders in sorted(region_groups.items()):
        # Recover original-case road base from the first folder name
        first_road_base, _, _ = _parse_folder_name(region_folders[0].name)

        print(f"\n  Road: {first_road_base}  Quarter: {quarter}")
        for f in region_folders:
            _info(f"    {f.name}: {len(_filenames(f))} images")

        # Check all region folders share the same quarter (defensive, should always be true here)
        quarters_in_group = {_parse_folder_name(f.name)[2] for f in region_folders}
        if len(quarters_in_group) > 1:
            _info(f"  SKIP — folders span multiple quarters {quarters_in_group}, manual review needed")
            continue

        target_name = f"{first_road_base}_{quarter}"
        target = IN_DIR / target_name

        # Collect all unique images across region folders
        existing_in_target = _filenames(target) if target.exists() else set()
        all_region_files: dict[str, Path] = {}  # filename -> source path

        for rfolder in region_folders:
            for img in _image_files(rfolder):
                if img.name not in all_region_files:
                    all_region_files[img.name] = img

        new_files = {name: src for name, src in all_region_files.items()
                     if name not in existing_in_target}
        already_covered = len(all_region_files) - len(new_files)

        if target.exists():
            _info(f"    Target '{target_name}' already exists ({len(existing_in_target)} images)")
            _info(f"    {len(new_files)} new images to merge in, {already_covered} already present")
        else:
            _info(f"    Target '{target_name}' will be created with {len(new_files)} images")

        if new_files:
            _action("MERGE", f"{len(new_files)} images -> '{target_name}'")
            if not DRY_RUN:
                target.mkdir(exist_ok=True)
                _delete_metadata(target)
                for filename, src_path in new_files.items():
                    shutil.copy2(str(src_path), str(target / filename))

        for rfolder in region_folders:
            _action("DELETE", f"region folder '{rfolder.name}'")
            if not DRY_RUN:
                shutil.rmtree(rfolder)

        merged_count += 1

    print(f"\n  Summary: {merged_count} road(s) merged from region splits")


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main():
    if not IN_DIR.exists():
        print(f"ERROR: in/ folder not found at {IN_DIR}", file=sys.stderr)
        sys.exit(1)

    mode = "DRY RUN — no changes will be made" if DRY_RUN else "LIVE — changes will be applied"
    print(f"summarise_in_folder.py  [{mode}]")
    print(f"in/ path: {IN_DIR}")

    conflict_pending = phase1_rename_plain()
    phase2_dedup(conflict_pending)
    phase3_merge_regions()

    print("\nDone.")
    if DRY_RUN:
        print("Set DRY_RUN = False at the top of this script to apply changes.")


if __name__ == "__main__":
    main()
