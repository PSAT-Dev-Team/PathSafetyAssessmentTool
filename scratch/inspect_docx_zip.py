import zipfile
import os

def inspect_docx(path):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
        
    try:
        with zipfile.ZipFile(path, 'r') as z:
            xml_content = z.read('word/document.xml')
            raw_text = xml_content.decode('utf-8', errors='ignore')
            print(f"XML length: {len(raw_text)} characters")
            
            with open("scratch/word_xml_raw.txt", "w", encoding="utf-8") as f:
                f.write(raw_text[:50000])
            print("Saved first 50,000 characters of XML to scratch/word_xml_raw.txt")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_docx("Generation Report (Word Doc).docx")
