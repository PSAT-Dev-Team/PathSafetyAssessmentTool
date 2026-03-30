from app import create_app
import traceback

app = create_app()

with app.test_client() as client:
    try:
        resp = client.get('/api/shapefiles')
        print("Status code:", resp.status_code)
        import json
        data = json.loads(resp.data.decode("utf-8"))
        for item in data[:5]:
            print(f"{item['name']} - Year: {item.get('year')} - Source: {item.get('source')}")
    except Exception as e:
        traceback.print_exc()
