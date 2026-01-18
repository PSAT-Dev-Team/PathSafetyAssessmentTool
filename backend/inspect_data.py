import sys
import os
from pathlib import Path

# Add backend directory to sys.path
sys.path.append(os.path.abspath("/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/backend"))

from app.services.project_manager import Project

def inspect_project(project_path_str):
    project_path = Path(project_path_str)
    project = Project(project_path)
    
    # Need to load the project
    # project.open_latest() 
    # Just accessing properties will load data
    project.latest()
    
    print(f"--- Project: {project_path.name} ---")
    
    # Check GeoData
    if project.geo_data and project.geo_data.df is not None:
        print("\nGeoData Columns:")
        print(project.geo_data.df.columns.tolist())
        if len(project.geo_data.df) > 0:
            print("\nGeoData Row 0:")
            # Print non-geometry columns to avoid huge output
            row = project.geo_data.df.iloc[0].drop('geometry', errors='ignore')
            print(row)
    else:
        print("\nGeoData is None or empty. Trying to load...")
        try:
             # Force load if not loaded? Project.__init__ doesn't load geo_data automatically?
             # It seems open_latest loads a version, but geo_data is project level.
             # Project.geo_data property getter tries to load?
             # Let's check getter implementation.
             pass 
        except Exception as e:
            print(f"Error loading GeoData: {e}")

    # Check Attributes
    latest = project.latest()
    if latest:
        print(f"\nLatest Version: {latest.date}")
        if latest.attributes and latest.attributes.df is not None:
            print("\nAttributes Columns:")
            print(latest.attributes.df.columns.tolist())
            if len(latest.attributes.df) > 0:
                print("\nAttributes Row 0:")
                print(latest.attributes.df.iloc[0])
    
if __name__ == "__main__":
    inspect_project("/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/data/testdeletion")
