import pandas as pd
import openpyxl

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"
sheet_name = "STM"

print(f"Reading '{sheet_name}' cols A-F...")
try:
    # Read cols A:F (0 to 5)
    df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', usecols="A:F", header=None)
    
    current_treatment = None
    effects = []
    
    print("Extracting Treatment Effects Logic:")
    
    for i in range(len(df)):
        row = df.iloc[i]
        # Check if this row looks like a treatment effect definition
        # Col 1 (B) usually has text description
        # Col 2 (C) has attribute ID?
        # Col 4 (E) has target value
        
        desc = row[1]
        attr_id = row[2]
        attr_name = row[3]
        target_val = row[4]
        
        if pd.notna(desc) and isinstance(desc, str):
            # Check if it's a new treatment (starts with "Upgrade", "Install", "Improve", "Clear", "Redesign", "Widen", "Review", "Evaluate", "Reconfigure")
            # Or if it repeats the previous one
            
            if pd.notna(attr_id) and pd.notna(target_val):
                print(f"Row {i}: Treatment='{desc}' | AttrID={attr_id} ({attr_name}) -> {target_val}")

except Exception as e:
    print(f"Error reading sheet: {e}")
