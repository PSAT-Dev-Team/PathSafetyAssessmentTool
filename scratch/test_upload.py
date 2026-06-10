import requests
import io

url = "http://127.0.0.1:8000/api/shapefiles/upload"
files = [
    ("files", ("test.shp", b"test content", "application/octet-stream"))
]
data = {"category": "test_cat"}

try:
    response = requests.post(url, files=files, data=data)
    print(response.status_code)
    print(response.text)
except Exception as e:
    print("Error:", e)
