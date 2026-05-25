import zipfile
import xml.etree.ElementTree as ET
import os

def extract_native_comments_from_zip(pptx_path):
    if not os.path.exists(pptx_path):
        print(f"File not found: {pptx_path}")
        return
        
    print(f"Opening {pptx_path} and scanning for comments...")
    
    with zipfile.ZipFile(pptx_path, 'r') as zip_ref:
        # 1. Read authors if available
        authors = {}
        author_file = 'ppt/commentAuthors.xml'
        if author_file in zip_ref.namelist():
            try:
                tree = ET.parse(zip_ref.open(author_file))
                root = tree.getroot()
                # Namespaces
                ns = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
                for author in root.findall('.//p:author', ns):
                    author_id = author.attrib.get('id')
                    name = author.attrib.get('name')
                    initials = author.attrib.get('initials')
                    authors[author_id] = f"{name} ({initials})"
            except Exception as e:
                print(f"Error reading authors: {e}")
                
        print(f"Found Authors: {authors}")
        
        # 2. Find comment files
        comment_files = [f for f in zip_ref.namelist() if f.startswith('ppt/comments/comment')]
        print(f"Found comment files: {comment_files}")
        
        # 3. Read each comment file
        all_comments = []
        ns_comment = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}
        
        # We also need to map comments to slide numbers. 
        # Inside ppt/slides/_rels/slide*.xml.rels or ppt/slides/slide*.xml, there might be a relationship to comments.
        # Let's find relationships between slides and comments to map them accurately.
        slide_to_comments_map = {}
        for file in zip_ref.namelist():
            if file.startswith('ppt/slides/_rels/slide') and file.endswith('.xml.rels'):
                slide_num = file.replace('ppt/slides/_rels/slide', '').replace('.xml.rels', '')
                try:
                    tree = ET.parse(zip_ref.open(file))
                    root = tree.getroot()
                    ns_rels = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
                    for rel in root.findall('.//r:Relationship', ns_rels):
                        target = rel.attrib.get('Target')
                        if 'comments/comment' in target:
                            # Target is usually '../comments/commentX.xml'
                            comment_base = os.path.basename(target)
                            slide_to_comments_map[f"ppt/comments/{comment_base}"] = slide_num
                except Exception as e:
                    pass

        print(f"Slide-to-Comment mapping: {slide_to_comments_map}")

        for comment_file in comment_files:
            try:
                tree = ET.parse(zip_ref.open(comment_file))
                root = tree.getroot()
                
                # In PowerPoint, native comments are in <p:cm> tags
                for cm in root.findall('.//p:cm', ns_comment):
                    author_id = cm.attrib.get('authorId')
                    created = cm.attrib.get('dt')
                    author_name = authors.get(author_id, f"Author ID {author_id}")
                    
                    # Text of the comment is in <p:text>
                    text_elem = cm.find('.//p:text', ns_comment)
                    text = text_elem.text if text_elem is not None else ""
                    
                    slide_num = slide_to_comments_map.get(comment_file, "Unknown")
                    
                    all_comments.append({
                        "slide": slide_num,
                        "author": author_name,
                        "created": created,
                        "text": text
                    })
            except Exception as e:
                print(f"Error reading comment file {comment_file}: {e}")
                
        return all_comments

if __name__ == "__main__":
    comments = extract_native_comments_from_zip("PSAT_Generation_Report_Complete.pptx")
    print("\n--- EXTRACTED NATIVE COMMENTS ---")
    if comments:
        for c in comments:
            print(f"Slide {c['slide']} | Author: {c['author']} | Date: {c['created']}\nComment: {c['text']}\n" + "-"*40)
    else:
        print("No native comments found in zip.")
