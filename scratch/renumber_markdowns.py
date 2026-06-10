import os
import re

def clean_heading_text(text):
    # Strip any existing leading numbers from the heading text.
    # Pattern matches numbers like "1. ", "1.1 ", "10.2 ", "2.3.1 " at the start of the text.
    # It does NOT match codes like "CM3" because they don't start with a digit.
    return re.sub(r'^\s*\d+(?:\.\d+)*\.?\s+', '', text).strip()

def make_anchor(text):
    # lower case, replace non-alphanumeric with dash
    anchor = text.lower()
    anchor = re.sub(r'[^a-z0-9]+', '-', anchor)
    anchor = anchor.strip('-')
    return anchor

def process_file(filepath, file_idx, h2_start_val=1):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return None, h2_start_val
        
    print(f"Processing: {filepath} with index {file_idx} (H2 start: {h2_start_val})")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    lines = content.split('\n')
    
    # First pass: identify all headings and determine their new labels
    headings = []
    h2_idx = h2_start_val - 1
    h3_idx = 0
    
    # Let's find where the TOC block starts and ends.
    toc_start = -1
    for i, line in enumerate(lines):
        if line.strip().lower() in ['## table of contents', '## table of content']:
            toc_start = i
            break
            
    toc_end = -1
    if toc_start != -1:
        for j in range(toc_start + 1, len(lines)):
            stripped = lines[j].strip()
            # TOC block lines start with -, *, [, or spaces, or are empty.
            if stripped and not stripped.startswith('-') and not stripped.startswith('*') and not stripped.startswith('[') and not stripped.startswith('  '):
                toc_end = j
                break
        if toc_end == -1:
            toc_end = len(lines)
            
    # Collect headings from the content outside the TOC block
    for i, line in enumerate(lines):
        if toc_start != -1 and toc_start <= i < toc_end:
            continue
            
        if line.startswith('## ') or line.startswith('### '):
            if line.strip().lower() in ['## table of contents', '## table of content']:
                continue
            is_h2 = line.startswith('## ')
            orig_text = line[3:] if is_h2 else line[4:]
            clean_text = clean_heading_text(orig_text)
            
            if is_h2:
                h2_idx += 1
                h3_idx = 0
                label = f"{file_idx}.{h2_idx}"
            else:
                h3_idx += 1
                label = f"{file_idx}.{h2_idx}{h3_idx}"
                
            headings.append({
                'line_idx': i,
                'is_h2': is_h2,
                'clean_text': clean_text,
                'label': label,
                'anchor': make_anchor(f"{label} {clean_text}")
            })
            
    # Build the new TOC lines
    toc_lines = []
    if toc_start != -1:
        toc_lines.append("## Table of Contents\n")
        for h in headings:
            indent = "" if h['is_h2'] else "  "
            toc_lines.append(f"{indent}- [{h['label']} {h['clean_text']}](#{h['anchor']})")
        toc_lines.append("") # empty line at the end
        
    # Build the final file lines
    final_lines = []
    i = 0
    heading_map = {h['line_idx']: h for h in headings}
    
    while i < len(lines):
        if toc_start != -1 and i == toc_start:
            final_lines.extend(toc_lines)
            i = toc_end
            continue
            
        if i in heading_map:
            h = heading_map[i]
            prefix = "## " if h['is_h2'] else "### "
            final_lines.append(f"{prefix}{h['label']} {h['clean_text']}")
        else:
            final_lines.append(lines[i])
        i += 1
        
    new_content = '\n'.join(final_lines)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f"Saved: {filepath}")
    return headings, h2_idx + 1

def main():
    # List of developer markdown files mapping to their section index
    files = [
        # (public_path, root_path, file_idx)
        ('frontend/public/README.md', 'README.md', 1),
        ('frontend/public/docs/installation.md', 'docs/installation.md', 2),
        ('frontend/public/docs/architecture.md', 'docs/architecture.md', 3),
        ('frontend/public/docs/api-reference.md', 'docs/api-reference.md', 4),
        ('frontend/public/docs/cv-pipeline.md', 'docs/cv-pipeline.md', 5),
        ('frontend/public/docs/scoring.md', 'docs/scoring.md', 6),
        ('frontend/public/docs/treatments.md', 'docs/treatments.md', 6), # processed after scoring
        ('frontend/public/docs/frontend.md', 'docs/frontend.md', 7),
        ('frontend/public/docs/common-issues.md', 'docs/common-issues.md', 8),
        ('frontend/public/docs/contributing.md', 'docs/contributing.md', 9),
        ('frontend/public/docs/dev-jira.md', 'docs/dev-jira.md', 10),
    ]
    
    h2_starts = {} # Map (file_idx) -> next h2 start value
    
    for pub_path, root_path, file_idx in files:
        h2_start = h2_starts.get(file_idx, 1)
        
        # Process public folder copy
        _, next_h2 = process_file(pub_path, file_idx, h2_start)
        
        # Process root folder copy if it exists
        if os.path.exists(root_path):
            process_file(root_path, file_idx, h2_start)
            
        h2_starts[file_idx] = next_h2

if __name__ == '__main__':
    main()
