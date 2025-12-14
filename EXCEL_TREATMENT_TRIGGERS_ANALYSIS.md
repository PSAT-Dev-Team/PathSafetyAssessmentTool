# Treatment Triggers: Excel vs Your Implementation

## Key Finding

The Excel sheet **DOES have complex triggers**, but they include attributes your application doesn't collect:
- `Number of lanes – adjacent road` (Treatment 1, Set 3+)
- `Peak pedestrian flow along or across facility` (Treatment 1, Set 3+)
- `Property access` (Treatment 4-5)
- `Curvature` (Treatment 2, Set 2)
- `Intersection or road crossing` (Treatment 2-3)

---

## Treatment-by-Treatment Comparison

### Treatment 1: Upgrade to on-road bicycle lane with light segregation

**Excel has 8 trigger sets:**

1. ✅ Facility Type = [5], Light Segregation = [2]
2. ✅ Facility Type = [6], Light Segregation = [2]
3. ❌ Facility Type = [1,2], Adjacent Lanes = [1], Pedestrian Flow = [3]
4. ❌ Facility Type = [1,2], Adjacent Lanes = [1]
5. ✅ Facility Type = [5], Light Segregation = [2]
6. ✅ Facility Type = [6], Light Segregation = [2]
7. ❌ Facility Type = [1,2], Adjacent Lanes = [1], Pedestrian Flow = [3]
8. ❌ Facility Type = [1,2], Adjacent Lanes = [1]

**Your Implementation:**
```
triggers: [{ "Facility Type": [5, 6], "Light Segregation": [2] }]
```

**Assessment:** ⚠️ **Simplified** - You only implemented sets 1+2+5+6, missing sets 3,4,7,8 which require attributes you don't have

**Status:**
- ✅ Your version works for cases where light segregation is missing
- ❌ Misses opportunities when pedestrian flow is high but light segregation is present

---

### Treatment 2: Safety barrier (Adjacent road 0-1m)

**Excel has 5 trigger sets:**

1. Facility Type = [4,5,6], Adjacent Road 0-1m = [1], **Intersection Crossing = [2]** ❌
2. Facility Type = [4,5,6], Adjacent Road 0-1m = [1], **Curvature = [1]**, **Intersection Crossing = [2]** ❌
3. Facility Type = [3,4,5,6], Adjacent Road 0-1m = [1], **Intersection Crossing = [2]** ❌
4. Facility Type = [4,5,6], Adjacent Road 0-1m = [1], **Intersection Crossing = [2]** ❌
5. Facility Type = [3,4,5,6], Adjacent Road 0-1m = [1], **Intersection Crossing = [2]** ❌

**Your Implementation:**
```
triggers: [{ "Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1] }]
```

**Assessment:** ❌ **Very Simplified** - Excel requires `Intersection Crossing = [2]` (NOT present as a crossing) which you don't check

**Problem:** Your version will recommend treatment even at intersections, where it may not apply

---

### Treatment 3: Safety barrier (Adjacent road 1-3m)

**Excel has 2 trigger sets:**

1. Facility Type = [4,5,6], Adjacent Road 1-3m = [1], **Intersection Crossing = [2]** ❌
2. Facility Type = [4,5,6], Adjacent Road 1-3m = [1], **Intersection Crossing = [2]** ❌

**Your Implementation:**
```
triggers: [{ "Facility Type": [4, 5, 6], "Adjacent Road Lane 1-3m": [1] }]
```

**Assessment:** ❌ **Missing critical condition** - Always recommends at adjacent roads 1-3m, but Excel requires non-intersection locations

---

### Treatment 4: Cycling-priority street

**Excel has 1 trigger set:**
- Facility Type = [1,2,5,6], **Property Access = [1]** ❌

**Your Implementation:**
```
triggers: [{ "Facility Type": [6], "Light Segregation": [2] }]
```

**Assessment:** ❌ **Completely Different**
- Excel: Check property access + multiple facility types
- Yours: Only checks type 6 + light segregation
- This is wrong!

---

### Treatment 8: Improve surface conditions

**Excel:** Loose/Slippery Surface = [1]

**Your Implementation:**
```
triggers: [{ "Loose or slippery surface": [1] }]
```

**Assessment:** ✅ **Correct Match**

---

### Treatment 9: Install light segregation

**Excel:** Light Segregation = [2] (only 1 simple trigger)

**Your Implementation:**
```
triggers: [{ "Light Segregation": [2] }]
```

**Assessment:** ✅ **Correct Match**

---

## Summary of Issues

| Treatment | Issue | Impact |
|-----------|-------|--------|
| T1 | Missing 4 complex trigger sets | Misses pedestrian flow scenarios |
| T2 | Missing intersection crossing check | May recommend at wrong locations |
| T3 | Missing intersection crossing check | Always recommends (should exclude intersections) |
| T4 | **Completely wrong triggers** | ❌ CRITICAL |
| T5 | **Completely wrong triggers** | ❌ CRITICAL |
| T8 | ✅ Correct | |
| T9 | ✅ Correct | |

---

## Attributes NOT in Your Application

The Excel triggers reference these attributes **you don't collect:**

1. **Number of lanes – adjacent road** - Used in T1, T6
2. **Peak pedestrian flow** - Used in T1, T16, T25
3. **Property access** - Used in T4, T5, T10, T19
4. **Curvature** - Used in T2, T15, T19, T25
5. **Intersection or road crossing** - Used in T2, T3, T7, T19, T21, T24, T25
6. **Intersection approach** - Used in T19, T24, T25
7. **Bicycle flow** - Used in T1, T7, T9, T11, T12, T13, T16, T22, T24, T25
8. **Bicycle speed** - Used in T7, T11, T12, T15, T16, T22, T25
9. **Cargo bikes** - Used in T6, T7, T11, T12, T13, T16
10. **Speed differential** - Used in T16
11. **Heavy vehicle** - Mentioned in v3
12. **Adjacent crossing facility** - Used in T7
13. **Pedestrian crossing** - Used in T10, T25

---

## Recommendation

### Your Current Approach is PRAGMATIC but INACCURATE

**What to do:**

**Option 1: Fix Critical Issues** (Recommended)
- Fix T4 and T5 triggers to match Excel
- These are currently completely wrong and misleading

**Option 2: Keep Current (Document Limitations)**
- Add a note: "Treatment recommendations are simplified approximations"
- Use for screening only, not final decisions

**Option 3: Add Missing Attributes**
- Extend data collection to include intersection crossing, property access, curvature
- These would cover most of the major trigger differences

---

## Critical Fixes Needed

### Treatment 4 & 5: "Cycling-priority street"

**Excel says:**
```
Facility Type = [1, 2, 5, 6]
AND Property access = [1] (Adequate)
```

**Your code says:**
```
Facility Type = [6] (Mixed traffic only)
AND Light Segregation = [2] (Not present)
```

**This is backwards!** Your version requires specific conditions that Excel doesn't, and misses the property access requirement.

### Fix for T4:
```typescript
{
  id: 4,
  name: "Upgrade to cycling-priority street",
  triggers: [
    { "Facility Type": [1, 2, 5, 6], "Facility access": [2] }  // Excel says property access = 1 (adequate)
  ],
  effects: { "Facility access": 1 },
}
```

Would you like me to:
1. List all 25 treatments from Excel with their correct triggers?
2. Update your treatment definitions to match Excel exactly?
3. Continue with the simplified version but document the differences?

