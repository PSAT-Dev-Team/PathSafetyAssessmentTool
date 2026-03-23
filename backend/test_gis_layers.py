import requests

# Try calling the local endpoint directly
url = "http://127.0.0.1:5000/api/projects/TestProject/gis/layers"
# Replace TestProject with an actual project name if needed, but the endpoint doesn't actually use project_name!
# Let's check the code:
# @bp.post("/<project_name>/gis/layers")
# def get_gis_layers(project_name: str):
# Actually, the endpoint ignores `project_name` because `_get_gis()` loads the global shapefiles directory!

resp = requests.post(url, json={
    "point": [103.850, 1.300], # Somewhere in Singapore
    "radius": 200,
    "layers": ["cycling", "shared", "footpath", "roadcrossing", "mrt_exit", "parking_lot", "kerb_line"]
})
print(resp.status_code)
if resp.status_code == 200:
    data = resp.json()
    print("Keys in response:", data.keys())
    if "layers" in data:
        for k, v in data["layers"].items():
            print(f"Layer {k}: {len(v)} features")
else:
    print(resp.text)
