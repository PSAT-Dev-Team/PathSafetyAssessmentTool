import geopandas as gpd
import pandas as pd
import fiona

gpkg_path = r'data\TPYLor41Q2025\geo_data.gpkg'
csv_path = r'data\TPYLor41Q2025\versions\20260519\attributes.csv'

print(f"Layer names: {fiona.listlayers(gpkg_path)}")
gdf = gpd.read_file(gpkg_path)
print(f"Columns: {gdf.columns.tolist()}")
df = pd.read_csv(csv_path)

for i in [67, 68, 69, 70]:
    if i >= len(gdf) or i >= len(df): continue
    print(f"\n--- Row {i} ---")
    r_g = gdf.iloc[i]
    r_d = df.iloc[i]
    for c in [c for c in gdf.columns if 'image' in c.lower() or 'name' in c.lower()]:
        print(f"{c}: {r_g[c]}")
    g = r_g.geometry
    print(f"Type: {g.geom_type}")
    if hasattr(g, 'coords'):
        c = list(g.coords)
        print(f"First: {c[0]}")
        print(f"Last: {c[-1]}")
    print(f"Length: {g.length}")
    for col in ['Curvature', 'Curvature Sub-category']:
        if col in df.columns: print(f"{col}: {r_d[col]}")
