# GIS Layer Management - Quick Start Guide

## 🚀 Quick Test (5 minutes)

### Setup
```bash
# Terminal 1: Start Flask backend
cd backend
python run.py

# Terminal 2: Start React frontend
cd frontend
npm run dev

# Terminal 3 (Optional): Run validation tests
cd project_root
python test_gis_validation.py
```

### Test in Browser
1. Open http://localhost:5173
2. Click "Projects" (top of sidebar)
3. Click **"GIS Layer"** button (blue button at bottom)
4. Try "Add GIS Layer" or "Replace GIS Layer"

---

## 📊 User Flow Diagrams

### Flow 1: Adding a New GIS Layer
```
┌─────────────────────────────────────────────────────────────┐
│ User on Projects Page                                       │
│ Clicks "GIS Layer" button                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Modal: "Update GIS Layers"                                  │
│ Choice: [Add GIS Layer] [Replace GIS Layer]                │
└────────────────┬────────────────────────────────────────────┘
                 │
        Clicks "Add GIS Layer"
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Select or Create Category Folder                    │
│ Options: [Existing: cycling_path, footpath, ...] [+ New]   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Upload Shapefile Files                              │
│ Drag-drop or click to browse:                               │
│   ✓ Required: .shp, .shx, .dbf                             │
│   ✓ Optional: .prj, .cpg, .sbn, .sbx                       │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Click "Upload (N)" button                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
        ✅ SUCCESS
        Files stored in:
        shapefiles/category_name/file.shp

        Note: Not used in autocoding yet!
        (Need to register in backend code)
```

### Flow 2: Replacing a GIS Layer (WITH VALIDATION)
```
┌─────────────────────────────────────────────────────────────┐
│ User Clicks "GIS Layer" → "Replace GIS Layer"              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Upload New Files                                    │
│ Drag-drop new shapefile files                               │
│   (Files go to temp_replace/ folder)                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Select Category                                     │
│ Example: [path] [area_type] [bus_stop]                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Select Target Layer to Replace                      │
│ Example: [CyclingpathCentreline.shp] [Footpathcentreline]  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Click "Replace (N files)" button                            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
        ⚡ VALIDATION PHASE ⚡
        Backend checks:
          ✓ CRS compatibility
          ✓ Geometry types
          ✓ Required columns
          ✓ Feature counts
          ✓ Empty geometries
          ✓ Spatial bounds
        │
        ├─────────────────────────────────┐
        │                                 │
        ▼                                 ▼
    ERRORS FOUND             NO ERRORS/WARNINGS
        │                                 │
        ▼                                 ▼
    ❌ BLOCKED                    ✅ PROCEED
    "Cannot replace:              Atomic Replace:
     Missing column WIDTH"        1. Backup old files
                                  2. Replace with temp+rename
                                  3. Auto-restore if fails
                                  │
                                  ▼
                            ✅ SUCCESS
                            New data used immediately
```

---

## 📝 Complete Test Checklist

### Test 1: Happy Path (Compatible Files)
```
Scenario: Replace cycling path with updated data
Files:    Same structure, same columns, updated coordinates

Steps:
□ Click GIS Layer → Replace
□ Upload CyclingpathCentreline_2025.shp (.shx, .dbf)
□ Select category: "path"
□ Select target: "CyclingpathCentreline.shp"
□ Click Replace

Expected:
□ Validation shows: ✅ VALID
□ No errors shown
□ Replacement succeeds
□ File timestamp updated: ls -l backend/shapefiles/path/
```

### Test 2: Column Alias (Renamed Column)
```
Scenario: New file has PATH_WIDTH instead of WIDTH

Files:    width_column → PATH_WIDTH
          (But geopandas reads it as "PATH_WIDTH")

Steps:
□ Click GIS Layer → Replace
□ Upload file with PATH_WIDTH column
□ Select category: "path"
□ Select target: "CyclingpathCentreline.shp"
□ Click Replace

Expected:
□ Validation shows: ⚠️ WARNING
  "Column 'WIDTH' resolved to 'PATH_WIDTH' in new file"
□ Button text: "Continue with replacement?"
□ Click OK → Replacement succeeds
□ System uses PATH_WIDTH (no code change needed!)
```

### Test 3: CRS Mismatch (Different Projection)
```
Scenario: New file in EPSG:3414, old in EPSG:4326

Files:    Different coordinate systems
          Old: EPSG:4326 (WGS84)
          New: EPSG:3414 (Singapore)

Steps:
□ Upload new file in different CRS
□ Select category and target
□ Click Replace

Expected:
□ Validation shows: ⚠️ WARNING
  "CRS mismatch: new=EPSG:3414, old=EPSG:4326.
   Will be auto-converted to EPSG:3414 during use."
□ User confirms → Replacement succeeds
□ System auto-converts on use (no issue!)
```

### Test 4: Missing Required Column (Error - Should Block)
```
Scenario: Width data accidentally removed

Files:    Old: Has WIDTH column
          New: No WIDTH column

Steps:
□ Upload cycling path WITHOUT WIDTH
□ Select category: "path"
□ Select target: "CyclingpathCentreline.shp"
□ Click Replace

Expected:
□ Validation shows: ❌ ERROR
  "Missing required columns: WIDTH"
□ Replacement is BLOCKED
□ Original file unchanged
□ User sees error message
□ Original file still works
```

### Test 5: Wrong Geometry Type (Error - Should Block)
```
Scenario: Points uploaded instead of LineString

Files:    Old: LineString geometry (bus lanes)
          New: Point geometry (wrong!)

Steps:
□ Upload wrong geometry type
□ Select category: "bus_lane"
□ Select target: "Bus lanes.shp"
□ Click Replace

Expected:
□ Validation shows: ❌ ERROR
  "Unexpected geometry type(s): Point.
   Expected: LineString, MultiLineString"
□ Replacement is BLOCKED
□ Original file unchanged
```

### Test 6: Feature Count Change (Warning)
```
Scenario: New file has significantly fewer features

Files:    Old: 1000 features
          New: 50 features (95% reduction!)

Steps:
□ Upload much smaller dataset
□ Select category and target
□ Click Replace

Expected:
□ Validation shows: ⚠️ WARNING
  "Feature count changed significantly: 1000 → 50 (-95%).
   Review to ensure this is intentional."
□ Dialog: "Continue with replacement?"
□ If OK → Proceeds with smaller dataset
□ If Cancel → Aborts, original unchanged
```

### Test 7: File System Verification
```
After successful replacement, verify:

□ Old files backed up:
  ls -la backend/shapefiles/[category]/.backup/

□ New files have recent timestamp:
  ls -l backend/shapefiles/[category]/

□ Check file size changed:
  ls -lh backend/shapefiles/[category]/file.shp

□ Verify geometry still readable:
  python -c "import geopandas as gpd; \
  gdf = gpd.read_file('backend/shapefiles/[category]/file.shp'); \
  print(f'Features: {len(gdf)}, Geometry: {gdf.geom_type.unique()}')"
```

---

## 🔍 Debugging Tips

### Check Backend Logs
```bash
# Terminal running Flask should show:
[REPLACE] Validating: file.shp
[REPLACE] CRS: EPSG:4326 ✓
[REPLACE] Geometry: LineString ✓
[REPLACE] Columns: WIDTH found ✓
[REPLACE] Feature count: 100 ✓
[REPLACE] Empty geometries: 0 ✓
[REPLACE] Spatial bounds: OK ✓
[REPLACE] VALID - proceeding

[REPLACE] Backed up: ... ✓
[REPLACE] Atomically replaced: ... ✓
[REPLACE] Successfully replaced 3 files
```

### Check Browser Console (F12)
```javascript
// Should see:
[Replace] Step 1: Uploading files...
[Replace] Upload result: {count: 3, errors: []}

[Replace] Step 2: Validating compatibility
[Replace] Validation result: {
  valid: true,
  errors: [],
  warnings: [],
  ...
}

[Replace] Step 3: Replacing cycling_path/...
[Replace] Replace result: {count: 1, replaced: [...]}
```

### Verify Validation Services Import
```bash
# Run validation test
python test_gis_validation.py

# Should output all layer definitions and test results
# If import fails, check:
#   - backend/app/services/shapefile_validator.py exists
#   - backend/app/services/gis_layer_definition.py exists
#   - No syntax errors: python -m py_compile backend/app/services/*.py
```

---

## 🎯 Expected Outcomes by Test

| Test | File Upload | Validation | Replacement | Result |
|------|------------|------------|------------|--------|
| Happy Path | ✅ Success | ✅ Valid | ✅ Atomic write | ✅ Works |
| Alias Column | ✅ Success | ⚠️ Warning | ✅ Proceeds | ✅ Works (PATH_WIDTH) |
| CRS Mismatch | ✅ Success | ⚠️ Warning | ✅ Proceeds | ✅ Auto-converts |
| Missing Column | ✅ Success | ❌ Error | ❌ Blocked | ✅ Prevented |
| Wrong Geometry | ✅ Success | ❌ Error | ❌ Blocked | ✅ Prevented |
| Feature Count↓ | ✅ Success | ⚠️ Warning | ✅/❌ User choice | ✅ Controlled |

---

## 🚨 Known Limitations

### Not Portable (Still Need Code)
```
❌ Adding a new attribute to autocode
   Example: "Soil Type" → need to code autocoding logic

❌ Changing query logic
   Example: "if width > 4m" needs code change

❌ New layer types
   Example: "water_bodies" needs:
   - Layer definition (gis_layer_definition.py)
   - GIS method (gis_mapping.py)
   - Endpoint call (routes.py)
```

### Portable (No Code Needed!)
```
✅ Replace shapefile with same structure
✅ Update data in same shapefile
✅ Different CRS (auto-converts)
✅ Renamed columns (alias resolution)
✅ Extra columns (ignored)
✅ More/fewer features (warned, user confirms)
```

---

## 📞 When Validation Blocks Replacement

**If you get an error message:**

1. **"Missing required columns: WIDTH"**
   - Check: Do all new files have a WIDTH column?
   - Fix: Add WIDTH column to your shapefile
   - Alternative: Use column alias (PATH_WIDTH, width, etc.)

2. **"Unexpected geometry type(s): Point. Expected: LineString"**
   - Check: Is your geometry type correct?
   - Fix: Upload shapefile with correct geometry
   - Remember: Different layers need different geometries
     - Points: MRT, bus stops, sensors
     - LineStrings: bus lanes, cycling paths, roads
     - Polygons: area type, parking, land use

3. **"Missing CRS (projection) information"**
   - Check: Does new shapefile have a .prj file?
   - Fix: Add .prj file with coordinate system info

4. **"Feature count changed significantly: 1000 → 50 (-95%)"**
   - This is a warning, not an error
   - Dialog appears: "Continue with replacement?"
   - Click OK if intentional, Cancel to try again

---

## 🎓 Learning More

See `TESTING_GIS_LAYERS.md` for:
- Detailed testing procedures
- How to create test shapefiles with Python
- How to troubleshoot issues
- Performance considerations for large files
