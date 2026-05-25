import pandas as pd
import geopandas as gpd

attr_path = r'C:\Users\Alaster\Documents\GitHub\PathSafetyAssessmentTool\data\TPYLor83Q25\versions\20260519\attributes.csv'
gpkg_path = r'C:\Users\Alaster\Documents\GitHub\PathSafetyAssessmentTool\data\TPYLor83Q25\geo_data.gpkg'

df = pd.read_csv(attr_path)
rows_to_print = [8, 23, 28, 34]
cols_to_print = ['image reference', 'Curvature', 'Curvature Sub-category']

print('--- Attributes ---')
print(df.iloc[rows_to_print][cols_to_print])

gdf = gpd.read_file(gpkg_path)
print('\n--- Geo Data ---')
for idx, row in gdf.iterrows():
    geom = row.geometry
    start_coord = geom.coords[0] if geom else None
    end_coord = geom.coords[-1] if geom else None
    length = geom.length if geom else None
    print(f'Image: {row["image reference"]}, Length: {length}, Start: {start_coord}, End: {end_coord}')
