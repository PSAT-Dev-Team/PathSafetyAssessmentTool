import sys
import os
import requests
import json

base = "http://127.0.0.1:8000"

def test_endpoint(project_name="test"):
    url = f"{base}/api/projects/{project_name}/gis/layers"
    # use a coordinate in singapore
    payload = {
        "point": [103.8198, 1.3521],
        "radius": 200,
        "layers": ["cycling", "shared", "footpath", "roadcrossing", "mrt_exit", "parking_lot", "kerb_line"]
    }
    
    try:
        resp = requests.post(url, json=payload, timeout=60)
        print("Status", resp.status_code)
        
        try:
            data = resp.json()
            print("Received JSON.")
            for layer in data:
                print(f"Layer '{layer}' returned {len(data[layer]['features'])} features.")
        except:
            print("Response text:", resp.text[:500])
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    # Let's get the list of projects first to pick a valid one
    try:
        r = requests.get(f"{base}/api/projects")
        data = r.json()
        if data:
            proj = data[0]["name"]
            print("Testing with project:", proj)
            test_endpoint(proj)
        else:
            print("No projects found, testing with 'test'")
            test_endpoint("test")
    except Exception as e:
        print("Failed to get projects:", e)
        test_endpoint("test")


