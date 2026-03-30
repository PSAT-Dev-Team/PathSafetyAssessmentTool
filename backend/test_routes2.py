import fiona
from pyproj import Transformer, CRS
from shapely.geometry import shape, mapping

def _read_shapefile_as_geojson(full_path, max_features=5000):
    features = []
    with fiona.open(full_path) as src:
        src_crs = CRS(src.crs) if src.crs else None
        transformer = None
        if src_crs and src_crs.to_epsg() != 4326:
            transformer = Transformer.from_crs(src_crs, CRS.from_epsg(4326), always_xy=True)

        count = 0
        for feat in src:
            if count >= max_features:
                break
            geom = shape(feat["geometry"])
            if transformer:
                from shapely.ops import transform
                geom = transform(transformer.transform, geom)

            props = {}
            for k, v in (feat.get("properties") or {}).items():
                if v is None:
                    props[k] = None
                elif isinstance(v, (int, float, str, bool)):
                    if isinstance(v, float) and (v != v or v == float("inf") or v == float("-inf")):
                        props[k] = None
                    else:
                        props[k] = v
                else:
                    props[k] = str(v)

            features.append({
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": props,
            })
            count += 1
    return {
        "type": "FeatureCollection",
        "features": features,
    }

shp_path = r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\backend\shapefiles\path\CyclingpathCentreline.shp"
try:
    print(f"Reading: {shp_path}")
    res = _read_shapefile_as_geojson(shp_path, max_features=10)
    print("Success. Read", len(res["features"]), "features.")
except Exception as e:
    import traceback
    traceback.print_exc()
