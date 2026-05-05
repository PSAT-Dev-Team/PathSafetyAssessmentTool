import os
import re

files_to_update = {
    'src/pages/PathAnalysisPage/components/PathAnalysisMapView.tsx': '../../../components/common/ThemeAwareTileLayer',
    'src/pages/GisLayersPage/GisLayersPage.tsx': '../../components/common/ThemeAwareTileLayer',
    'src/pages/CodingPage/components/GeoDataPanel.tsx': '../../../components/common/ThemeAwareTileLayer',
    'src/pages/TreatmentPage/components/MapView.tsx': '../../../components/common/ThemeAwareTileLayer',
    'src/pages/TreatmentPage/components/TreatmentMapView.tsx': '../../../components/common/ThemeAwareTileLayer',
    'src/pages/AnalysisPage/components/MapView.tsx': '../../../components/common/ThemeAwareTileLayer',
    'src/components/visualization/width/WidthVisualization.tsx': '../../common/ThemeAwareTileLayer',
    'src/components/visualization/curvature/CurvatureVisualization.tsx': '../../common/ThemeAwareTileLayer'
}

tile_layer_regex = re.compile(r'<TileLayer\s+url="[^"]+"\s+attribution=\'[^"\'\[]+\'\s+maxZoom=\{22\}\s*/>|<TileLayer[^>]*/>', re.DOTALL)

for file_path, import_path in files_to_update.items():
    if not os.path.exists(file_path):
        print(f"Skipping {file_path}")
        continue
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Check if we already imported
    if "ThemeAwareTileLayer" not in content:
        # Replace the <TileLayer ... />
        new_content = tile_layer_regex.sub('<ThemeAwareTileLayer />', content)
        
        # Add import
        import_str = f'import ThemeAwareTileLayer from "{import_path}";'
        new_content = import_str + "\n" + new_content
        
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Updated {file_path}")

