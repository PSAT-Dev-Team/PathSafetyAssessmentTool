
import os
from pathlib import Path

DATA_DIR = Path("/Users/xh/School/Final Year/cyclerap/PathSafetyAssessmentTool/data")
IMAGES_DIR_NAME = "images"

def verify_images():
    if not DATA_DIR.exists():
        print(f"Data directory not found: {DATA_DIR}")
        return

    print(f"Checking projects in: {DATA_DIR}\n")
    
    projects = [p for p in DATA_DIR.iterdir() if p.is_dir()]
    projects.sort(key=lambda x: x.name)

    issues_found = False

    for project_dir in projects:
        project_name = project_dir.name
        images_dir = project_dir / IMAGES_DIR_NAME
        
        if not images_dir.exists():
            # print(f"SKIP: {project_name} (no images folder)")
            continue
            
        expected_prefix = f"{project_name}_"
        mismatches = []
        
        count = 0
        for img_file in images_dir.iterdir():
            if img_file.name.startswith("."): continue # Skip hidden files
            if not img_file.is_file(): continue
            
            count += 1
            if not img_file.name.startswith(expected_prefix):
                mismatches.append(img_file.name)
        
        if mismatches:
            issues_found = True
            print(f"❌ {project_name}: Found {len(mismatches)} mismatched images out of {count}")
            for m in mismatches[:5]: # Show first 5
                print(f"   - {m}")
            if len(mismatches) > 5:
                print(f"   ... and {len(mismatches)-5} more")
        else:
            if count > 0:
                print(f"✅ {project_name}: All {count} images matched")
            else:
                print(f"⚠️ {project_name}: No images found in images folder")

    if not issues_found:
        print("\n🎉 All projects checked. No mismatched image names found!")
    else:
        print("\n⚠️ Issues were found in some projects (see above).")

if __name__ == "__main__":
    verify_images()
