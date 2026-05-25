import zipfile
import xml.etree.ElementTree as ET

def extract_all_text(docx_path):
    output = []
    try:
        with zipfile.ZipFile(docx_path) as docx:
            # Get main document text
            try:
                xml_content = docx.read('word/document.xml')
                tree = ET.XML(xml_content)
                WORD_NAMESPACE = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
                TEXT = WORD_NAMESPACE + 't'
                
                texts = []
                for node in tree.iter(TEXT):
                    if node.text:
                        texts.append(node.text)
                output.append("--- MAIN DOCUMENT TEXT ---")
                output.append('\n'.join(texts))
            except Exception as e:
                output.append("Error reading document.xml: " + str(e))
                
            # Get comments
            try:
                if 'word/comments.xml' in docx.namelist():
                    comments_content = docx.read('word/comments.xml')
                    tree = ET.XML(comments_content)
                    WORD_NAMESPACE = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
                    TEXT = WORD_NAMESPACE + 't'
                    COMMENT = WORD_NAMESPACE + 'comment'
                    
                    output.append("\n--- COMMENTS ---")
                    for comment in tree.iter(COMMENT):
                        author = comment.get(WORD_NAMESPACE + 'author', 'Unknown')
                        texts = [node.text for node in comment.iter(TEXT) if node.text]
                        output.append(f"Author: {author}\nComment: {''.join(texts)}\n")
            except Exception as e:
                output.append("Error reading comments.xml: " + str(e))
                
            return '\n'.join(output)
    except Exception as e:
        return str(e)

if __name__ == '__main__':
    print(extract_all_text('c:/Users/23010975/Documents/GitHub/PathSafetyAssessmentTool/Gis Layer Shapfiles (UPDATED).docx'))
