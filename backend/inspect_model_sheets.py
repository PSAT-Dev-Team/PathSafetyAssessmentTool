import openpyxl
import pandas as pd

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"

sheets_to_inspect = ["CycleRAP Model", "Validation Rules"]

print(f"Loading '{file_path}'...")
try:
    for sheet_name in sheets_to_inspect:
        print(f"\n--- Reading sheet '{sheet_name}' ---")
        df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl')
        print("Shape:", df.shape)
        print("Columns:", df.columns.tolist()[:10]) # Show first 10 cols
        print(df.head(20).to_string())

except Exception as e:
    print(f"Error reading sheet: {e}")
