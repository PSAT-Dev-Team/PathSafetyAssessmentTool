"""
Extract:
1. All comments (native Word comments) from the feedback document
2. All tracked-changes (revisions) text from the feedback document
3. Full paragraph text of the feedback document
4. Full paragraph text of all three guides
"""

import zipfile
import xml.etree.ElementTree as ET
import os
import sys

# Namespaces
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml'
RST_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'

ns = {
    'w': W_NS,
    'w14': W14_NS,
}

BASE = r"c:\Users\23010975\Documents\GitHub\PathSafetyAssessmentTool"

FEEDBACK_DOC = os.path.join(BASE, "User guide comment for 1. Getting Started.docx")
USER_GUIDE   = os.path.join(BASE, "USER_GUIDE_V2(UPDATED).docx")
DEV_GUIDE    = os.path.join(BASE, "DEVELOPER_GUIDE_V2(UPDATED).docx")
ADMIN_GUIDE  = os.path.join(BASE, "ADMIN_GUIDE.docx")

OUT_FILE = os.path.join(BASE, "scratch", "feedback_and_guides_extracted.txt")


def get_paragraph_style(para):
    """Return style name of a paragraph."""
    pPr = para.find(f'{{{W_NS}}}pPr')
    if pPr is not None:
        pStyle = pPr.find(f'{{{W_NS}}}pStyle')
        if pStyle is not None:
            return pStyle.attrib.get(f'{{{W_NS}}}val', 'Normal')
    return 'Normal'


def get_para_text_with_revisions(para):
    """
    Extract all text from a paragraph including:
    - Regular runs
    - Inserted text (w:ins)
    - Deleted text (w:del) - marked with [DELETED: ...]
    Returns tuple (display_text, has_revision)
    """
    parts = []
    has_revision = False
    
    for child in para:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        
        if tag == 'r':  # Normal run
            for t in child.findall(f'{{{W_NS}}}t'):
                if t.text:
                    parts.append(t.text)
        elif tag == 'ins':  # Tracked insertion
            has_revision = True
            ins_text = []
            for run in child.findall(f'{{{W_NS}}}r'):
                for t in run.findall(f'{{{W_NS}}}t'):
                    if t.text:
                        ins_text.append(t.text)
            if ins_text:
                parts.append(f"[INSERTED: {''.join(ins_text)}]")
        elif tag == 'del':  # Tracked deletion
            has_revision = True
            del_text = []
            for run in child.findall(f'{{{W_NS}}}r'):
                for dt in run.findall(f'{{{W_NS}}}delText'):
                    if dt.text:
                        del_text.append(dt.text)
            if del_text:
                parts.append(f"[DELETED: {''.join(del_text)}]")
        elif tag == 'hyperlink':  # Hyperlink
            for run in child.findall(f'{{{W_NS}}}r'):
                for t in run.findall(f'{{{W_NS}}}t'):
                    if t.text:
                        parts.append(t.text)
    
    return ''.join(parts), has_revision


def extract_comments(docx_path):
    """Extract all native comments from a docx."""
    comments = []
    with zipfile.ZipFile(docx_path, 'r') as z:
        if 'word/comments.xml' not in z.namelist():
            return comments
        
        tree = ET.parse(z.open('word/comments.xml'))
        root = tree.getroot()
        
        for comment in root.findall(f'.//{{{W_NS}}}comment'):
            cid = comment.attrib.get(f'{{{W_NS}}}id', '')
            author = comment.attrib.get(f'{{{W_NS}}}author', '')
            date = comment.attrib.get(f'{{{W_NS}}}date', '')
            
            # Get all text from comment
            texts = []
            for para in comment.findall(f'.//{{{W_NS}}}p'):
                para_text = []
                for r in para.findall(f'.//{{{W_NS}}}r'):
                    for t in r.findall(f'{{{W_NS}}}t'):
                        if t.text:
                            para_text.append(t.text)
                if para_text:
                    texts.append(''.join(para_text))
            
            comments.append({
                'id': cid,
                'author': author,
                'date': date,
                'text': '\n'.join(texts)
            })
    
    return comments


def extract_comment_anchors(docx_path):
    """Extract comment start/end references with surrounding text context."""
    anchors = {}  # comment_id -> context text
    
    with zipfile.ZipFile(docx_path, 'r') as z:
        if 'word/document.xml' not in z.namelist():
            return anchors
        
        tree = ET.parse(z.open('word/document.xml'))
        root = tree.getroot()
        
        # Find paragraphs with comment references
        body = root.find(f'.//{{{W_NS}}}body')
        if body is None:
            return anchors
        
        for para in body.findall(f'.//{{{W_NS}}}p'):
            # Check if this paragraph has comment range starts
            comment_starts = para.findall(f'.//{{{W_NS}}}commentRangeStart')
            if not comment_starts:
                continue
            
            para_text, _ = get_para_text_with_revisions(para)
            
            for cs in comment_starts:
                cid = cs.attrib.get(f'{{{W_NS}}}id', '')
                if cid not in anchors:
                    anchors[cid] = para_text.strip()
    
    return anchors


def extract_doc_full_content(docx_path, include_revisions=False):
    """Extract all paragraphs from document with style info."""
    paragraphs = []
    
    with zipfile.ZipFile(docx_path, 'r') as z:
        if 'word/document.xml' not in z.namelist():
            return paragraphs
        
        tree = ET.parse(z.open('word/document.xml'))
        root = tree.getroot()
        body = root.find(f'.//{{{W_NS}}}body')
        if body is None:
            return paragraphs
        
        for para in body.findall(f'{{{W_NS}}}p'):
            style = get_paragraph_style(para)
            text, has_rev = get_para_text_with_revisions(para)
            text = text.strip()
            
            if text or has_rev:
                paragraphs.append({
                    'style': style,
                    'text': text,
                    'has_revision': has_rev
                })
        
        # Also extract table content
        for table in body.findall(f'.//{{{W_NS}}}tbl'):
            for row in table.findall(f'.//{{{W_NS}}}tr'):
                cells = []
                for cell in row.findall(f'.//{{{W_NS}}}tc'):
                    cell_text = []
                    for para in cell.findall(f'.//{{{W_NS}}}p'):
                        t, _ = get_para_text_with_revisions(para)
                        if t.strip():
                            cell_text.append(t.strip())
                    cells.append(' '.join(cell_text))
                if any(cells):
                    paragraphs.append({
                        'style': 'TableRow',
                        'text': ' | '.join(cells),
                        'has_revision': False
                    })
    
    return paragraphs


def main():
    out_lines = []
    
    # =========================================================
    # SECTION 1: FEEDBACK DOCUMENT
    # =========================================================
    out_lines.append("=" * 80)
    out_lines.append("SECTION 1: FEEDBACK DOCUMENT ANALYSIS")
    out_lines.append(f"File: {os.path.basename(FEEDBACK_DOC)}")
    out_lines.append("=" * 80)
    
    # 1a. Native Comments
    out_lines.append("\n--- NATIVE COMMENTS (Boss's Review Notes) ---\n")
    comments = extract_comments(FEEDBACK_DOC)
    anchors = extract_comment_anchors(FEEDBACK_DOC)
    
    if comments:
        for c in comments:
            out_lines.append(f"Comment #{c['id']} by [{c['author']}] on {c['date']}")
            anchor_text = anchors.get(c['id'], "(no anchor found)")
            out_lines.append(f"  Anchored to text: \"{anchor_text[:200]}\"")
            out_lines.append(f"  Comment: {c['text']}")
            out_lines.append("-" * 60)
    else:
        out_lines.append("No native comments found.")
    
    # 1b. Document content with tracked changes
    out_lines.append("\n--- DOCUMENT FULL CONTENT (with tracked changes) ---\n")
    paras = extract_doc_full_content(FEEDBACK_DOC, include_revisions=True)
    for p in paras:
        marker = " [REVISED]" if p['has_revision'] else ""
        out_lines.append(f"[{p['style']}]{marker}: {p['text']}")
    
    # =========================================================
    # SECTION 2: USER GUIDE
    # =========================================================
    out_lines.append("\n\n" + "=" * 80)
    out_lines.append("SECTION 2: USER GUIDE FULL CONTENT")
    out_lines.append(f"File: {os.path.basename(USER_GUIDE)}")
    out_lines.append("=" * 80 + "\n")
    
    paras = extract_doc_full_content(USER_GUIDE)
    for p in paras:
        out_lines.append(f"[{p['style']}]: {p['text']}")
    
    # =========================================================
    # SECTION 3: DEVELOPER GUIDE
    # =========================================================
    out_lines.append("\n\n" + "=" * 80)
    out_lines.append("SECTION 3: DEVELOPER GUIDE FULL CONTENT")
    out_lines.append(f"File: {os.path.basename(DEV_GUIDE)}")
    out_lines.append("=" * 80 + "\n")
    
    paras = extract_doc_full_content(DEV_GUIDE)
    for p in paras:
        out_lines.append(f"[{p['style']}]: {p['text']}")
    
    # =========================================================
    # SECTION 4: ADMIN GUIDE
    # =========================================================
    out_lines.append("\n\n" + "=" * 80)
    out_lines.append("SECTION 4: ADMIN GUIDE FULL CONTENT")
    out_lines.append(f"File: {os.path.basename(ADMIN_GUIDE)}")
    out_lines.append("=" * 80 + "\n")
    
    paras = extract_doc_full_content(ADMIN_GUIDE)
    for p in paras:
        out_lines.append(f"[{p['style']}]: {p['text']}")
    
    # Write output
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out_lines))
    
    print(f"Done! Output written to: {OUT_FILE}")
    print(f"Total lines: {len(out_lines)}")


if __name__ == "__main__":
    main()
