# Treatment Outcomes from Excel (STM Sheet)

## Excel-Defined Outcomes (What Changes After Treatment)

| ID | Treatment Name | Outcome 1 | Outcome 2 | Outcome 3 |
|----|---|---|---|---|
| 1 | Upgrade to on-road bicycle lane with light segregation | Facility type → On-road bicycle lane | Light segregation → Present | Facility access → Adequate |
| 2 | Safety barrier (Adjacent road 0-1m) | Adjacent road 0-1m → Not present | Facility access → Adequate | - |
| 3 | Safety barrier (Adjacent road 1-3m) | Adjacent road 1-3m → Not present | Facility access → Adequate | - |
| 4 | Cycling-priority street (km/h) | Road operating speed → 20 km/h | Facility access → Adequate | - |
| 5 | Cycling-priority street (mph) | Road operating speed → 12 mph | Facility access → Adequate | - |
| 6 | Multi-use path | Facility type → Multi-use path | Facility width per direction → Wide | Facility access → Adequate |
| 7 | Off-road bicycle path | Facility type → Off-road bicycle path | Facility access → Adequate | - |
| 8 | One-way bicycle facility | Flow direction → One way | Facility access → Adequate | - |
| 9 | Improve surface conditions | Loose/slippery surface → Not present | - | - |
| 10 | Install light segregation | Light segregation → Present | - | - |
| 11 | Install lighting | Street lighting → Present | - | - |
| 12 | Remove fixed obstacle | Fixed obstacle → Not present | - | - |
| 13 | Remove non-fixed obstacle | Non-fixed obstacle → Not present | - | - |
| 14 | Remove width restriction | Width restriction → Not present | - | - |
| 15 | Improve facility access | Facility access → Adequate | - | - |
| 16 | Redesign the curve | Curvature → No sharp turn present | - | - |
| 17 | Widen the facility | Facility width per direction → Wide | - | - |
| 18 | Install protective barrier | Adjacent severe hazard 0-1m → Not present | - | - |
| 19 | Improve delineation | Delineation → Present | - | - |
| 20 | Review intersection approach | Intersection approach → Separate/NA | - | - |
| 21 | Improve crossing design | Crossing facility → Present/NA | - | - |
| 22 | Evaluate grade separation | Intersection/road crossing → Not present | - | - |
| 23 | Reconfigure parking | Adjacent vehicle parking 0-1m → Not present | - | - |
| 24 | Review train/tram rails | Tram/train rails → Not present | - | - |
| 25 | Install traffic calming (km/h) | Road operating speed → 30 km/h | - | - |

## Key Observations:

### 1. **Excel DOES NOT specify trigger conditions**
The Excel sheet only specifies what attributes change AFTER treatment is applied, not WHEN to recommend the treatment.

### 2. **Your Application Uses Simplified Triggers**
Your current implementation defines:
```
Treatment 1: triggers when { Facility Type: [5, 6], Light Segregation: [2] }
```

This is reasonable because:
- It checks if the attribute needs improvement (Light Segregation [2] = "Not present")
- It checks relevant facility types

### 3. **V3 File Has Complex Triggers**
The v3 javascript file (cyclerap_accurate_v3.jsx) has complex multi-condition triggers that include attributes NOT in the Excel or your application:
- `speed_unit`, `bicycle_flow`, `pedestrian_flow`
- `property_access`, `cargo_bikes`, `heavy_vehicle`
- `num_lanes_adjacent`, `num_lanes_intersecting`

### 4. **Your Outcomes vs Excel Outcomes**

**YOUR Implementation:**
- Treatment 1: `effects: { "Facility Type": 4, "Light Segregation": 1, "Facility access": 1 }`
- This matches Excel outcome changes

**EXCEL Definition:**
- Treatment 1: `Facility type → On-road bicycle lane, Light segregation → Present, Facility access → Adequate`
- Numeric codes match (4 = On-road bicycle lane, 1 = Present, 1 = Adequate)

## Conclusion:

✅ **Your outcomes/effects are CORRECT** - they match the Excel sheet

⚠️ **Your triggers are SIMPLIFIED** - they don't match v3, but v3's triggers reference attributes that don't exist in your application

### Recommendation:

Your current trigger logic is **reasonable and practical**. It:
1. Uses only attributes available in your application data
2. Checks if the attribute needs improvement (looking for problematic values)
3. Checks relevant facility types where applicable
4. Produces correct outcomes that match Excel

The simplified approach is fine for your use case. You're not implementing the full v3 complexity, which would require:
- Adding 14+ new attributes to your data collection
- Modifying your application workflow significantly
- Handling speed unit conversions

Keep your current implementation as-is. It's a **pragmatic simplification** that works with your data model.

