import pandas as pd
import openpyxl

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"
sheet_name = "CycleRAP Model"

print(f"Reading first 50 rows of '{sheet_name}'...")
try:
    # Read header=None to see raw first rows
    df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', nrows=50, header=None)
    
    # Print non-null content
    print("Shape:", df.shape)
    for i in range(len(df)):
        row = df.iloc[i]
        items = [(j, val) for j, val in enumerate(row) if pd.notna(val) and str(val).strip() != ""]
        if items:
            print(f"\nRow {i}:")
            for col_idx, val in items:
                # Limit value output length
                s_val = str(val)
                if len(s_val) > 100: s_val = s_val[:100] + "..."
                print(f"  Col {col_idx}: {s_val}")
                
except Exception as e:
    print(f"Error reading sheet: {e}")
