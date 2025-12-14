# Treatment Logic Alignment Analysis: Application vs v3

## Summary

Your current treatment implementation in `treatmentDetailPage.tsx` uses **simplified trigger logic** compared to the Excel/v3 specification. The v3 file has **complex, multi-condition triggers** while your implementation has **single trigger sets**.

---

## Detailed Comparison

### Treatment 1: Upgrade to on-road bicycle lane with light segregation

**V3 (Excel) Triggers** (8 trigger sets):
```
1. facility_type: [5], light_segregation: [2], bicycle_flow: [2], speed_unit: [1]
2. facility_type: [6], light_segregation: [2], speed_unit: [1]
3. facility_type: [1, 2], num_lanes_adjacent: [1], pedestrian_flow: [3], speed_unit: [1]
4. facility_type: [1, 2], num_lanes_adjacent: [1], bicycle_flow: [2], speed_unit: [1]
5. facility_type: [5], light_segregation: [2], bicycle_flow: [2], speed_unit: [2]
6. facility_type: [6], light_segregation: [2], speed_unit: [2]
7. facility_type: [1, 2], num_lanes_adjacent: [1], pedestrian_flow: [3], speed_unit: [2]
8. facility_type: [1, 2], num_lanes_adjacent: [1], bicycle_flow: [2], speed_unit: [2]
```

**Your Implementation**:
```
triggers: [{ "Facility Type": [5, 6], "Light Segregation": [2] }]
```

**Issue**: You're missing 7 additional trigger conditions that reference:
- `bicycle_flow` (not in your application data)
- `speed_unit` (not in your application data)
- `num_lanes_adjacent` (not in your application data)
- `pedestrian_flow` (not in your application data)

---

### Treatment 2: Install safety barrier (Adjacent road 0-1m)

**V3 Triggers** (5 sets, requires curvature, heavy_vehicle, speed_unit):
```
1. facility_type: [4, 5, 6], adjacent_road_0_1m: [1], intersection_crossing: [2], heavy_vehicle: [2], speed_unit: [1]
2. facility_type: [4, 5, 6], adjacent_road_0_1m: [1], curvature: [1], intersection_crossing: [2], heavy_vehicle: [2], speed_unit: [1]
3. facility_type: [3, 4, 5, 6], adjacent_road_0_1m: [1], intersection_crossing: [2], speed_unit: [1]
4. facility_type: [4, 5, 6], adjacent_road_0_1m: [1], intersection_crossing: [2], heavy_vehicle: [2], speed_unit: [2]
5. facility_type: [3, 4, 5, 6], adjacent_road_0_1m: [1], intersection_crossing: [2], speed_unit: [2]
```

**Your Implementation**:
```
triggers: [{ "Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1] }]
```

**Issue**: Missing conditions on intersection_crossing, heavy_vehicle, and speed_unit.

---

### Treatment 4: Upgrade to cycling-priority street

**V3 Triggers** (2 sets, requires property_access and speed_unit):
```
1. facility_type: [1, 2, 5, 6], property_access: [1], speed_unit: [1]
2. facility_type: [1, 2, 5, 6], property_access: [1], speed_unit: [2]
```

**Your Implementation**:
```
triggers: [{ "Facility Type": [6], "Light Segregation": [2] }]
```

**Issue**:
- Completely different trigger attributes (uses facility_type [6] only, ignores others)
- Missing property_access check
- Missing speed_unit check
- Also note: V3 outcome is `{ road_speed: 20 }` not `{ facility_access: 1 }`

---

## Missing Attributes in Your Implementation

Your application doesn't have these attributes that v3 requires:

1. **bicycle_flow** - Bicycle traffic volume
2. **speed_unit** - Unit of speed (km/h vs mph)
3. **pedestrian_flow** - Pedestrian traffic volume
4. **num_lanes_adjacent** - Number of adjacent lanes
5. **num_lanes_intersecting** - Number of intersecting lanes
6. **heavy_vehicle** - Presence of heavy vehicles
7. **curvature** - Sharp curves present
8. **property_access** - Property access conditions
9. **cargo_bikes** - Cargo bike presence
10. **intersection_crossing** - Intersection crossing present
11. **grade** - Grade/slope
12. **speed_differential** - Speed differential
13. **road_speed** - Road speed (value, not boolean)
14. **road_aadt** - Annual Average Daily Traffic

---

## Treatment-by-Treatment Analysis

### ✅ Simple Treatments (Your logic is close):
- **T8**: Improve surface conditions - ✅ Correct
- **T10**: Install street lighting - ⚠️ Missing property_access and flow direction checks
- **T11**: Remove fixed obstacles - ⚠️ Missing bicycle_flow and cargo_bikes
- **T12**: Remove non-fixed obstacles - ⚠️ Missing bicycle_flow and cargo_bikes
- **T13**: Remove width restriction - ⚠️ Missing bicycle_flow and cargo_bikes
- **T14**: Improve facility access - ✅ Correct (single condition)
- **T17**: Install protective barrier - ⚠️ Missing adjacent_hazard_1_3m and bicycle_speed conditions
- **T20**: Improve crossing facility - ✅ Correct (checks crossing_facility: [2])
- **T23**: Review tram/train rails - ✅ Correct (checks tram_rails: [1])

### ❌ Complex Treatments (Your logic is significantly simplified):
- **T1**: 8 complex sets with bicycle_flow, speed_unit
- **T2**: 5 sets with curvature, heavy_vehicle, intersection_crossing, speed_unit
- **T3**: 2 sets with intersection_crossing, speed_unit
- **T4**: 2 sets with property_access, speed_unit (your version is wrong)
- **T5**: 1 set with pedestrian_flow, cargo_bikes
- **T6**: 6 sets with num_lanes_adjacent, cargo_bikes, speed_unit
- **T7**: 7 sets with bicycle_flow, cargo_bikes, bicycle_speed, intersection conditions
- **T9**: 4 sets with adjacent_parking_0_1m, flow_direction
- **T15**: 6 sets with bicycle_speed, grade, adjacent hazards
- **T16**: 7 sets with pedestrian_flow, speed_differential, cargo_bikes, parking
- **T18**: 4 sets with adjacent objects, delineation conditions
- **T19**: 5 sets with heavy_vehicle, num_lanes_intersecting, tram_rails
- **T21**: 2 sets with num_lanes_intersecting, speed_unit
- **T22**: 5 sets with bicycle_flow, bicycle_speed, parking conditions
- **T24**: 6 sets with intersection conditions, bicycle_flow
- **T25**: 7 sets with pedestrian_flow, bicycle_flow, grade, cargo_bikes, curvature

---

## Recommendations

### Option 1: Keep Simplified Version (Current Approach)
**Pros**:
- Works with existing application data
- Simpler UI logic
- Faster to calculate

**Cons**:
- Doesn't match Excel/v3 specification
- May recommend treatments that aren't actually applicable
- Not accurate for complex scenarios

### Option 2: Implement Full v3 Logic
**Requires**:
1. Add missing attributes to application:
   - Flow-related: `bicycle_flow`, `pedestrian_flow`, `property_access`
   - Vehicle-related: `heavy_vehicle`, `cargo_bikes`, `speed_differential`
   - Geometry: `grade`, `curvature`, `speed_unit`
   - Intersection: `num_lanes_adjacent`, `num_lanes_intersecting`, `intersection_crossing`
   - Road: `road_speed` (actual value), `road_aadt`

2. Update treatment triggers to match v3 exactly

3. Update UI to handle more complex conditions

### Option 3: Hybrid Approach
Keep simple version but clearly document that it's a **simplified approximation**:
- Use for initial recommendations
- Note that this is a heuristic approach
- Suggest users verify treatments against full v3 spec

---

## Specific Issues by Treatment

### T1: Completely Wrong
Your version only checks `[Facility Type: [5,6], Light Segregation: [2]]`
V3 has 8 complex sets including speed-dependent logic

### T4: Wrong Outcome
Your version uses `Facility access: 1`
V3 uses `road_speed: 20` (not an attribute in your app!)

### T24: Missing Complexity
Your version: `Facility Type: [4], Light Segregation: [2], Adjacent Road: [1]`
V3 adds: intersection approach, intersection crossing, bicycle flow, speed_unit

### T25: Oversimplified
Your version: `Bicycle/LV speed: [2]`
V3 has 7 trigger sets with pedestrian_flow, bicycle_flow, grade, cargo_bikes, curvature, speed_differential

---

## Summary Table

| Treatment | Match Level | Missing Attributes |
|-----------|-------------|-------------------|
| T1 | ❌ Poor | bicycle_flow, speed_unit |
| T2 | ❌ Poor | curvature, heavy_vehicle, intersection_crossing, speed_unit |
| T3 | ⚠️ Partial | intersection_crossing, speed_unit |
| T4 | ❌ Wrong | property_access, speed_unit, wrong outcome |
| T5 | ⚠️ Partial | pedestrian_flow, cargo_bikes |
| T6 | ❌ Poor | num_lanes_adjacent, cargo_bikes, speed_unit |
| T7 | ❌ Poor | bicycle_flow, cargo_bikes, bicycle_speed, intersection_crossing |
| T8 | ✅ Good | - |
| T9 | ⚠️ Partial | adjacent_parking_0_1m, flow_direction |
| T10 | ⚠️ Partial | property_access, flow_direction, intersecting_facility |
| T11 | ⚠️ Partial | bicycle_flow, cargo_bikes |
| T12 | ⚠️ Partial | bicycle_flow, cargo_bikes |
| T13 | ⚠️ Partial | bicycle_flow, cargo_bikes |
| T14 | ✅ Good | - |
| T15 | ❌ Poor | bicycle_speed, grade, adjacent_hazard_1_3m, adjacent_objects |
| T16 | ❌ Poor | Multiple missing |
| T17 | ⚠️ Partial | adjacent_hazard_1_3m, bicycle_speed |
| T18 | ⚠️ Partial | adjacent_objects, flow_direction |
| T19 | ⚠️ Partial | heavy_vehicle, num_lanes |
| T20 | ✅ Good | - |
| T21 | ⚠️ Partial | num_lanes_intersecting, speed_unit |
| T22 | ⚠️ Partial | Multiple missing |
| T23 | ✅ Good | - |
| T24 | ⚠️ Partial | intersection conditions, bicycle_flow |
| T25 | ❌ Poor | Multiple missing |

**Score**: 5/25 treatments correctly match v3 (20%)

---

## Next Steps

Would you like me to:
1. Update treatments to use full v3 logic (requires adding attributes to application)
2. Document current approach as "simplified approximation"
3. Create a mapping table between v3 and your application attributes
4. Implement a subset of the most important trigger conditions

