import sys
import json
import os

backend_path = r'c:\Users\Alaster\Documents\GitHub\PathSafetyAssessmentTool\backend'
sys.path.insert(0, backend_path)

from app import create_app

app = create_app()
client = app.test_client()

mappings = [
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BERWICK DRIVE", "folder_name": "BERWICK DRIVE_1Q2026", "project_name": "Berwick Drive"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BISHOPS PLACE", "folder_name": "BISHOPS PLACE_1Q2026", "project_name": "Bishops Place"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BLANDFORD DRIVE", "folder_name": "BLANDFORD DRIVE_1Q2026", "project_name": "Blandford Drive"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BLOXHOME DRIVE", "folder_name": "BLOXHOME DRIVE_1Q2026", "project_name": "Bloxhome Drive"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BODMIN DRIVE", "folder_name": "BODMIN DRIVE_1Q2026", "project_name": "Bodmin Drive"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BORTHWICK DRIVE", "folder_name": "BORTHWICK DRIVE_1Q2026", "project_name": "Borthwick Drive"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BRAEMAR DRIVE", "folder_name": "BRAEMAR DRIVE_1Q2026", "project_name": "Braemar Drive"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BRIDPORT AVENUE", "folder_name": "BRIDPORT AVENUE_1Q2026", "project_name": "Bridport Avenue"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BRIGHTON AVENUE", "folder_name": "BRIGHTON AVENUE_1Q2026", "project_name": "Brighton Avenue"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BRIGHTON CRESCENT", "folder_name": "BRIGHTON CRESCENT_1Q2026", "project_name": "Brighton Crescent"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\NE2\BROCKHAMPTON DRIVE", "folder_name": "BROCKHAMPTON DRIVE_1Q2026", "project_name": "Brockhampton Drive"},
    {"source_path": r"D:\LIGHTHAUS MAR 2026\LIGHTHAUS MAR 2026\SE1\BUKIT ARANG ROAD", "folder_name": "BUKIT ARANG ROAD_1Q2026", "project_name": "Bukit Arang Road"},
]

results = []

for m in mappings:
    source_path = m["source_path"]
    folder_name = m["folder_name"]
    project_name = m["project_name"]
    
    print(f"Processing {project_name}...")
    
    # 1. Copy local
    try:
        resp1 = client.post('/api/projects/folders/copy-local', 
                            json={'source_path': source_path, 'folder_name': folder_name}, 
                            environ_base={'REMOTE_ADDR': '127.0.0.1'})
        
        status1 = resp1.status_code
        data1 = resp1.get_json() if resp1.is_json else resp1.get_data(as_text=True)
    except Exception as e:
        results.append({
            "project_name": project_name,
            "folder_name": folder_name,
            "img_count": 0,
            "result": f"Exception: {str(e)}"
        })
        continue
    
    actual_folder_name = folder_name
    img_count = 0
    copy_msg = ""
    
    if status1 == 200 or status1 == 201:
        if isinstance(data1, dict):
            actual_folder_name = data1.get('folder_name', folder_name)
            img_count = data1.get('image_count', 0)
            copy_msg = "Success"
        else:
            copy_msg = f"Unexpected response: {data1}"
    else:
        copy_msg = f"Error {status1}: {data1}"
        results.append({
            "project_name": project_name,
            "folder_name": actual_folder_name,
            "img_count": img_count,
            "result": copy_msg
        })
        continue

    # 2. Create project
    try:
        resp2 = client.post('/api/projects/folders', 
                            json={'project_name': project_name, 'folder_name': actual_folder_name, 'tags': []}, 
                            environ_base={'REMOTE_ADDR': '127.0.0.1'})
        
        status2 = resp2.status_code
        data2 = resp2.get_json() if resp2.is_json else resp2.get_data(as_text=True)
    except Exception as e:
        results.append({
            "project_name": project_name,
            "folder_name": actual_folder_name,
            "img_count": img_count,
            "result": f"Exception: {str(e)}"
        })
        continue
    
    create_msg = ""
    if status2 == 200 or status2 == 201:
        create_msg = "Created"
    else:
        create_msg = f"Error {status2}: {data2}"
        
    results.append({
        "project_name": project_name,
        "folder_name": actual_folder_name,
        "img_count": img_count,
        "result": create_msg
    })

# Print result table
print(f"{'Project Name':<25} | {'Folder Name':<30} | {'Images':<6} | {'Result'}")
print("-" * 80)
for r in results:
    print(f"{r['project_name']:<25} | {r['folder_name']:<30} | {r['img_count']:<6} | {r['result']}")
