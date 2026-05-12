import os
import re

def generate_toc_for_file(filepath):
    if not os.path.exists(filepath):
        print(f"Skipping {filepath}, not found")
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if "## Table of Contents" in content:
        print(f"Skipping {filepath}, TOC already exists")
        return

    # Extract all ## headers (ignoring H1)
    # We will generate a TOC based on ## and ###
    lines = content.split('\n')
    toc_lines = ["\n## Table of Contents\n"]
    
    # Check if there is an H1. Usually it's at the very top.
    h1_index = -1
    for i, line in enumerate(lines):
        if line.startswith('# '):
            h1_index = i
            break
            
    if h1_index == -1:
        print(f"Warning: No H1 found in {filepath}, placing TOC at top")
        insert_idx = 0
    else:
        # Find where to insert TOC: after H1 and its description
        # We can insert it before the first H2
        first_h2_idx = -1
        for i, line in enumerate(lines):
            if line.startswith('## '):
                first_h2_idx = i
                break
                
        if first_h2_idx == -1:
            print(f"No H2 found in {filepath}, skipping TOC")
            return
            
        insert_idx = first_h2_idx

    has_toc_items = False
    for line in lines:
        match = re.match(r'^(#{2,3})\s+(.*)$', line)
        if match:
            level = len(match.group(1))
            text = match.group(2)
            # generate id logic
            # lower case, replace non alphanumeric with dash
            anchor = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')
            
            indent = "  " * (level - 2)
            toc_lines.append(f"{indent}- [{text}](#{anchor})")
            has_toc_items = True

    if not has_toc_items:
        return

    toc_lines.append("\n")
    
    new_lines = lines[:insert_idx] + toc_lines + lines[insert_idx:]
    new_content = '\n'.join(new_lines)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f"Injected TOC into {filepath}")

def main():
    docs_dirs = ['docs', 'frontend/public/docs']
    files_to_process = [
        'api-reference.md',
        'architecture.md',
        'scoring.md',
        'frontend.md',
        'cv-pipeline.md',
        'common-issues.md'
    ]
    
    for docs_dir in docs_dirs:
        for filename in files_to_process:
            filepath = os.path.join(docs_dir, filename)
            generate_toc_for_file(filepath)

if __name__ == "__main__":
    main()
