from app import create_app
import traceback

app = create_app()
app.config['TESTING'] = True

with app.test_client() as client:
    try:
        resp = client.post('/api/shapefiles/geojson', json={
            "path": "path/CyclingpathCentreline.shp",
            "max_features": 10
        })
        print("Status code:", resp.status_code)
        print("Response:", resp.data.decode("utf-8"))
    except Exception as e:
        traceback.print_exc()
