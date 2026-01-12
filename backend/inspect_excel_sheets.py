import openpyxl
import os

file_path = "/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm"

print(f"Loading '{file_path}'...")
try:
    wb = openpyxl.load_workbook(file_path, read_only=True, keep_vba=True)
    print("Sheet names:")
    for sheet in wb.sheetnames:
        print(f"- {sheet}")
except Exception as e:
    print(f"Error loading workbook: {e}")
