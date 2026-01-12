import openpyxl

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"
sheet_name = "STM"

print(f"Loading '{file_path}'...")
# data_only=False to read formulas
wb = openpyxl.load_workbook(file_path, read_only=True, data_only=False, keep_vba=True)
ws = wb[sheet_name]

print(f"Inspecting formulas in '{sheet_name}' (Rows 13-20, Cols 130-140)...")

for row_idx in range(13, 21):
    print(f"\nRow {row_idx}:")
    for col_idx in range(130, 145): # Inspect a range of columns
        cell = ws.cell(row=row_idx, column=col_idx)
        val = cell.value
        # If it starts with =, it's a formula
        if isinstance(val, str) and val.startswith("="):
             print(f"  Col {col_idx} ({cell.coordinate}): FORMULA: {val}")
        elif val is not None:
             print(f"  Col {col_idx} ({cell.coordinate}): {val}")
