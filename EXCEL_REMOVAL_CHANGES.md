# Excel Dependency Removal - Change Documentation

**Date**: 2025-11-04
**Status**: ✅ Complete
**Summary**: Replaced Excel-based cycleRAP scoring with native Python implementation

---

## Overview

Previously, the cycleRAP score calculation required:
- ❌ Windows OS
- ❌ Microsoft Excel installed
- ❌ VBA macros (`CycleRAP_v2.11.xlsm`)
- ❌ `pywin32` COM automation library

Now, the calculation uses:
- ✅ Native Python (cross-platform)
- ✅ Works on macOS, Linux, Windows
- ✅ No external dependencies
- ✅ Faster execution (no Excel startup/shutdown)

---

## Files Modified/Created

### 1. **NEW FILE**: `backend/app/services/cyclerap_scoring.py`

**Purpose**: Native Python implementation of cycleRAP scoring algorithm

**Functions**:
```python
calculate_bb_score(row)          # Bicyclist-Bicyclist conflict risk
calculate_bp_score(row)          # Bicyclist-Pedestrian conflict risk
calculate_sb_score(row)          # Bicyclist-Severe Hazard risk
calculate_vb_score(row)          # Vehicle-Bicyclist conflict risk
calculate_cyclerap_score(...)    # Composite score formula
calculate_risk_band(score)       # Convert score to risk band (0-4)
calculate_cyclerap_score_native(df)  # Main entry point
```

**Input**:
- Pandas DataFrame with 41 attribute columns (same as before)

**Output**:
- Pandas DataFrame with 10 columns:
  ```python
  {
      'BB': float,                    # Score 0-100
      'BB Band': int,                 # Risk band 0-4
      'BP': float,
      'BP Band': int,
      'SB': float,
      'SB Band': int,
      'VB': float,
      'VB Band': int,
      'CycleRAP score': float,        # Composite score
      'CycleRAP score Band': int      # Overall risk band
  }
  ```

**⚠️ IMPORTANT NOTE**:
This is currently a **MOCK implementation** using simplified heuristics to demonstrate the data flow. The actual cycleRAP formulas are still embedded in the Excel VBA/worksheets.

To implement the real algorithm:
1. Obtain official cycleRAP methodology documentation
2. Replace the calculation logic in each `calculate_*_score()` function
3. The data structure and API flow are already correct

---

### 2. **MODIFIED**: `backend/app/api/projects/routes.py`

#### Change 1: Added Import (Line 22)
```python
# NEW
from app.services.cyclerap_scoring import calculate_cyclerap_score_native
```

#### Change 2: Updated `/score` Endpoint (Lines 252-336)

**Old Implementation** (Excel-based):
```python
# Line 272 (OLD)
results_df = CRI.cycleRAP_interface.calculate_cycleRAP_score(attrs)
# ^ This required Windows + Excel
```

**New Implementation** (Python-based):
```python
# Line 320 (NEW)
results_df = calculate_cyclerap_score_native(attrs)
# ^ Cross-platform, no Excel needed
```

**Added Features**:
- ✅ Comprehensive docstring with request/response examples
- ✅ Debug logging to track input/output
- ✅ Clear section markers for calculation and persistence
- ✅ Explicit note about mock implementation

**Logging Output** (visible in backend console):
```
[calculate_score] Processing 10 rows for project 'TestZero'
[calculate_score] Attribute columns: ['Facility type', 'Facility width', ...]
[calculate_score] Sample input (first row):
{'Facility type': 1, 'Facility width': 2, ...}

[calculate_score] Calculation complete. Generated 10 result rows
[calculate_score] Result columns: ['BB', 'BB Band', 'BP', 'BP Band', ...]
[calculate_score] Sample output (first row):
{'BB': 60.0, 'BB Band': 3, 'BP': 0.0, ...}

[calculate_score] Results saved to disk for project 'TestZero'
```

---

### 3. **MODIFIED**: `frontend/src/api/index.ts`

#### Added Export (Lines 231-253)

```typescript
export type CalculateScoreResult = {
  ok: boolean;
  result_rows: Record<string, any>[];
};

export async function calculateScore(project: string): Promise<CalculateScoreResult> {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as CalculateScoreResult;
}
```

**Purpose**: Provides a typed API function for the frontend to call the scoring endpoint

---

### 4. **MODIFIED**: `frontend/src/pages/sidebar/Sidebar.tsx`

#### Change 1: Added Import (Line 5)
```typescript
import { calculateScore } from "../../api";
```

#### Change 2: Updated `onCalculate` Handler (Lines 45-78)

**Old Implementation** (placeholder):
```typescript
const onCalculate = useCallback(async () => {
  toaster.create({
    description: "calculating scores",
    type: "success",
  });
}, []);
```

**New Implementation** (functional):
```typescript
const onCalculate = useCallback(async () => {
  if (!projectName) {
    toaster.create({
      description: "No project selected",
      type: "error",
    });
    return;
  }

  try {
    toaster.create({
      description: "Calculating scores...",
      type: "loading",
    });

    const result = await calculateScore(projectName);

    // Log the attrs data to console so you can inspect it
    console.log("=== CALCULATE SCORE RESULT ===");
    console.log("Result:", result);
    console.log("Result rows:", result.result_rows);

    toaster.create({
      description: `Score calculated! ${result.result_rows.length} rows returned`,
      type: "success",
    });
  } catch (error) {
    console.error("Calculate score error:", error);
    toaster.create({
      description: error instanceof Error ? error.message : "Failed to calculate score",
      type: "error",
    });
  }
}, [projectName]);
```

**Features**:
- ✅ Actually calls the backend API
- ✅ Logs results to browser console for inspection
- ✅ Shows loading/success/error toasts
- ✅ Proper error handling

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  USER ACTION                                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. User clicks "Calculate Score & Treatment" button            │
│     Location: CodingSidebar.tsx (line 54)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Frontend: onCalculate() handler                             │
│     Location: Sidebar.tsx (line 60)                             │
│     Action: Calls calculateScore(projectName)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Frontend API: calculateScore()                              │
│     Location: api/index.ts (line 244)                           │
│     Action: POST /api/projects/{project}/score                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Backend Endpoint: calculate_score()                         │
│     Location: routes.py (line 253)                              │
│     Actions:                                                     │
│     - Load project attributes from disk                         │
│     - Call calculate_cyclerap_score_native(attrs)               │
│     - Save results to disk                                      │
│     - Return JSON response                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Scoring Module: calculate_cyclerap_score_native()           │
│     Location: cyclerap_scoring.py (line 189)                    │
│     Actions:                                                     │
│     - Loop through each row in attributes DataFrame             │
│     - Calculate BB score (Bicyclist-Bicyclist)                  │
│     - Calculate BP score (Bicyclist-Pedestrian)                 │
│     - Calculate SB score (Bicyclist-Severe Hazard)              │
│     - Calculate VB score (Vehicle-Bicyclist)                    │
│     - Calculate composite CycleRAP score                        │
│     - Convert scores to risk bands (0-4)                        │
│     - Return results DataFrame                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Response flows back through the chain                       │
│     - Backend saves results and returns JSON                    │
│     - Frontend logs to console                                  │
│     - User sees success toast                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing Instructions

### 1. Backend Testing (Standalone)

```bash
cd backend
python3 -c "
import sys
sys.path.insert(0, '.')
import pandas as pd
exec(open('app/services/cyclerap_scoring.py').read())

# Create test data
test_data = {
    'Facility type': [1, 2, 3],
    'Facility width': [1, 2, 3],
    'Flow direction': [1, 2, 1],
    'Peak bicycle traffic flow': [3, 2, 1],
    'Peak pedestrian flow': [2, 3, 1],
    'Fixed obstacle': [1, 2, 2],
    'Loose/slippery surface': [1, 2, 2],
    'Light segregation': [1, 2, 1],
    'Adjacent road lane 0-1m': [1, 2, 1],
    'Speed limit': [60, 40, 30],
    'Road AADT': [15000, 5000, 1000]
}

df = pd.DataFrame(test_data)
result = calculate_cyclerap_score_native(df)
print('✅ Success!')
print(result)
"
```

### 2. Full Integration Testing

1. Start backend server:
   ```bash
   cd backend
   python3 run.py  # or your startup command
   ```

2. Start frontend:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open browser and navigate to a project's coding page (e.g., `TestZero`)

4. Open Browser DevTools (F12) → Console tab

5. Click **"Calculate Score & Treatment"** button

6. **Expected Results**:
   - Frontend console shows:
     ```
     === CALCULATE SCORE RESULT ===
     Result: {ok: true, result_rows: Array(10)}
     Result rows: [{BB: 60, BP: 0, SB: 80, VB: 85, ...}, ...]
     ```
   - Backend console shows:
     ```
     [calculate_score] Processing 10 rows for project 'TestZero'
     [calculate_score] Attribute columns: [...]
     [calculate_score] Sample input (first row):
     ...
     [calculate_score] Calculation complete. Generated 10 result rows
     [calculate_score] Sample output (first row):
     ...
     [calculate_score] Results saved to disk
     ```
   - Success toast appears: "Score calculated! 10 rows returned"

---

## Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'app.services.cyclerap_scoring'"

**Solution**: Make sure you've created the new file at the correct path:
```bash
backend/app/services/cyclerap_scoring.py
```

### Issue: Backend still tries to use Excel

**Solution**: Make sure line 320 in `routes.py` reads:
```python
results_df = calculate_cyclerap_score_native(attrs)
```
NOT:
```python
results_df = CRI.cycleRAP_interface.calculate_cycleRAP_score(attrs)
```

### Issue: Frontend shows "Failed to calculate score"

**Solution**:
1. Check backend console for errors
2. Verify backend server is running
3. Check that the project has attributes data
4. Open Network tab in DevTools to see the actual API response

---

## Next Steps: Implementing Real Algorithm

The current implementation is a **mock/placeholder**. To implement the real cycleRAP algorithm:

### Step 1: Get Official Documentation
- Obtain the cycleRAP methodology paper/manual
- Document the exact formulas for BB, BP, SB, VB scores
- Document the composite score calculation
- Document the risk band thresholds

### Step 2: Update `cyclerap_scoring.py`
Replace the mock calculations in:
- `calculate_bb_score()` - Lines 37-60
- `calculate_bp_score()` - Lines 63-88
- `calculate_sb_score()` - Lines 91-120
- `calculate_vb_score()` - Lines 123-165
- `calculate_cyclerap_score()` - Lines 168-182
- `calculate_risk_band()` - Lines 15-34

### Step 3: Validate Against Excel
If you still have access to the Excel workbook:
1. Export the same test data to Excel
2. Run the Excel macro
3. Compare Excel results with Python results
4. Iterate until results match

### Step 4: Remove Mock Warning
Once the real algorithm is implemented:
1. Remove the "MOCK implementation" comments
2. Update the docstring in `routes.py` (line 293-294)
3. Add algorithm version/date to documentation

---

## Rollback Instructions

If you need to revert to the Excel-based implementation:

### 1. Restore `routes.py`
```python
# Line 320 - change back to:
results_df = CRI.cycleRAP_interface.calculate_cycleRAP_score(attrs)
```

### 2. Remove Import
```python
# Line 22 - remove:
from app.services.cyclerap_scoring import calculate_cyclerap_score_native
```

### 3. Keep Frontend Changes
The frontend changes can stay - they work with either backend implementation.

---

## Summary of Benefits

| Aspect | Before (Excel) | After (Python) |
|--------|---------------|----------------|
| **Platform** | Windows only | macOS, Linux, Windows |
| **Dependencies** | Excel, pywin32, VBA | pandas, numpy (already installed) |
| **Speed** | Slow (Excel startup) | Fast (native Python) |
| **Testing** | Difficult (GUI required) | Easy (unit tests) |
| **CI/CD** | Not possible | Fully supported |
| **Debugging** | VBA debugger | Python debugger |
| **Version Control** | Binary .xlsm file | Text .py files |
| **Maintainability** | Low (hidden VBA) | High (documented Python) |

---

## Questions?

If you have questions about these changes, check:
1. This documentation file
2. Comments in `cyclerap_scoring.py`
3. Comments in `routes.py` lines 252-336
4. Console logs when running the calculation

---

**End of Documentation**
