from pathlib import Path

class Config:
    # data 目录位于项目根目录（和 app.py 同级）
    DATA_DIR = str((Path(__file__).resolve().parents[1] / "data"))
