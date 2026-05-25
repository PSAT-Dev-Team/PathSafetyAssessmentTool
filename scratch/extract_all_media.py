import zipfile
import os
import shutil

def extract_media():
    artifact_dir = r"C:\Users\23010975\.gemini\antigravity-ide\brain\d148d7d5-cceb-4f7b-8c4c-92663762465d"
    os.makedirs(artifact_dir, exist_ok=True)
    
    # 1. Extract from DOCX
    docx_path = "Generation Report (Word Doc).docx"
    if os.path.exists(docx_path):
        print(f"Extracting media from {docx_path}...")
        with zipfile.ZipFile(docx_path, 'r') as z:
            media_files = [f for f in z.namelist() if f.startswith('word/media/')]
            for f in media_files:
                basename = os.path.basename(f)
                out_name = f"docx_{basename}"
                out_path = os.path.join(artifact_dir, out_name)
                
                with z.open(f) as source, open(out_path, 'wb') as target:
                    shutil.copyfileobj(source, target)
                print(f"  Extracted {f} to {out_path} ({os.path.getsize(out_path)} bytes)")
                
    # 2. Extract from PPTX
    pptx_path = "PSAT_Generation_Report_Complete.pptx"
    if os.path.exists(pptx_path):
        print(f"\nExtracting media from {pptx_path}...")
        with zipfile.ZipFile(pptx_path, 'r') as z:
            media_files = [f for f in z.namelist() if f.startswith('ppt/media/')]
            for f in media_files:
                basename = os.path.basename(f)
                out_name = f"pptx_{basename}"
                out_path = os.path.join(artifact_dir, out_name)
                
                with z.open(f) as source, open(out_path, 'wb') as target:
                    shutil.copyfileobj(source, target)
                print(f"  Extracted {f} to {out_path} ({os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    extract_media()
