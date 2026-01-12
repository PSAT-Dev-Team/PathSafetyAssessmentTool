import pandas as pd
import openpyxl

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"
sheet_name = "STM"

print(f"Reading '{sheet_name}' cols A-F...")
try:
    # Read first 300 rows to be safe
    df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', usecols="A:F", header=None, nrows=300)
    print("Shape:", df.shape)
    
    print("Extracting Treatment Effects Logic:")
    
    current_treatment_name = ""
    
    for i in range(len(df)):
        row = df.iloc[i]
        
        # Col 0 (A): ID (e.g. 1)
        # Col 1 (B): Name (e.g. Upgrade...)
        # Col 2 (C): Attr ID (e.g. 14)
        # Col 3 (D): Attr Name
        # Col 4 (E): Value
        # Col 5 (F): Description
        
        # Debug first few rows
        if i < 3:
            print(f"DEBUG Row {i}: {row.tolist()}")

        val_id = row[0]
        name = row[1]
        attr_id = row[2]
        target_val = row[4]
        
        # If we have a treatment name, track it
        if pd.notna(name) and isinstance(name, str) and len(name) > 10:
             current_treatment_name = name
        
        # If we have an effect definition (Attr ID + Value)
        if pd.notna(attr_id) and pd.notna(target_val):
            # Skip header row (if Attr ID is string "Attribute 1 - column" etc)
            if str(attr_id).startswith("Attribute") or str(attr_id) == "Name":
                continue
                
            print(f"Row {i}: Treatment='{current_treatment_name}' | AttrID={attr_id} -> {target_val}")

except Exception as e:
    print(f"Error reading sheet: {e}")
