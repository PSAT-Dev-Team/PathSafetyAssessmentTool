import geopandas as gpd
from pathlib import Path

shp_dir = Path("backend/shapefiles")
layers = {
    "bus_stop": shp_dir / "bus_stop" / "BusStop.shp",
    "bus_shelter": shp_dir / "bus_stop" / "BusShelter.shp",
    "bus_lane": shp_dir / "bus_lane" / "Bus lanes.shp"
}

for name, path in layers.items():
    print(f"\n--- Layer: {name} ---")
    if not path.exists():
        print(f"ERROR: File not found at {path}")
        continue
    
    try:
        gdf = gpd.read_file(path)
        print(f"Count: {len(gdf)}")
        print(f"CRS: {gdf.crs}")
        print(f"Geometry Types: {gdf.geom_type.unique()}")
        if len(gdf) > 0:
            print("Columns:", gdf.columns.tolist())
            print("First row sample head:")
            print(gdf.head(1).to_dict())
    except Exception as e:
        print(f"ERROR reading {name}: {e}")
