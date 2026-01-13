import openpyxl

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"
sheet_name = "CycleRAP Model"

print(f"Loading '{file_path}'...")
wb = openpyxl.load_workbook(file_path, read_only=True, keep_vba=True)
ws = wb[sheet_name]

print(f"Searching for 'Vehicle' or 'VB' headers in '{sheet_name}' (First 20 rows)...")

for row_idx in range(1, 20):
    row_vals = []
    for col_idx in range(1, 150): # Scan wide
        cell = ws.cell(row=row_idx, column=col_idx)
        val = cell.value
        if val and isinstance(val, str) and ("Vehicle" in val or "VB" in val):
            print(f"Row {row_idx}, Col {col_idx} ({cell.coordinate}): {val}")
