import os
import requests

url = "http://127.0.0.1:8000/api/shapefiles/upload"

files = [
    ("files", ("bus_stop.shp", b"dummy content", "application/octet-stream"))
]
data = {
    "category": "test_cat"
}

response = requests.post(url, files=files, data=data)
print("Status:", response.status_code)
print("Response:", response.text)
