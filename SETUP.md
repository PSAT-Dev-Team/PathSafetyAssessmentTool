# Path Safety Assessment Tool - Fresh Install Guide

## ⚡ Quick Start (New PC)

### 1. **Install Miniconda** (One-time setup)
   - Download: https://docs.conda.io/projects/miniconda/en/latest/
   - **IMPORTANT**: During installation, check BOTH boxes:
     - ✅ "Add Miniconda3 to my PATH"
     - ✅ "Register Miniconda3 as my default Python"
   - **Restart your computer** after installation

### 2. **Clone the Repository**
   ```bash
   git clone https://github.com/your-repo/PathSafetyAssessmentTool.git
   cd PathSafetyAssessmentTool
   ```

### 3. **Run the Setup Script**
   - Double-click: **`Run-PSAT.bat`**
   - The script will:
     ✅ Create all required directories
     ✅ Check for Conda installation
     ✅ Create Python environment (first run takes ~5-10 min)
     ✅ Install all dependencies (geospatial, CV, Node.js, etc.)
     ✅ Set up backend (Flask on port 8000)
     ✅ Set up frontend (Vite on port 5173)
     ✅ Open the app in your browser automatically

### 4. **That's it! 🎉**
   - Backend: http://localhost:8000
   - Frontend: http://localhost:5173

---

## 📁 Directory Structure

The script automatically creates these directories (some tracked by git via `.gitkeep`):

```
Parent Directory (Documents/GitHub/)
├── data/                           ← Projects output (created by script)
│   └── .gitkeep                    ← (git tracks this)
└── in/                             ← Image input folders (created by script)
    └── .gitkeep                    ← (git tracks this)

PathSafetyAssessmentTool/           (GitHub repo root)
├── backend/
│   ├── models/                     ← ML model files
│   │   └── .gitkeep                ← (git tracks this)
│   └── shapefiles/                 ← GIS shapefiles
│       └── .gitkeep                ← (git tracks this)
├── frontend/
├── Run-PSAT.bat                    ← Run this! ⭐
└── SETUP.md                        ← This file
```

**Important Note**: The `data` and `in` folders are ONE LEVEL UP from the project root (in the parent GitHub directory).

---

## 🔑 Key Implementation Details

### Git Tracking Strategy
- **`.gitkeep` files**: Stored in git to ensure directories exist on clone
- **Data files**: Gitignored (don't want to commit large project data)
- **Updated `.gitignore`**: Allows `.gitkeep` files while ignoring everything else in data folders

### Run-PSAT.bat Creates:
- ✅ `../data/` and `../in/` (parent directory level)
- ✅ `backend/models/` and `backend/shapefiles/`
- ✅ Conda environment `psat` with all dependencies
- ✅ Node.js/npm for frontend

---

## 🛠️ If Something Goes Wrong

### Backend won't start?
- Check `backend_log.txt` in the project root
- Verify Conda is in PATH: Open terminal and run `conda --version`
- **Restart computer** after installing Miniconda
- Ensure `../data/` directory exists (Run script again to create)

### Frontend won't load?
- Check `frontend_log.txt` in the project root
- Clear browser cache (Ctrl+Shift+Delete)
- Try a different port if 5173 is already in use

### API returns 500 error?
- The script creates required directories automatically
- If still failing, manually create:
  - `c:\Users\[YourUser]\Documents\GitHub\data\`
  - `c:\Users\[YourUser]\Documents\GitHub\in\`
- Check `backend_log.txt` for specific errors

### "No source folders" on the website?
- Image folders must be in: `../in/` directory
- For example: `c:\Users\[YourUser]\Documents\GitHub\in\ANG MO KIO AVENUE 2\`
- Move your image folders there and refresh the browser

---

## 📝 What Gets Created/Installed

### On First Run:
- **Conda environment** named `psat` with:
  - Python 3.11
  - GDAL, GeoPandas, Fiona (geospatial libs)
  - OpenCV (computer vision)
  - Flask, Flask-CORS (backend API)
  - Node.js, npm (frontend toolchain)
  - All other dependencies from requirements.txt

### Directories:
- `../data/` - For project outputs and results
- `../in/` - For storing input image folders
- `backend/models/` - For ML model files (pre-downloaded)
- `backend/shapefiles/` - For geographic boundary data

---

## 🔄 Running Multiple Times

Next time you run `Run-PSAT.bat`:
- Conda environment already exists → skipped (saves time!)
- Dependencies already installed → skipped
- Just starts the servers and opens the browser

To do a **fresh install**, delete the conda environment:
```bash
conda env remove -n psat -y
```
Then run `Run-PSAT.bat` again.

---

## ❌ Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| "Conda not found" | Miniconda not installed or PATH not set | Install Miniconda, restart computer |
| Port 8000 in use | Another app using port 8000 | Kill other process or use `lsof -i :8000` |
| Port 5173 in use | Previous dev server still running | Close all cmd/terminal windows running PSAT |
| 500 errors | Missing `../data/` or `../in/` dirs | Run `Run-PSAT.bat` again to create them |
| No image folders in UI | Images not in correct directory | Put folders in `../in/` and refresh browser |
| "Project creation fails" | Images missing GPS EXIF data | Use images taken with phones/cameras with GPS |

---

## ✅ Validation Checklist

After running `Run-PSAT.bat`, verify:
- [ ] Two windows open: "PSAT Backend" and "PSAT Frontend"
- [ ] Browser opens to http://localhost:5173
- [ ] Website loads without 500 errors
- [ ] "Create Project from Folder" page shows image folders
- [ ] Can list existing projects (or empty list on first run)

If any item fails, check the corresponding `log.txt` file for errors.

---

## 🚀 Fresh Installation on Any PC

Now when anyone (colleague, new developer, etc.) gets this repo:

1. Install Miniconda (one-time)
2. Clone the repo
3. Run `Run-PSAT.bat`
4. That's it! ✅

No manual directory creation, no missing dependencies, no git tracking issues.



