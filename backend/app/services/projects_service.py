# app/services/projects_service.py
from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple, Optional

import hashlib
import json
import pandas as pd
from flask import current_app


# ====== 路径与版本选择 ======
def _project_root(project: str) -> Path:
    root = Path(current_app.config["DATA_DIR"]).resolve() / project
    root.mkdir(parents=True, exist_ok=True)
    return root

def _version_dir(project: str) -> Path:
    return _project_root(project) / "version"

def _pick_latest_version(dirpath: Path) -> str:
    if not dirpath.exists():
        raise FileNotFoundError(f"Version directory not found: {dirpath}")
    candidates = [p.name for p in dirpath.iterdir() if p.is_dir() and not p.name.startswith(".")]
    if not candidates:
        raise FileNotFoundError(f"No version folders found under: {dirpath}")
    # 按名称排序（支持日期/semver），取最后一个
    return sorted(candidates)[-1]

def _attributes_path(project: str, version: str) -> Path:
    return _version_dir(project) / version / "attributes.csv"


# ====== Public I/O ======
def get_latest_attributes(project: str) -> Tuple[pd.DataFrame, str, Path]:
    vdir = _version_dir(project)
    version = _pick_latest_version(vdir)
    csv_path = _attributes_path(project, version)
    if not csv_path.exists():
        raise FileNotFoundError(f"attributes.csv not found: {csv_path}")
    df = pd.read_csv(csv_path, encoding=current_app.config["CSV_ENCODING"])
    return df, version, csv_path

def read_results(project: str) -> Optional[pd.DataFrame]:
    path = _project_root(project) / "results.csv"
    if not path.exists():
        return None
    return pd.read_csv(path, encoding=current_app.config["CSV_ENCODING"])


# ====== Scoring（占位，替换为你的真实逻辑）======
def _zscore(s: pd.Series) -> pd.Series:
    s = s.astype(float)
    return (s - s.mean()) / (s.std(ddof=0) + 1e-9)

def compute_cyclerap_scores(attrs_df: pd.DataFrame, params: Dict | None = None) -> pd.DataFrame:
    df = attrs_df.copy()

    if "segment_id" not in df.columns:
        df.insert(0, "segment_id", range(1, len(df) + 1))

    # 一个可运行的占位评分（低速/低流量/低曲率 + 大宽度 → 更安全）
    speed = _zscore(df["speed_limit"]) if "speed_limit" in df.columns else 0.0
    width = _zscore(df["width_m"]) if "width_m" in df.columns else 0.0
    traffic = _zscore(df["traffic_vol"]) if "traffic_vol" in df.columns else 0.0
    curve = _zscore(df["curvature"]) if "curvature" in df.columns else 0.0

    score = 0.40 * (-speed) + 0.30 * (width) + 0.20 * (-traffic) + 0.10 * (-curve)
    # 归一化到 0~1
    df["cyclerap_score"] = (score - getattr(score, "min", lambda: 0)()) / (
        getattr(score, "max", lambda: 1)() - getattr(score, "min", lambda: 0)() + 1e-9
    )

    return df


# ====== 持久化 ======
@dataclass
class RunMeta:
    project: str
    version: str
    run_ts: str
    params_hash: str

    def to_dict(self): return asdict(self)

def _hash_params(params: Dict | None) -> str:
    blob = json.dumps(params or {}, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:12]

def append_results(project: str, version: str, scored_df: pd.DataFrame, params: Dict | None = None):
    out_path = _project_root(project) / "results.csv"

    meta = RunMeta(
        project=project,
        version=version,
        run_ts=datetime.utcnow().isoformat(timespec="seconds") + "Z",
        params_hash=_hash_params(params),
    )

    out_df = scored_df.copy()
    # 在前面插入元数据列
    out_df.insert(0, "project", project)
    out_df.insert(1, "version", version)
    out_df.insert(2, "run_ts", meta.run_ts)
    out_df.insert(3, "params_hash", meta.params_hash)

    header = not out_path.exists()
    out_df.to_csv(out_path, mode="a", header=header, index=False, encoding=current_app.config["CSV_ENCODING"])
    return out_path, len(out_df)
