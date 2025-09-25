from flask import current_app, jsonify
from pathlib import Path
from . import bp

@bp.get("/list")
def list_dirs_in_data():
    data_dir = Path(current_app.config["DATA_DIR"]).resolve()

    # 如果目录不存在，就创建
    if not data_dir.exists():
        data_dir.mkdir(parents=True, exist_ok=True)

    if not data_dir.is_dir():
        return jsonify({"error": f"DATA_DIR is not a directory: {data_dir}"}), 500

    # 仅目录，排除以 '.' 开头的隐藏项，并按名称排序
    dirs = sorted(
        [p.name for p in data_dir.iterdir() if p.is_dir() and not p.name.startswith(".")],
        key=str.lower
    )
    return jsonify({"dirs": dirs})