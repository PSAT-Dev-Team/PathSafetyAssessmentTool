import os
import zipfile
import xml.etree.ElementTree as ET

def find_comments_in_all_docx(directory):
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    found_any = False
    
    for root_dir, dirs, files in os.walk(directory):
        # Exclude virtual environments or git folders
        if '.venv' in root_dir or '.git' in root_dir:
            continue
            
        for file in files:
            if file.endswith('.docx') and not file.startswith('~$'):
                docx_path = os.path.join(root_dir, file)
                try:
                    with zipfile.ZipFile(docx_path, 'r') as zip_ref:
                        comments_file = 'word/comments.xml'
                        if comments_file in zip_ref.namelist():
                            found_any = True
                            print(f"\n=========================================")
                            print(f"FOUND COMMENTS IN: {file}")
                            print(f"Path: {docx_path}")
                            print(f"=========================================")
                            
                            tree = ET.parse(zip_ref.open(comments_file))
                            root = tree.getroot()
                            
                            for comment in root.findall('.//w:comment', ns):
                                comment_id = comment.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
                                author = comment.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}author')
                                date = comment.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}date')
                                
                                # Extract text
                                texts = [node.text for node in comment.findall('.//w:t', ns) if node.text]
                                comment_text = "".join(texts)
                                
                                print(f"  Comment #{comment_id} by {author} on {date}:")
                                print(f"    {comment_text}")
                                print("-" * 40)
                except Exception as e:
                    print(f"Error reading {file}: {e}")
                    
    if not found_any:
        print("No comments found in any DOCX file.")

if __name__ == "__main__":
    find_comments_in_all_docx(".")
