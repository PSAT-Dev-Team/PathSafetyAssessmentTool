from app import create_app
import json
import traceback

app = create_app()
with app.app_context():
    try:
        with app.test_client() as client:
            resp = client.post("/api/projects/TestProject/gis/layers", json={
                "point": [103.850, 1.300],
                "radius": 200,
                "layers": ["cycling", "shared", "footpath", "roadcrossing", "mrt_exit", "parking_lot", "kerb_line"]
            })
            print("Status code:", resp.status_code)
            if resp.status_code == 200:
                data = json.loads(resp.data.decode("utf-8"))
                if "layers" in data:
                    for k, v in data["layers"].items():
                        print(f"Layer {k}: {len(v)} features")
            else:
                print("Error payload:", resp.data.decode("utf-8"))
    except Exception as e:
        traceback.print_exc()
