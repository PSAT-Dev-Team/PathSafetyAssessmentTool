from app import create_app
import json

app = create_app()
with app.app_context():
    with app.test_client() as client:
        # Punggol or Toa Payoh coordinate - somewhere in Singapore
        # using a known valid WGS84 point from a typical project
        resp = client.post("/api/projects/TestProject/gis/layers", json={
            "point": [103.850, 1.300],
            "radius": 500,
            "layers": ["footpath", "cycling", "shared", "parking_lot", "kerb_line"]
        })
        print("Status code:", resp.status_code)
        if resp.status_code == 200:
            data = json.loads(resp.data.decode("utf-8"))
            if "layers" in data:
                for k, v in data["layers"].items():
                    print(f"Layer {k}: {len(v)} features")
                    if len(v) > 0:
                        first_feat = v[0]
                        print("  Example feature:", json.dumps(first_feat)[:200], "...")
        else:
            print("Error payload:", resp.data.decode("utf-8"))
