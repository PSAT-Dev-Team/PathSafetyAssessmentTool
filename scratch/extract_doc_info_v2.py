import zipfile
from lxml import etree

def get_word_comments(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as z:
            # Check if comments.xml exists
            if 'word/comments.xml' in z.namelist():
                xml_content = z.read('word/comments.xml')
                root = etree.fromstring(xml_content)
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                comments = root.xpath('//w:comment', namespaces=ns)
                print(f"Found {len(comments)} comments:")
                for comment in comments:
                    author = comment.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}author')
                    text_nodes = comment.xpath('.//w:t', namespaces=ns)
                    text = "".join([n.text for n in text_nodes if n.text])
                    print(f"[{author}]: {text}")
            else:
                print("word/comments.xml not found in ZIP.")
                
            # Also check document.xml for text that might be in textboxes
            if 'word/document.xml' in z.namelist():
                xml_content = z.read('word/document.xml')
                root = etree.fromstring(xml_content)
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
                      'v': 'urn:schemas-microsoft-com:vml'}
                # Look for text in text boxes or alternate content
                text_nodes = root.xpath('//w:t', namespaces=ns)
                print("\n--- Document Text (All) ---")
                all_text = " ".join([n.text for n in text_nodes if n.text])
                print(all_text[:2000] + "..." if len(all_text) > 2000 else all_text)
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    path = r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool\Gis Layer Shapfiles (UPDATED).docx"
    get_word_comments(path)
