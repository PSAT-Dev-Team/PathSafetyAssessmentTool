# Treatment Logic Documentation

## Overview

The treatment logic system is designed to recommend cycling safety improvement treatments based on real-world conditions collected during the coding process. All 25 treatments are derived from the CycleRAP Excel specification (v2.11) and implemented with exact trigger matching.

---

## Core Concepts

### Treatment Anatomy

Each treatment consists of three parts:

```typescript
{
  id: number;           // 1-25, unique identifier
  name: string;         // Human-readable treatment name
  triggers: Record<string, number[]>[];  // **Array of trigger sets** (multiple paths)
  effects: Record<string, number>;       // Attribute changes when applied
}
```

### Trigger Logic (Excel-Based)

The Excel sheet defines this structure: **Row 1 has treatment names, and each column represents ONE trigger set**. When the same treatment name appears in multiple columns, that's multiple trigger sets for the same treatment.

**OR Logic Between Trigger Sets:**
- A treatment is applicable if **at least ONE trigger set matches** (OR)
- This allows multiple different conditions to lead to the same recommendation
- Each array element in `triggers` is a separate valid path

**AND Logic Within a Trigger Set:**
- Within a single trigger set, **ALL conditions must be met** (AND)
- All attributes listed in one trigger object must have matching values
- If any condition fails, that set is rejected; the next set is tested

**Real Example from Excel:**
```typescript
// Treatment 1 from Excel has 8 trigger sets (columns X, Y, Z, AA, AB, AC, AD, AE)
triggers: [
  { "Facility Type": [5], "Light Segregation": [2] },                                                    // Set 1 (Column X)
  { "Facility Type": [6], "Light Segregation": [2] },                                                    // Set 2 (Column Y)
  { "Facility Type": [1, 2], "Number of lanes – adjacent road": [1], "Peak pedestrian flow along or across facility": [3] },  // Set 3 (Column Z)
  { "Facility Type": [1, 2], "Number of lanes – adjacent road": [1] },                                   // Set 4 (Column AA)
  // ... sets 5-8 for different conditions
]
// Treatment applies if: (Type 5 AND Seg missing) OR (Type 6 AND Seg missing) OR (Type 1-2 AND lanes AND high ped flow) OR ...
```

### Attribute Values (Numeric Codes)

All conditions use numeric codes representing categorical values:

#### Facility Type
- `1` = Sidewalk
- `2` = Multi-Use Path
- `3` = Off-Road Bicycle Path
- `4` = On-road Bicycle Lane
- `5` = Road Shoulder
- `6` = Mixed Traffic Road Lane

#### Presence/Safety Conditions
- `1` = Present (or hazardous/problematic)
- `2` = Not Present (safe/acceptable)

#### Adequacy/Access
- `1` = Adequate
- `2` = Inadequate

#### Facility Width
- `1` = Very Narrow
- `2` = Narrow
- `3` = Wide

#### Flow Direction
- `1` = One Way
- `2` = Two Way

#### Intensity/Volume (3-level)
- `1` = None
- `2` = Low
- `3` = Moderate to high

---

## Understanding the Excel Structure

### How Excel Defines Multiple Trigger Sets

The Excel file (STM sheet) has a specific layout:
- **Row 1:** Treatment names (header)
- **Columns R onwards:** Each column = ONE trigger set
- **Rows 2+:** Attribute names and their required values for that trigger set

### Example: Treatment 1 in Excel
```
Column:  X    Y    Z    AA   AB   AC   AD   AE
Row 1:   T1   T1   T1   T1   T1   T1   T1   T1   ← Same treatment, 8 different sets
Row 2:   1    1    1    1    1    1    1    1    ← Treatment ID
Row 3:   2    3    3    4    5    6    6    7    ← Trigger Set ID
...rows with attributes and values for each set...
```

This translates directly to TypeScript as an array:
```typescript
triggers: [
  { /* Column X attributes */ },    // Set 1
  { /* Column Y attributes */ },    // Set 2
  { /* Column Z attributes */ },    // Set 3
  // ... more sets
]
```

### Multiple Trigger Set Counts by Treatment

From the Excel analysis:
- **Treatment 1:** 8 trigger sets (columns X-AE)
- **Treatment 2:** 5 trigger sets (columns AF-AJ)
- **Treatment 3:** 2 trigger sets (columns AK-AL)
- **Treatment 6:** 6 trigger sets (columns AP-AU)
- **Treatment 7:** 2 trigger sets (columns AV-AW)

This allows treatments to be recommended in multiple scenarios—the system checks all sets and recommends if ANY match.

---

## All 25 Treatments

### T1: Upgrade to on-road bicycle lane with light segregation
**Goal:** Add or improve dedicated cycling infrastructure with light separation

**Triggers (4 sets):**
1. Type 5 (Road Shoulder) + Light Segregation Not Present
2. Type 6 (Mixed Traffic) + Light Segregation Not Present
3. Type 1-2 (Sidewalk/Multi-use) + Adequate Adjacent Lanes + High Pedestrian Flow
4. Type 1-2 (Sidewalk/Multi-use) + Adequate Adjacent Lanes

**Effects:** Changes to On-Road Bicycle Lane, adds Light Segregation, improves Facility Access

---

### T2: Safety barrier (Adjacent road 0-1m)
**Goal:** Install protective barrier from immediate adjacent hazards

**Triggers (3 sets):**
1. Type 4-6 + Adjacent Road Lane 0-1m + NOT at Intersection
2. Type 4-6 + Adjacent Road Lane 0-1m + Sharp Curves + NOT at Intersection
3. Type 3-6 + Adjacent Road Lane 0-1m + NOT at Intersection

**Effects:** Removes adjacent road hazard, improves Facility Access

**Critical:** Only applies at non-intersection locations (Intersection flag = [2])

---

### T3: Safety barrier (Adjacent road 1-3m)
**Goal:** Install protective barrier from moderate distance hazards

**Triggers (2 sets):**
1. Type 4-6 + Adjacent Road Lane 1-3m + NOT at Intersection
2. Type 3-6 + Adjacent Road Lane 1-3m + NOT at Intersection

**Effects:** Removes adjacent road hazard 1-3m, improves Facility Access

**Critical:** Excludes intersections to avoid safety issues

---

### T4: Upgrade to cycling-priority street
**Goal:** Reduce vehicle speeds through design/policy

**Triggers (1 set):**
- Type 1,2,5,6 + Adequate Property Access

**Effects:** Improves Facility Access

**Key Point:** Works across most facility types where property access is adequate

---

### T5: Upgrade to multi-use path
**Goal:** Convert to shared use facility

**Triggers (1 set):**
- Type 1,2,5,6 + Adequate Property Access

**Effects:** Changes to Multi-Use Path, Wide Width, improves Access

---

### T6: Upgrade to off-road bicycle path
**Goal:** Separate cycling from vehicular traffic

**Triggers (1 set):**
- Type 1,2,5,6 + Adequate Property Access

**Effects:** Changes to Off-Road Path, improves Access

---

### T7: Convert to one-way facility
**Goal:** Change directional flow

**Triggers (1 set):**
- Type 4-6 + Two-Way Flow Direction

**Effects:** Changes to One-Way, improves Access

---

### T8: Improve surface conditions
**Goal:** Fix pavement defects

**Triggers (1 set):**
- Loose or Slippery Surface Present

**Effects:** Removes surface hazard, fixes deformations

---

### T9: Install light segregation
**Goal:** Add physical separation from traffic

**Triggers (1 set):**
- Light Segregation Not Present

**Effects:** Installs Light Segregation

---

### T10: Install street lighting
**Goal:** Improve visibility

**Triggers (1 set):**
- Street Lighting Not Present

**Effects:** Installs Street Lighting

---

### T11: Remove fixed obstacles
**Goal:** Clear permanent barriers

**Triggers (1 set):**
- Fixed Obstacle on Facility Present

**Effects:** Removes obstacle

---

### T12: Remove non-fixed obstacles
**Goal:** Clear temporary barriers

**Triggers (1 set):**
- Non-Fixed Obstacle on Facility Present

**Effects:** Removes obstacle

---

### T13: Remove width restriction
**Goal:** Expand facility

**Triggers (1 set):**
- Width Restriction Present

**Effects:** Removes restriction

---

### T14: Improve facility access
**Goal:** Fix access issues

**Triggers (1 set):**
- Facility Access Inadequate

**Effects:** Improves to Adequate Access

---

### T15: Redesign sharp curves
**Goal:** Address dangerous curvature

**Triggers (1 set):**
- Curvature Sharp Turns Present

**Effects:** Removes curvature hazard

---

### T16: Widen the facility
**Goal:** Expand width

**Triggers (1 set):**
- Width Very Narrow or Narrow

**Effects:** Changes to Wide

---

### T17: Install protective barrier
**Goal:** Protect from severe adjacent hazards

**Triggers (1 set):**
- Adjacent Severe Hazard 0-1m Present

**Effects:** Removes hazard

---

### T18: Improve delineation
**Goal:** Add lane markings

**Triggers (1 set):**
- Delineation Not Present

**Effects:** Adds Delineation

---

### T19: Review intersection approach
**Goal:** Improve intersection design

**Triggers (1 set):**
- Intersection Approach Inadequate

**Effects:** Changes to Separate/NA

---

### T20: Improve crossing facility
**Goal:** Enhance crossing design

**Triggers (1 set):**
- Crossing Facility Not Present

**Effects:** Adds Crossing Facility

---

### T21: Evaluate grade separation
**Goal:** Consider grade-separated crossing

**Triggers (1 set):**
- Intersection or Road Crossing Present

**Effects:** Removes crossing hazard

---

### T22: Reconfigure/remove parking
**Goal:** Remove adjacent parking conflicts

**Triggers (1 set):**
- Adjacent Vehicle Parking 0-1m Present

**Effects:** Removes parking hazard

---

### T23: Review tram/train rails
**Goal:** Address rail hazards

**Triggers (1 set):**
- Tram or Train Rails Present

**Effects:** Removes rail hazard

---

### T24: Install traffic calming
**Goal:** Reduce vehicle speeds

**Triggers (1 set):**
- Type 4 (On-Road Lane) + NOT at Intersection + Adjacent Road 0-1m

**Effects:** (No direct attribute changes in this version)

---

### T25: Bicycle speed control
**Goal:** Manage high-speed cycling areas

**Triggers (1 set):**
- Bicycle/LV Speed Average >= 20 km/h

**Effects:** Reduces speed to acceptable level

---

## Implementation Details

### Attribute Name Mapping

The application uses display names that match the coding interface exactly. All 55+ attributes available:

**Core Attributes:**
- `Facility Type` - Road/path classification
- `Facility access` - Access adequacy
- `Light Segregation` - Physical separation present
- `Facility Width per Direction` - Width classification
- `Flow Direction` - One/two-way
- `Loose or slippery surface` - Pavement condition

**Hazard Attributes:**
- `Adjacent Road Lane 0-1m` / `1-3m` - Immediate/near traffic
- `Adjacent Vehicle Parking 0-1m` - Parking conflicts
- `Adjacent Severe Hazard 0-1m` / `1-3m` - Other hazards
- `Adjacent object or level change 0-1m` / `1-3m` - Level differences
- `Adjacent Sidewalk 0-1m` / `1-3m` - Sidewalk presence

**Geometric Attributes:**
- `Curvature` - Sharp turn hazard
- `Grade` - Slope
- `Intersection Approach` - Intersection design
- `Intersection or Road Crossing` - Crossing conditions
- `Pedestrian Crossing` - Crossing facility
- `Crossing Facility` - Type of crossing
- `Intersecting Bicycle Facility` - Bike path intersection

**Infrastructure Attributes:**
- `Street Lighting` - Lighting presence
- `Delineation` - Lane marking presence
- `Fixed Obstacle on Facility` - Permanent obstruction
- `Non-Fixed Obstacle on Facility` - Temporary obstruction
- `Width Restriction` - Width constraints
- `Tram or Train Rails` - Rail hazard

**Traffic Flow Attributes:**
- `Number of lanes – adjacent road` - Lane count
- `Number of lanes – intersecting road` - Intersecting lanes
- `Peak bicycle/LV traffic flow` - Bike traffic volume
- `Peak pedestrian flow along or across facility` - Ped traffic volume
- `Bicycle/LV speed – average` - Cycling speed
- `Bicycle/LV speed differential` - Speed differences
- `Heavy vehicle flow` - Heavy vehicle presence
- `Observed proportion of cargo bikes and mopeds` - Cargo bikes

**Area/Access Attributes:**
- `Area type` - Urban classification
- `Property Access` - Property access adequacy
- `Road AADT` - Annual average daily traffic
- `Road speed limit` - Speed limit
- `Road operating speed (mean)` - Actual speed

---

## Trigger Matching Algorithm

```typescript
// Check if a treatment applies to current segment
const isTreatmentApplicable = (treatment: Treatment, attrs: Record<string, any>): boolean => {
  // No triggers = not applicable
  if (!treatment.triggers || treatment.triggers.length === 0) return false;

  // OR between sets: at least one set must match all conditions
  return treatment.triggers.some(set =>
    // AND within set: all attributes in the set must match
    Object.entries(set).every(([attrName, validValues]) => {
      const attrValue = attrs[attrName];
      // Convert string to number if needed (API returns mixed types)
      const numValue = typeof attrValue === 'string' ? parseInt(attrValue, 10) : attrValue;
      // Check if actual value is in the set of valid values
      return validValues.includes(numValue);
    })
  );
};
```

### Key Points:
1. **Flexible attribute types:** Handles both string and numeric values from API
2. **Set matching:** Uses array membership (`includes()`) for multiple valid values
3. **Short-circuit evaluation:** `some()` and `every()` stop early when result determined
4. **Null safety:** Missing attributes won't cause errors (undefined values fail the check)

---

## Example: How Treatment T2 Gets Recommended

**Scenario:** Coder is surveying a road shoulder with an adjacent busy road 0-1 meter away, but NOT at an intersection.

### Step 1: Coder Enters Data
During the coding phase, the coder observes and enters:
```
Facility Type = 5 (Road Shoulder)
Adjacent Road Lane 0-1m = 1 (Present - hazardous)
Intersection or Road Crossing = 2 (Not present - safe)
Curvature = 2 (No sharp curves)
```

### Step 2: Data is Loaded
When user navigates to Treatment Projection page, the system fetches this segment's attributes:
```typescript
const attrs = {
  "Facility Type": 5,
  "Adjacent Road Lane 0-1m": 1,
  "Intersection or Road Crossing": 2,
  "Curvature": 2,
  // ... other attributes
};
```

### Step 3: Trigger Matching Begins
The system checks Treatment T2: "Safety barrier (Adjacent road 0-1m)"

**T2's trigger definition:**
```typescript
triggers: [
  { "Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Intersection or Road Crossing": [2] },  // Set 1
  { "Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Curvature": [1], "Intersection or Road Crossing": [2] },  // Set 2
  { "Facility Type": [3, 4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Intersection or Road Crossing": [2] },  // Set 3
]
```

### Step 4: Evaluate Trigger Set 1
```typescript
// Check: Does segment match "Set 1"?
// Set 1: { Facility Type: [4,5,6], Adjacent Road Lane 0-1m: [1], Intersection or Road Crossing: [2] }

// Condition 1: Facility Type in [4, 5, 6]?
attrs["Facility Type"] = 5  →  5 in [4, 5, 6]?  ✅ YES

// Condition 2: Adjacent Road Lane 0-1m in [1]?
attrs["Adjacent Road Lane 0-1m"] = 1  →  1 in [1]?  ✅ YES

// Condition 3: Intersection or Road Crossing in [2]?
attrs["Intersection or Road Crossing"] = 2  →  2 in [2]?  ✅ YES

// All 3 conditions passed!  ✅ SET 1 MATCHES
```

### Step 5: Treatment Recommended
Since **at least one trigger set matched** (Set 1), T2 is recommended.

**System displays:**
```
✅ Safety barrier (Adjacent road 0-1m)
   Install protective barrier from immediate adjacent hazards
```

---

## Example: Why T2 Would NOT Be Recommended

**Different Scenario:** Same road shoulder, but now AT an intersection

```typescript
const attrs = {
  "Facility Type": 5,
  "Adjacent Road Lane 0-1m": 1,
  "Intersection or Road Crossing": 1,  // ← CHANGED: Now AT intersection!
  "Curvature": 2,
};
```

### Check Set 1 Again
```typescript
// Condition 3: Intersection or Road Crossing in [2]?
attrs["Intersection or Road Crossing"] = 1  →  1 in [2]?  ❌ NO

// Set 1 FAILS (one condition failed)
```

### Check Set 2
```typescript
// Condition 3: Intersection or Road Crossing in [2]?
attrs["Intersection or Road Crossing"] = 1  →  1 in [2]?  ❌ NO

// Set 2 FAILS (same reason)
```

### Check Set 3
```typescript
// Condition 3: Intersection or Road Crossing in [2]?
attrs["Intersection or Road Crossing"] = 1  →  1 in [2]?  ❌ NO

// Set 3 FAILS (same reason)
```

### Result
```
All trigger sets failed  →  Treatment NOT recommended
```

**Why?** Installing a safety barrier at an intersection is unsafe and ineffective. The trigger requires `[2]` (not at intersection) to prevent this misapplication.

---

## Example: Multiple Valid Paths (T1)

**Scenario 1 - Path A:** Mixed traffic road with no light segregation
```typescript
attrs = {
  "Facility Type": 6,  // Mixed Traffic
  "Light Segregation": 2,  // Not present
  "Number of lanes – adjacent road": 3,
  "Peak pedestrian flow": 1,
};

// Check Set 2: { Type: [6], Light Segregation: [2] }
// Type 6 in [6]? ✅  Light Seg 2 in [2]? ✅
// ✅ SET 2 MATCHES  →  T1 RECOMMENDED
```

**Scenario 2 - Path B:** Sidewalk in busy pedestrian area
```typescript
attrs = {
  "Facility Type": 1,  // Sidewalk
  "Light Segregation": 2,  // Not present
  "Number of lanes – adjacent road": 1,  // Adequate adjacent lanes
  "Peak pedestrian flow": 3,  // High pedestrian traffic
};

// Check Set 3: { Type: [1,2], Adjacent lanes: [1], Ped flow: [3] }
// Type 1 in [1,2]? ✅  Lanes 1 in [1]? ✅  Flow 3 in [3]? ✅
// ✅ SET 3 MATCHES  →  T1 RECOMMENDED
```

**Both different conditions lead to the same recommendation** because they share the same safety goal: improve cycling infrastructure with light segregation.

---

## Example: When Multiple Treatments Apply

**Scenario:** Narrow facility with poor surface and inadequate access

```typescript
attrs = {
  "Facility Width per Direction": 1,  // Very Narrow
  "Loose or slippery surface": 1,  // Present/hazardous
  "Facility access": 2,  // Inadequate
  "Fixed Obstacle on Facility": 1,  // Present
};
```

**Applicable treatments:**
1. **T14: Improve facility access** - Addresses inadequate access
2. **T8: Improve surface conditions** - Fixes loose/slippery surface
3. **T11: Remove fixed obstacles** - Clears the obstacle
4. **T16: Widen the facility** - Expands narrow width

**User can select multiple treatments** to address all issues at once. Each treatment modifies different attributes:
- T14: Sets "Facility access" → 1 (Adequate)
- T8: Sets "Loose or slippery surface" → 2 (Not present)
- T11: Sets "Fixed Obstacle on Facility" → 2 (Not present)
- T16: Sets "Facility Width per Direction" → 3 (Wide)

The system estimates combined score reduction based on total attributes modified.

---

## Score Estimation

When treatments are selected, the system estimates score improvements:

```typescript
// Calculate score reduction based on treatment effects
const affectedAttributeCount = Array.from(selectedTreatments).reduce(
  (count, treatmentId) => {
    const treatment = TREATMENTS.find(t => t.id === treatmentId);
    return count + (treatment ? Object.keys(treatment.effects).length : 0);
  },
  0
);

// 5% reduction per affected attribute, minimum 50% of original
const reductionFactor = Math.max(0.5, 1 - (affectedAttributeCount * 0.05));
const estimatedScore = originalScore * reductionFactor;
```

**Note:** This is a heuristic. Real calculations would use the Excel macro.

---

## Data Flow

```
User selects project
    ↓
Load attributes from API
    ↓
Extract attribute values for current segment
    ↓
Call isTreatmentApplicable() for each treatment
    ↓
Filter to applicable treatments
    ↓
Display recommended treatments in UI
    ↓
User selects treatments
    ↓
Estimate score changes
    ↓
Display before/after scores
```

---

## Testing Treatment Logic

### Manual Test Case 1: Light Segregation Missing
**Condition:** Facility Type = 5 (Road Shoulder), Light Segregation = 2 (Not Present)

**Expected:** T1 (on-road bicycle lane) should be recommended

**Why:** Matches T1 trigger set #1: `{Type: [5], Seg: [2]}`

### Manual Test Case 2: Adjacent Road Hazard
**Condition:** Facility Type = 4, Adjacent Road 0-1m = 1, Intersection = 2 (Not at intersection)

**Expected:** T2 (Safety barrier 0-1m) should be recommended

**Why:** Matches T2 trigger set #1: `{Type: [4-6], Road: [1], Intersection: [2]}`

### Manual Test Case 3: At Intersection (Negative Case)
**Condition:** Facility Type = 4, Adjacent Road 0-1m = 1, Intersection = 1 (At intersection)

**Expected:** T2 should NOT be recommended

**Why:** Intersection value is 1, not 2. Trigger requires `[2]` to exclude intersections.

---

## Extensions & Future Work

### Adding New Treatments
1. Define trigger conditions (from Excel or analysis)
2. Map attributes to application attribute names
3. Add to TREATMENTS array
4. Test with `isTreatmentApplicable()`

### Adding New Attributes
1. Ensure attribute is collected in coding process
2. Get the display name from `global_var.py` constants
3. Reference in trigger definitions
4. Data flows automatically from API

### Improving Score Estimation
Current: Simple 5% per attribute reduction with 50% floor
Options:
- Use Excel macro calculation via API
- Implement attribute-specific impacts
- Weight treatments by priority

---

## References

- **Excel Specification:** CycleRAP - model - generation v2.11 - 24.09.27 - suppliers.xlsm
- **Implementation:** `/frontend/src/pages/TreatmentPage/treatmentDetailPage.tsx` (lines 53-260)
- **Attribute Definitions:** `/backend/app/services/global_var.py` (lines 42-100, 124-189)
- **Treatment Matching:** `isTreatmentApplicable()` function (lines 263-275)

---

## Summary

The treatment system provides evidence-based recommendations for cycling safety improvements by:

1. **Multiple trigger paths per treatment** - Excel defines each treatment with multiple trigger sets (one per column)
2. **OR logic between sets** - A treatment is recommended if ANY trigger set matches the data
3. **AND logic within sets** - All attributes in a trigger set must satisfy their conditions
4. **Using Excel as source of truth** - All 25 treatments with exact trigger definitions from STM sheet
5. **Estimating improvement impacts** - Score reductions based on attributes modified by treatments

All treatments are derived directly from CycleRAP's expert judgment and research.

### How It Works in Practice

```
User codes a facility segment
    ↓
Treatment Projection page loads attributes
    ↓
For each of the 25 treatments:
    └─ Check if ANY trigger set matches:
         ├─ Set 1: All conditions met? → Recommend ✓
         ├─ Set 2: All conditions met? → Recommend ✓
         ├─ Set 3: All conditions met? → Recommend ✓
         └─ Set 4+: ...continue checking
    ↓
Display all applicable treatments
    ↓
User selects treatments and views score improvements
```

This design allows CycleRAP experts to capture complex decision logic: the same treatment can be appropriate under multiple different conditions, not just one simple rule.
