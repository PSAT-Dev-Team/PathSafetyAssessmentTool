import pandas as pd
import openpyxl

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"
sheet_name = "STM"

print(f"Reading first 20 rows of '{sheet_name}'...")
try:
    # Read header=None to see raw first rows
    df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', nrows=20, header=None)
    
    # Print non-null content of first few rows to identify headers
    print("Shape:", df.shape)
    for i in range(len(df)):
        row = df.iloc[i]
        # Filter out NaNs for display
        items = [(j, val) for j, val in enumerate(row) if pd.notna(val) and str(val).strip() != ""]
        if items:
            print(f"\nRow {i}:")
            for col_idx, val in items:
                print(f"  Col {col_idx}: {val}")
                
except Exception as e:
    print(f"Error reading sheet: {e}")
