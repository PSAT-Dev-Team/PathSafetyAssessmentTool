# CycleRAP Scoring - Code Flow Diagram

## Where is `cyclerap_scoring.py` being called?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND CODE                                    │
└─────────────────────────────────────────────────────────────────────────┘

  📁 frontend/src/pages/sidebar/components/CodingSidebar.tsx
     ┃
     ┃  Line 54: Button component
     ┃  ────────────────────────────────────────────────────
     ┃  <Button onClick={onCalculate} ...>
     ┃    Calculate Score & Treatment
     ┃  </Button>
     ┃
     ┗━━━━━━━━━━━━━━ onClick event ━━━━━━━━━━━━━━┓
                                                 ▼

  📁 frontend/src/pages/sidebar/Sidebar.tsx
     ┃
     ┃  Line 45-78: onCalculate handler
     ┃  ────────────────────────────────────────────────────
     ┃  const onCalculate = useCallback(async () => {
     ┃    ...
     ┃    const result = await calculateScore(projectName);  ◄─── Line 60
     ┃    ...
     ┃  }, [projectName]);
     ┃
     ┗━━━━━━━━━━━━━━ API call ━━━━━━━━━━━━━━┓
                                             ▼

  📁 frontend/src/api/index.ts
     ┃
     ┃  Line 244-253: API function
     ┃  ────────────────────────────────────────────────────
     ┃  export async function calculateScore(project: string) {
     ┃    const res = await fetch(
     ┃      `/api/projects/${project}/score`,  ◄─── POST request
     ┃      { method: "POST", ... }
     ┃    );
     ┃    return await res.json();
     ┃  }
     ┃
     ┗━━━━━━━━━━━━━━ HTTP POST ━━━━━━━━━━━━━━┓
                                              ▼

┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND CODE                                     │
└─────────────────────────────────────────────────────────────────────────┘

  📁 backend/app/api/projects/routes.py
     ┃
     ┃  Line 22: Import statement
     ┃  ────────────────────────────────────────────────────
     ┃  from app.services.cyclerap_scoring import calculate_cyclerap_score_native
     ┃
     ┃  Line 252: Route decorator
     ┃  ────────────────────────────────────────────────────
     ┃  @bp.post("/<project_name>/score")  ◄─── Handles POST requests
     ┃
     ┃  Line 253: Endpoint function
     ┃  ────────────────────────────────────────────────────
     ┃  def calculate_score(project_name: str):
     ┃      """Calculate cycleRAP scores..."""
     ┃
     ┃      # Get project and attributes
     ┃      ctx = get_ctx()
     ┃      proj = ctx["pm"].project(project_name)
     ┃      ver = proj.latest()
     ┃      attrs = ver.attributes.df  ◄─── Line 302: Load attributes
     ┃
     ┃      # Log input
     ┃      print(f"[calculate_score] Processing {len(attrs)} rows")
     ┃      print(f"[calculate_score] Attribute columns: {list(attrs.columns)}")
     ┃      print(f"[calculate_score] Sample input: {attrs.iloc[0].to_dict()}")
     ┃
     ┃      # ⭐⭐⭐ THIS IS WHERE THE MAGIC HAPPENS ⭐⭐⭐
     ┃      results_df = calculate_cyclerap_score_native(attrs)  ◄─── Line 320
     ┃      # ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
     ┃
     ┃      # Log output
     ┃      print(f"[calculate_score] Generated {len(results_df)} result rows")
     ┃      print(f"[calculate_score] Sample output: {results_df.iloc[0].to_dict()}")
     ┃
     ┃      # Save to disk
     ┃      ver._results = serializer.Results()
     ┃      ver.results.df = results_df
     ┃      proj.save_all()
     ┃
     ┃      # Return JSON
     ┃      return jsonify({"ok": True, "result_rows": results_df.to_dict(...)})
     ┃
     ┗━━━━━━━━━━━━━━ Function call ━━━━━━━━━━━━━━┓
                                                   ▼

  📁 backend/app/services/cyclerap_scoring.py  ◄─── 🎯 YOUR SCORING MODULE
     ┃
     ┃  Line 189: Main entry point
     ┃  ────────────────────────────────────────────────────
     ┃  def calculate_cyclerap_score_native(attributes_df: pd.DataFrame):
     ┃      """
     ┃      Calculate cycleRAP scores using native Python.
     ┃
     ┃      Input: DataFrame with 41 attribute columns
     ┃      Output: DataFrame with 10 result columns (BB, BP, SB, VB, scores & bands)
     ┃      """
     ┃      results = []
     ┃
     ┃      # Process each row
     ┃      for idx, row in attributes_df.iterrows():
     ┃
     ┃          # Calculate component scores
     ┃          bb_score = calculate_bb_score(row)      ◄─── Line 37
     ┃          bp_score = calculate_bp_score(row)      ◄─── Line 63
     ┃          sb_score = calculate_sb_score(row)      ◄─── Line 91
     ┃          vb_score = calculate_vb_score(row)      ◄─── Line 123
     ┃
     ┃          # Calculate composite score
     ┃          composite = calculate_cyclerap_score(   ◄─── Line 168
     ┃              bb_score, bp_score, sb_score, vb_score
     ┃          )
     ┃
     ┃          # Calculate risk bands
     ┃          bb_band = calculate_risk_band(bb_score)  ◄─── Line 15
     ┃          bp_band = calculate_risk_band(bp_score)
     ┃          sb_band = calculate_risk_band(sb_score)
     ┃          vb_band = calculate_risk_band(vb_score)
     ┃          composite_band = calculate_risk_band(composite)
     ┃
     ┃          # Append result
     ┃          results.append({
     ┃              'BB': bb_score,
     ┃              'BB Band': bb_band,
     ┃              'BP': bp_score,
     ┃              'BP Band': bp_band,
     ┃              'SB': sb_score,
     ┃              'SB Band': sb_band,
     ┃              'VB': vb_score,
     ┃              'VB Band': vb_band,
     ┃              'CycleRAP score': composite,
     ┃              'CycleRAP score Band': composite_band
     ┃          })
     ┃
     ┃      return pd.DataFrame(results)
     ┃
     ┗━━━━━━━━━━━━━━ Returns DataFrame ━━━━━━━━━━━━━━┓
                                                      ▼
                                            Back to routes.py
                                                      ▼
                                         Saves to disk + returns JSON
                                                      ▼
                                            Back to frontend
                                                      ▼
                                         Logs to console + shows toast
```

## Key Points

### 1. **Entry Point**: Line 320 in `routes.py`
```python
results_df = calculate_cyclerap_score_native(attrs)
```
This single line calls your scoring module.

### 2. **Import Statement**: Line 22 in `routes.py`
```python
from app.services.cyclerap_scoring import calculate_cyclerap_score_native
```
This makes the function available.

### 3. **The Scoring Module**: `cyclerap_scoring.py`
Contains all the scoring logic:
- `calculate_bb_score()` - BB risk calculation
- `calculate_bp_score()` - BP risk calculation
- `calculate_sb_score()` - SB risk calculation
- `calculate_vb_score()` - VB risk calculation
- `calculate_cyclerap_score()` - Composite formula
- `calculate_risk_band()` - Score to band conversion
- `calculate_cyclerap_score_native()` - Orchestrates everything

### 4. **Data Flow**
```
Input (attrs DataFrame)
    ↓
For each row:
    → calculate_bb_score(row) → 60.0 → calculate_risk_band() → Band 3
    → calculate_bp_score(row) → 0.0  → calculate_risk_band() → Band 0
    → calculate_sb_score(row) → 80.0 → calculate_risk_band() → Band 4
    → calculate_vb_score(row) → 85.0 → calculate_risk_band() → Band 4
    ↓
Composite calculation:
    → calculate_cyclerap_score(60, 0, 80, 85) → 61.5 → Band 3
    ↓
Output (results DataFrame)
    {
        'BB': 60.0, 'BB Band': 3,
        'BP': 0.0, 'BP Band': 0,
        'SB': 80.0, 'SB Band': 4,
        'VB': 85.0, 'VB Band': 4,
        'CycleRAP score': 61.5,
        'CycleRAP score Band': 3
    }
```

## How to See It In Action

### Backend Console Output
When you click the button, `routes.py` logs:
```
[calculate_score] Processing 10 rows for project 'TestZero'
[calculate_score] Attribute columns: ['Facility type', 'Facility width', ...]
[calculate_score] Sample input (first row):
{'Facility type': 1, 'Facility width': 2, 'Flow direction': 1, ...}

[calculate_score] Calculation complete. Generated 10 result rows
[calculate_score] Result columns: ['BB', 'BB Band', 'BP', 'BP Band', ...]
[calculate_score] Sample output (first row):
{'BB': 60.0, 'BB Band': 3, 'BP': 0.0, 'BP Band': 0, ...}

[calculate_score] Results saved to disk for project 'TestZero'
```

### Frontend Console Output
The browser console shows:
```
=== CALCULATE SCORE RESULT ===
Result: {ok: true, result_rows: Array(10)}
Result rows: [
  {BB: 60, BB Band: 3, BP: 0, BP Band: 0, SB: 80, SB Band: 4, ...},
  {BB: 45, BB Band: 2, BP: 30, BP Band: 2, SB: 65, SB Band: 3, ...},
  ...
]
```

## Replacing the Mock Implementation

When you're ready to implement the real algorithm, edit these functions in `cyclerap_scoring.py`:

```python
def calculate_bb_score(row: pd.Series) -> float:
    """
    Calculate Bicyclist-Bicyclist (BB) conflict risk score.

    TODO: Replace with actual BB calculation algorithm
    """
    # Replace everything below this line with the real formula
    score = 0.0
    # ... your actual calculation logic here ...
    return score
```

Repeat for:
- `calculate_bp_score()` (line 63)
- `calculate_sb_score()` (line 91)
- `calculate_vb_score()` (line 123)
- `calculate_cyclerap_score()` (line 168)
- `calculate_risk_band()` (line 15)

The framework is all set up - just replace the mock logic with real formulas!
