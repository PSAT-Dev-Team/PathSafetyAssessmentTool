import sys
import os
import pandas as pd

# Fix paths to allow running from backend
sys.path.insert(0, os.path.abspath('backend'))
from backend.app.services.cyclerap_scoring import calculate_cyclerap_score_native

def run_test():
    attrs = {
        'Area type': 1, 'Facility Type': 1, 'Facility access': 1, 
        'Loose or slippery surface': 2, 'Tram or Train Rails': 2,
        'Major Surface Deformation or Drain Opening': 2,
        'Fixed Obstacle on Facility': 2, 'Non-Fixed Obstacle on Facility': 2,
        'Delineation': 1, 'Light Segregation': 1,
        'Facility Width per Direction': 2, 'Flow Direction': 1,
        'Width Restriction': 2, 'Adjacent Road Lane 0-1m': 2,
        'Adjacent Vehicle Parking 0-1m': 2, 'Adjacent Severe Hazard 0-1m': 2,
        'Adjacent object or level change 0-1m': 2, 'Adjacent Sidewalk 0-1m': 2,
        'Adjacent Road Lane 1-3m': 2, 'Adjacent Vehicle Parking 1-3m': 2,
        'Adjacent Severe Hazard 1-3m': 2, 'Adjacent object or level change 1-3m': 2,
        'Adjacent Sidewalk 1-3m': 2, 'Grade': 1, 'Curvature': 2,
        'Street Lighting': 1, 'Pedestrian Crossing': 2,
        'Intersecting Bicycle Facility': 2, 'Intersection Approach': 2,
        'Intersection or Road Crossing': 2, 'Crossing Facility': 2,
        'Number of lanes – adjacent road': 2, 'Number of lanes – intersecting road': 1,
        'Property Access': 2, 'Peak pedestrian flow along or across facility': 1,
        'Peak bicycle/LV traffic flow': 1, 'Observed proportion of cargo bikes and mopeds': 1,
        'Bicycle/LV speed – average': 1, 'Bicycle/LV speed differential': 1,
        'Heavy vehicle flow': 1, 'Road AADT': 6000,
        'Road speed limit': 50, 'Road operating speed (mean)': 50
    }

    df1 = pd.DataFrame([{**attrs, 'Line of Sight': 1}])
    df2 = pd.DataFrame([{**attrs, 'Line of Sight': 2}])

    res1 = calculate_cyclerap_score_native(df1)
    res2 = calculate_cyclerap_score_native(df2)
    
    print('WITH ADEQUATE (1):')
    for k, v in res1.to_dict('records')[0].items():
        print(f"  {k}: {v}")

    print('\nWITH INADEQUATE (2):')
    for k, v in res2.to_dict('records')[0].items():
        print(f"  {k}: {v}")

if __name__ == '__main__':
    run_test()
