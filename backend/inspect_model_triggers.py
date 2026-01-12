import pandas as pd
import openpyxl

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"
sheet_name = "CycleRAP Model"

print(f"Reading '{sheet_name}' rows 10-30, cols J-P...")
try:
    # usecols "J:P" is indices 9 to 15
    df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', header=None, skiprows=9, nrows=21, usecols="J:P")
    
    # Adjust index for display (matches Excel row numbers 10-30)
    df.index = range(10, 31)
    
    print(df.to_string())
                
except Exception as e:
    print(f"Error reading sheet: {e}")
