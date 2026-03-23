import os
import sys

# add backend path so it can import
sys.path.append(r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\backend")

try:
    import fiona
    from fiona import open as fiona_open
    print(f"Fiona version: {fiona.__version__}")
    print(f"Fiona path: {fiona.__file__}")
    
    # Let's try to just open a dummy file
    fiona.open('dummy.shp')
except Exception as e:
    import traceback
    traceback.print_exc()
