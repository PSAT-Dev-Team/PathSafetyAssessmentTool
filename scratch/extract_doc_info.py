from docx import Document

def extract_comments_and_text(docx_path):
    doc = Document(docx_path)
    
    print("--- Document Text ---")
    for para in doc.paragraphs:
        if para.text.strip():
            print(para.text)
            
    print("\n--- Comments ---")
    # python-docx doesn't directly support reading comments in a simple way
    # but we can try to find them in the XML if needed.
    # However, let's first see if the text contains the "comments at the side"
    # Often "comments at the side" are Word Comments which are in a separate XML.
    
    try:
        from docx.opc.constants import RELATIONSHIP_TYPE as RT
        comments_part = doc.part.related_parts.get(RT.COMMENTS)
        if comments_part:
            from lxml import etree
            xml = etree.fromstring(comments_part.blob)
            # Namespace for word
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            comments = xml.xpath('//w:comment', namespaces=ns)
            for comment in comments:
                text_nodes = comment.xpath('.//w:t', namespaces=ns)
                comment_text = "".join([node.text for node in text_nodes])
                print(f"Comment: {comment_text}")
        else:
            print("No Word comments found.")
    except Exception as e:
        print(f"Error extracting comments: {e}")

if __name__ == "__main__":
    path = r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\Gis Layer Shapfiles (UPDATED).docx"
    extract_comments_and_text(path)
