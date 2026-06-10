import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import docx

def extract(path, label, outfile):
    outfile.write(f'=== {label} ===\n')
    doc = docx.Document(path)
    for para in doc.paragraphs:
        style = para.style.name
        text = para.text.strip()
        if text:
            outfile.write(f'[{style}] {text}\n')
    outfile.write('\n')

with open('scratch/guide_structures.txt', 'w', encoding='utf-8', errors='replace') as f:
    extract('USER_GUIDE (Updated).docx', 'USER GUIDE UPDATED', f)
    extract('DEVELOPER_GUIDE (Updated).docx', 'DEVELOPER GUIDE UPDATED', f)

print("Done. Written to scratch/guide_structures.txt")
