# Scripts

Self-contained Python scripts for operational tasks. Each script is designed to be run directly via the **VSCode Run button** (the green play triangle at the top-right of the editor) — no terminal arguments needed.

All configuration is written directly into the script. To run a script, open it in VSCode and press **Run** (or `Ctrl+F5`).

## Requirements

All scripts use the `psat` conda environment. Make sure VSCode has the correct Python interpreter selected:

```
C:\Users\Alaster\miniconda3\envs\psat\python.exe
```

To set this in VSCode: `Ctrl+Shift+P` → **Python: Select Interpreter** → pick `psat`.

---

## Script Index

Scripts will be listed here as they are added.

| Script | Purpose |
|--------|---------|
| *(none yet)* | — |

---

## Adding a New Script

1. Create the `.py` file in this folder.
2. Hardcode all inputs at the top of the file (no `argparse`, no `sys.argv`).
3. Add a one-line entry to the table above.
4. Test it with the VSCode Run button before committing.
