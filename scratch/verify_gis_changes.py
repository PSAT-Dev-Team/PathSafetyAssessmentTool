import requests
import json

def test_shapefiles_endpoint():
    url = "http://localhost:5000/api/shapefiles"
    try:
        res = requests.get(url)
        if res.ok:
            data = res.json()
            print(f"Total shapefiles: {len(data)}")
            if data:
                # Check first 3
                for i in range(min(3, len(data))):
                    item = data[i]
                    print(f"[{i}] {item['name']} | Type: {item.get('geom_type')} | Year: {item.get('year')} | Source: {item.get('source')}")
                
                # Check sorting
                names = [item['name'].lower() for item in data]
                if names == sorted(names):
                    print("✅ Sorting: Alphabetical order confirmed.")
                else:
                    print("❌ Sorting: Not alphabetical.")
        else:
            print(f"Error: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Could not connect to backend: {e}")

if __name__ == "__main__":
    test_shapefiles_endpoint()
