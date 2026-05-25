import zipfile
import xml.etree.ElementTree as ET
import os

def extract_docx_comments(docx_path):
    if not os.path.exists(docx_path):
        print(f"File not found: {docx_path}")
        return
        
    print(f"Opening {docx_path} and scanning for comments...")
    
    with zipfile.ZipFile(docx_path, 'r') as zip_ref:
        comments_file = 'word/comments.xml'
        if comments_file not in zip_ref.namelist():
            print("No native comments file (word/comments.xml) found in docx zip.")
            return []
            
        tree = ET.parse(zip_ref.open(comments_file))
        root = tree.getroot()
        
        # Word comments namespace
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        
        comments = []
        for comment in root.findall('.//w:comment', ns):
            comment_id = comment.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
            author = comment.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}author')
            date = comment.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}date')
            
            # Extract text content
            texts = [node.text for node in comment.findall('.//w:t', ns) if node.text]
            comment_text = "".join(texts)
            
            comments.append({
                "id": comment_id,
                "author": author,
                "date": date,
                "text": comment_text
            })
            
        return comments

if __name__ == "__main__":
    comments = extract_docx_comments("Generation Report (Word Doc).docx")
    print("\n--- EXTRACTED DOCX COMMENTS ---")
    if comments:
        for c in comments:
            print(f"Comment ID: {c['id']} | Author: {c['author']} | Date: {c['date']}\nText: {c['text']}\n" + "-"*40)
    else:
        print("No comments found in DOCX.")
