from flask import current_app, jsonify
from pathlib import Path
from . import bp

@bp.get("/list")
def list_dirs_in_data():
    data_dir = Path(current_app.config["DATA_DIR"]).resolve()
    if not data_dir.exists() or not data_dir.is_dir():
        return jsonify({"error": f"DATA_DIR not found: {data_dir}"}), 500

    # 仅目录，排除以 '.' 开头的隐藏项，并按名称排序
    dirs = sorted(
        [p.name for p in data_dir.iterdir() if p.is_dir() and not p.name.startswith(".")],
        key=str.lower
    )
    return jsonify({"dirs": dirs})