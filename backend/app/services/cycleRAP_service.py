from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any, List
from pathlib import Path
import csv

# Replace with your real 55 attributes (string keys used in attributes.json / csv header)
REQUIRED_ATTRIBUTES: List[str] = [
    # --- Core roadway environment (examples) ---
    "speed_limit", "lane_width", "traffic_volume", "pavement_quality",
    "shoulder_width", "bike_lane_presence", "intersection_density",
    # ... add the remaining until you have 55 ...
]

@dataclass
class ScoreResult:
    BBScore: float
    BPScore: float
    VBScore: float
    SBScore: float
    CycleRapScore: float

    def as_dict(self) -> Dict[str, float]:
        return {
            "BBScore": self.BBScore,
            "BPScore": self.BPScore,
            "VBScore": self.VBScore,
            "SBScore": self.SBScore,
            "CycleRapScore": self.CycleRapScore,
        }

# --- Scoring Logic ---------------------------------------------------------

def _normalize(x: float, lo: float, hi: float) -> float:
    """Clamp + scale to [0,1]."""
    if hi == lo:
        return 0.0
    v = max(min(x, hi), lo)
    return (v - lo) / (hi - lo)

# You can configure these to match CycleRAP methodology
WEIGHTS = {
    "BB": {"speed_limit": 0.25, "traffic_volume": 0.25, "lane_width": 0.2, "bike_lane_presence": 0.3},
    "BP": {"intersection_density": 0.3, "traffic_volume": 0.25, "speed_limit": 0.25, "pavement_quality": 0.2},
    "VB": {"speed_limit": 0.3, "lane_width": 0.25, "shoulder_width": 0.25, "pavement_quality": 0.2},
    "SB": {"speed_limit": 0.25, "traffic_volume": 0.25, "intersection_density": 0.25, "pavement_quality": 0.25},
}

NORMALIZATION = {
    "speed_limit": (20.0, 70.0),
    "traffic_volume": (0.0, 2000.0),
    "lane_width": (2.0, 4.0),
    "pavement_quality": (1.0, 5.0),
    "shoulder_width": (0.0, 2.0),
    "bike_lane_presence": (0.0, 1.0),  # 0/1 categorical already in range
    "intersection_density": (0.0, 2.0), # per 100m, example
}

# master weight for final CycleRapScore (or compute another way)
FINAL_BLEND = {"BB": 0.25, "BP": 0.25, "VB": 0.25, "SB": 0.25}


def compute_scores(attributes: Dict[str, Any]) -> Dict[str, float]:
    """Compute CycleRAP sub-scores + final score.
    Replace with your authoritative formulae.
    """
    def score_bucket(key: str) -> float:
        weights = WEIGHTS[key]
        s = 0.0
        total = 0.0
        for feat, w in weights.items():
            total += w
            lo, hi = NORMALIZATION.get(feat, (0.0, 1.0))
            val = float(attributes.get(feat, 0.0))
            s += w * _normalize(val, lo, hi)
        return s / total if total else 0.0

    BB = score_bucket("BB")
    BP = score_bucket("BP")
    VB = score_bucket("VB")
    SB = score_bucket("SB")

    final = (
        FINAL_BLEND["BB"] * BB +
        FINAL_BLEND["BP"] * BP +
        FINAL_BLEND["VB"] * VB +
        FINAL_BLEND["SB"] * SB
    )

    return ScoreResult(BB, BP, VB, SB, final).as_dict()

# --- Treatment Logic -------------------------------------------------------

def compute_treatments(scores: Dict[str, float]) -> Dict[str, List[str]]:
    """Map score ranges to recommended treatments. Placeholder rules.
    Return a dict keyed by bucket with a list of suggested measures.
    """
    def bucket_rules(s: float) -> List[str]:
        if s >= 0.75:
            return [
                "Protected cycle track",
                "Speed calming (raised crossing / narrowing)",
                "High-visibility crossing treatments",
            ]
        if s >= 0.5:
            return [
                "Painted bike lane / advisory lane",
                "Enhanced signage + pavement markings",
                "Spot surface repairs",
            ]
        return [
            "Wayfinding + maintenance as-needed",
            "Monitor volumes and conflicts",
        ]

    return {
        "BB": bucket_rules(float(scores.get("BBScore", 0.0))),
        "BP": bucket_rules(float(scores.get("BPScore", 0.0))),
        "VB": bucket_rules(float(scores.get("VBScore", 0.0))),
        "SB": bucket_rules(float(scores.get("SBScore", 0.0))),
        "Overall": bucket_rules(float(scores.get("CycleRapScore", 0.0))),
    }

# --- CSV I/O ---------------------------------------------------------------

def load_attributes_csv(base_dir: Path, project: str, version: str, filename: str = "attributes.csv") -> Dict[str, Any]:
    p = base_dir / project / version / filename
    with p.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        if not rows:
            raise ValueError("attributes.csv has no rows")
        # choose first row for segment-level computation; adapt to your use-case
        return rows[0]


def append_result_csv(base_dir: Path, project: str, version: str, attributes: Dict[str, Any], scores: Dict[str, float]) -> Path:
    out_dir = base_dir / project / version
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "result.csv"

    # ensure header fields (attributes + scores)
    fieldnames = list(attributes.keys()) + ["BBScore", "BPScore", "VBScore", "SBScore", "CycleRapScore"]

    write_header = not out_path.exists()
    with out_path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        row = {**attributes, **scores}
        writer.writerow(row)
    return out_path