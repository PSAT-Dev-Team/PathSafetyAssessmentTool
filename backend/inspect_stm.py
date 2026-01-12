import openpyxl
import pandas as pd

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"
sheet_name = "STM"

print(f"Reading sheet '{sheet_name}' from '{file_path}'...")
try:
    # Use pandas for easier tabular viewing
    df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl')
    print("Shape:", df.shape)
    print("Columns:", df.columns.tolist())
    print("\nFirst 10 rows:")
    print(df.head(10).to_string())
    
    # Also inspect 'STM Results' just in case
    # sheet_name2 = "STM Results"
    # print(f"\nReading sheet '{sheet_name2}'...")
    # df2 = pd.read_excel(file_path, sheet_name=sheet_name2, engine='openpyxl')
    # print("Shape:", df2.shape)
    # print(df2.head(5).to_string())

except Exception as e:
    print(f"Error reading sheet: {e}")
