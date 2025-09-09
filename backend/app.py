from flask import Flask, jsonify
from flask_cors import CORS
from pathlib import Path
import pandas as pd

app = Flask(__name__)
CORS(app)  # Allow frontend access locally or from a future separate domain

DATA_PATH = Path(__file__).resolve().parent / "data" / "segments.csv"

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/segments")
def segments():
    if not DATA_PATH.exists():
        return jsonify([])  # Return empty list if file does not exist
    # Read all columns as strings to avoid frontend errors caused by type mismatch
    df = pd.read_csv(DATA_PATH, dtype=str).fillna("")
    return jsonify(df.to_dict(orient="records"))

if __name__ == "__main__":
    # Listen on port 8000, consistent with the frontend Vite proxy
    app.run(host="0.0.0.0", port=8000, debug=True)
