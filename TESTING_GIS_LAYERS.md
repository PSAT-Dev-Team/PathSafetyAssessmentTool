# GIS Layer Management Testing Guide

## Complete User Flow

### **Flow 1: Adding a New GIS Layer**

```
User on Projects Page
        ↓
    Click "GIS Layer" button (bottom left)
        ↓
    Modal opens: "Update GIS Layers"
        ↓
    Click "Add GIS Layer" option
        ↓
    Choose or Create Category Folder
    (e.g., "my_custom_layers", "test_data")
        ↓
    Upload shapefile files via drag-drop or file browser
    ✓ Must include: .shp, .shx, .dbf
    ✓ Optional: .prj, .cpg, .sbn, .sbx
        ↓
    Click "Upload (N)" button
        ↓
    Success! Files stored in: shapefiles/category_name/
        ↓
    Note: Layer won't be used in autocoding yet
    (Requires backend code to register layer)
        ↓
    Close modal
```

### **Flow 2: Replacing an Existing GIS Layer (New!)**

```
User on Projects Page
        ↓
    Click "GIS Layer" button
        ↓
    Modal opens
        ↓
    Click "Replace GIS Layer" option
        ↓
    Step 1: Upload new files
    Drag-drop or browse new shapefile files
    (e.g., updated CyclingPath_2025.shp)
        ↓
    Step 2: Select Category Folder
    (e.g., "path" for cycling paths)
        ↓
    Step 3: Select target layer to replace
    (e.g., "CyclingpathCentreline.shp")
        ↓
    Click "Replace (N files)" button
        ↓
    ⚡ VALIDATION HAPPENS HERE ⚡

    Backend checks:
    ✓ CRS compatibility
    ✓ Geometry types (LineString vs Point, etc.)
    ✓ Required columns (WIDTH, LK_ID_NUM, etc.)
    ✓ Feature count changes
    ✓ Empty geometries
    ✓ Spatial bounds
        ↓
    IF ERRORS found:
    ❌ Show error message
    ❌ Block replacement
    ❌ User must fix issues
        ↓
    IF WARNINGS found:
    ⚠️ Show warning dialog
    ⚠️ Ask user: "Continue anyway?"
    ⚠️ User clicks OK or Cancel
        ↓
    IF VALID:
    ✅ Atomic replacement happens:
       - Backup old files
       - Replace with atomic writes
       - On failure: auto-restore from backup
        ↓
    Success! New data used immediately
        ↓
    Close modal
```

---

## Testing Scenarios

### **Scenario 1: Basic Replacement (Happy Path)**

**What to test:** Replacing a layer with compatible new data

**Prerequisites:**
- Existing shapefile: `shapefiles/cycling_path/CyclingpathCentreline.shp`
- New shapefile with same structure: `new_cycling_path.shp`

**Steps:**
1. Open GIS Layer modal → Replace GIS Layer
2. Upload new cycling path files
3. Select `cycling_path` category
4. Select `CyclingpathCentreline.shp` to replace
5. Click Replace

**Expected Result:**
```
✅ Validation: VALID (no errors or warnings)
✅ Replacement: SUCCESS
✅ New data used immediately in autocoding
✅ Backup created in: shapefiles/cycling_path/.backup/
```

**Verify:**
```bash
# Check backup exists
ls -la backend/shapefiles/cycling_path/.backup/

# Check file timestamp changed
ls -l backend/shapefiles/cycling_path/CyclingpathCentreline.shp
# Should be recent (just now)
```

---

### **Scenario 2: CRS Mismatch (Warning)**

**What to test:** Replacing with different projection system

**Prerequisites:**
- Old file: EPSG:4326 (WGS84)
- New file: EPSG:3414 (Singapore's projection)

**Steps:**
1. Open GIS Layer modal → Replace
2. Upload file in EPSG:3414
3. Select category and target file
4. Click Replace

**Expected Result:**
```
⚠️ WARNING: "CRS mismatch: new=EPSG:3414, old=EPSG:4326.
            Will be auto-converted to EPSG:3414 during use."

User clicks OK → Replacement proceeds (VALID but with warning)
```

**Why this works:** System auto-converts all CRS to EPSG:3414 during use

---

### **Scenario 3: Missing Required Column (Error)**

**What to test:** Replacing cycling path without WIDTH column

**Prerequisites:**
- Old file: Has WIDTH column
- New file: No WIDTH column (deleted by mistake)

**Steps:**
1. Open GIS Layer modal → Replace
2. Upload cycling path WITHOUT WIDTH column
3. Select category and target
4. Click Replace

**Expected Result:**
```
❌ ERROR: "Missing required columns: WIDTH"

Replacement BLOCKED
User must re-upload file with WIDTH column
```

**Why this matters:** Width calculation requires WIDTH column. System catches this before corrupting data.

---

### **Scenario 4: Geometry Type Mismatch (Error)**

**What to test:** Replacing LineString layer with Point geometry

**Prerequisites:**
- Old file: `bus_lane.shp` (LineString geometry)
- New file: Points instead of lines (wrong geometry)

**Steps:**
1. Open GIS Layer modal → Replace
2. Upload wrong geometry type
3. Select `bus_lane` category
4. Select `Bus lanes.shp` to replace
5. Click Replace

**Expected Result:**
```
❌ ERROR: "Unexpected geometry type(s): Point. Expected: LineString, MultiLineString"

Replacement BLOCKED
User must use correct geometry type
```

**Why this matters:** Spatial queries expect specific geometry. Point queries ≠ LineString queries.

---

### **Scenario 5: Column Alias Resolution (Success)**

**What to test:** Replace with renamed column (WIDTH → PATH_WIDTH)

**Prerequisites:**
- Old file: Column named "WIDTH"
- New file: Column named "PATH_WIDTH" (different name, same data)

**Steps:**
1. Open GIS Layer modal → Replace
2. Upload cycling path with `PATH_WIDTH` instead of `WIDTH`
3. Select category and target
4. Click Replace

**Expected Result:**
```
✅ WARNING: "Column 'WIDTH' resolved to 'PATH_WIDTH' in new file"

⚠️ Shows warning but continues (VALID)
✅ Replacement succeeds
✅ System automatically uses PATH_WIDTH column
✅ No code change needed!
```

**Verify:**
```python
# In autocoding, system finds the right column automatically
width = gdf.loc[nearest_idx, 'PATH_WIDTH']  # Works!
```

---

### **Scenario 6: Dramatic Feature Count Change (Warning)**

**What to test:** Replacing with significantly different dataset

**Prerequisites:**
- Old file: 1000 features
- New file: 50 features (95% reduction)

**Steps:**
1. Open GIS Layer modal → Replace
2. Upload new file with 50 features
3. Select category and target
4. Click Replace

**Expected Result:**
```
⚠️ WARNING: "Feature count changed significantly: 1000 → 50 (-95%).
             Review to ensure this is intentional."

Modal shows: "Continue with replacement?"
- User clicks OK → Proceeds
- User clicks Cancel → Aborts

✅ If OK: Replacement succeeds with new (smaller) dataset
```

**Why this matters:** Catches accidental uploads of wrong/incomplete files

---

### **Scenario 7: Empty Geometries (Warning)**

**What to test:** File with invalid/empty geometries

**Prerequisites:**
- New file has 20 empty/null geometries out of 1000

**Steps:**
1. Open GIS Layer modal → Replace
2. Upload file with empty geometries
3. Select category and target
4. Click Replace

**Expected Result:**
```
⚠️ WARNING: "Found 20 empty geometry/geometries in new file"

User confirms, replacement proceeds
(Geopandas will skip empty geometries during operations)
```

---

### **Scenario 8: Atomic Write Failure + Recovery (Advanced)**

**What to test:** System handles write failures gracefully

**Prerequisites:**
- Read-write permission issues or disk full scenario
- This is hard to test in normal conditions

**Steps:**
1. Make target file read-only: `chmod 444 file.shp`
2. Try to replace
3. System attempts atomic write
4. Write fails (permission denied)
5. System auto-restores from backup

**Expected Result:**
```
Console logs:
[REPLACE] Backed up: ... → ... ✅
[REPLACE] Atomically replaced: ... → ... (FAILS)
[REPLACE] Restored from backup after failed replacement ✅

Response: Error message to user
Backup restored automatically
Original file intact
```

---

## Testing with Real Data

### **Option A: Use Existing Project Data**

```bash
# Copy existing cycling path as test
cp backend/shapefiles/path/CyclingpathCentreline.shp \
   backend/shapefiles/path/CyclingpathCentreline_backup.shp
cp backend/shapefiles/path/CyclingpathCentreline.shx \
   backend/shapefiles/path/CyclingpathCentreline_backup.shx
cp backend/shapefiles/path/CyclingpathCentreline.dbf \
   backend/shapefiles/path/CyclingpathCentreline_backup.dbf
cp backend/shapefiles/path/CyclingpathCentreline.prj \
   backend/shapefiles/path/CyclingpathCentreline_backup.prj

# Now replace CyclingpathCentreline with backup
```

### **Option B: Create Test Shapefiles**

```python
# Test script: create_test_shapefile.py
import geopandas as gpd
from shapely.geometry import LineString, Point
import pandas as pd

# Create test cycling path (LineString with WIDTH)
lines = [
    LineString([(103.8, 1.4), (103.81, 1.41)]),
    LineString([(103.81, 1.41), (103.82, 1.42)])
]
gdf = gpd.GeoDataFrame({
    'geometry': lines,
    'WIDTH': [2.5, 3.0]
}, crs='EPSG:4326')
gdf.to_file('test_cycling_path.shp')

# Create test with renamed column (PATH_WIDTH)
gdf['PATH_WIDTH'] = gdf['WIDTH']
gdf = gdf.drop('WIDTH', axis=1)
gdf.to_file('test_cycling_path_renamed.shp')

# Create test with wrong geometry (Point instead of LineString)
points = [Point(103.8, 1.4), Point(103.81, 1.41)]
gdf_wrong = gpd.GeoDataFrame({
    'geometry': points,
    'WIDTH': [2.5, 3.0]
}, crs='EPSG:4326')
gdf_wrong.to_file('test_points.shp')
```

**Run it:**
```bash
python create_test_shapefile.py
# Creates: test_cycling_path.shp, test_cycling_path_renamed.shp, test_points.shp
```

---

## Browser Testing Procedure

### **Setup:**
1. Start Flask backend: `python run.py` (or your start command)
2. Start React frontend: `npm run dev`
3. Open browser to `http://localhost:5173`
4. Navigate to Projects page

### **Test Workflow:**

**Step 1: Basic Replace Test**
```
1. Click "GIS Layer" button
2. Click "Replace GIS Layer"
3. Drag-drop test_cycling_path.shp + .shx + .dbf files
4. Select category: "path"
5. Select target: "CyclingpathCentreline.shp"
6. Click "Replace (3)"
7. ✅ Should validate → success
8. Check console: [Replace] Successfully replaced 3 files
9. Check File system: timestamp should be recent
```

**Step 2: Alias Resolution Test**
```
1. Click "GIS Layer" → Replace
2. Upload test_cycling_path_renamed.shp (has PATH_WIDTH, not WIDTH)
3. Select category: "path"
4. Select target: "CyclingpathCentreline.shp"
5. Click Replace
6. ✅ Should warn: "Column 'WIDTH' resolved to 'PATH_WIDTH'"
7. Click OK
8. ✅ Should succeed
9. Width calculations still work (using PATH_WIDTH)
```

**Step 3: Error Test**
```
1. Click "GIS Layer" → Replace
2. Upload test_points.shp (wrong geometry type)
3. Select category: "path"
4. Select target: "CyclingpathCentreline.shp"
5. Click Replace
6. ❌ Should block: "Unexpected geometry type(s): Point"
7. ✅ Original file unchanged
```

---

## Diagnostic Console Logs

### **Check Backend Logs:**
```bash
# Watch Flask output for validation messages
# You should see:

[REPLACE] Validating: test_cycling_path.shp
[REPLACE] CRS: EPSG:4326 → EPSG:3414 (auto-convert)
[REPLACE] Geometry: LineString ✓
[REPLACE] Columns: WIDTH found ✓
[REPLACE] Feature count: 100 (was 95, +5%)
[REPLACE] Empty geometries: 0 ✓
[REPLACE] Spatial bounds: OK ✓
[REPLACE] VALID - proceeding with replacement

[REPLACE] Backed up: ... ✓
[REPLACE] Atomically replaced: ... ✓
[REPLACE] Successfully replaced 3 files
```

### **Check Browser Console (F12):**
```javascript
// You should see:

[Replace] Step 1: Uploading files to temp_replace: [...filenames...]
[Replace] Upload result: {count: 3, errors: []}

[Replace] Step 2: Validating compatibility
[Replace] Validation result: {
  valid: true,
  errors: [],
  warnings: ["Column 'WIDTH' resolved to 'PATH_WIDTH'"],
  column_mapping: {WIDTH: "PATH_WIDTH"},
  info: {...}
}

[Replace] Step 3: Replacing area_type/CentralMB2025.shp
[Replace] Replace result: {count: 1, replaced: [...], errors: []}
```

---

## Quick Checklist for Testing

- [ ] **Basic replacement** - Upload and replace a shapefile
- [ ] **CRS validation** - Different projections (shows warning)
- [ ] **Geometry validation** - Wrong geometry type (shows error, blocks)
- [ ] **Column validation** - Missing required column (shows error, blocks)
- [ ] **Column alias** - Renamed column (shows warning, continues)
- [ ] **Feature count** - Significant changes (shows warning)
- [ ] **Empty geometries** - Files with null geometries (shows warning)
- [ ] **Backup creation** - Check `.backup` directory created
- [ ] **File timestamps** - New file has recent timestamp
- [ ] **Error recovery** - Permissions issue → backup restored
- [ ] **Modal workflow** - Choice → upload → validate → replace → success
- [ ] **Auto reload** - New data used immediately without restart

---

## Troubleshooting

### **Problem: Validation endpoint returns 500**
```
Check backend logs for:
- ShapefileValidator import error
- gis_layer_definition import error

Fix:
python -c "from app.services.shapefile_validator import ShapefileValidator"
python -c "from app.services.gis_layer_definition import get_layer_definition"
```

### **Problem: Validation always returns errors**
```
Check:
- File actually exists: ls -l backend/shapefiles/temp_replace/...
- File is readable: file backend/shapefiles/.../file.shp
- Geopandas can read it: python -c "import geopandas as gpd; gpd.read_file('file.shp')"
```

### **Problem: Column alias not working**
```
Check:
- Layer has definition in gis_layer_definition.py
- Layer name matches (e.g., "cycling_path" not "Cycling Path")
- Column alias is in the definition

Verify:
python -c "
from app.services.gis_layer_definition import get_layer_definition
layer = get_layer_definition('cycling_path')
print(layer.column_aliases)
"
```

### **Problem: Replacement succeeds but autocoding doesn't use new data**
```
This is expected!
New data is used on the NEXT autocoding request.
It doesn't retroactively update existing segments.

To test:
1. Replace cycling_path.shp
2. Go to a segment in coding page
3. Click "Autocode GIS" button
4. Should use new data from updated shapefile
```

---

## Performance Considerations

### **Large Shapefiles (>100 MB)**
- Upload may take time
- Validation (reading GeoDataFrame) may take 10-30 seconds
- Consider showing progress indicator

### **Many Features (>100k features)**
- Feature count validation still fast
- But spatial index creation during first use will be slow

### **Recommendation:**
For very large shapefiles, consider:
- Subsetting to study area before upload
- Compressing before upload
- Using GeoJSON instead of shapefile (often smaller)

