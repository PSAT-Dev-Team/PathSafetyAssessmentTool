# Attribute Derivation Logic

This document explains, in plain terms, how each of the 12 CycleRAP attribute values is determined for a given image.

---

## How It Works — The Big Picture

Every image is analysed by a segmentation model that identifies what surface types are visible and where they appear. Based on what the model detects — and *where in the frame it detects it* — the image is assigned a set of attributes describing the type of facility and its surrounding environment.

The logic works as a **cascade**: a base set of default values is first applied, then a series of conditions are checked in order. Each condition that is met **overrides** the values set by the previous step. The last condition to fire wins.

---

## The Cascade — Step by Step

### Step 1 — Default (Sidewalk)

All images start with these values. If none of the conditions below are triggered, the image keeps these defaults.

| Attribute | Default Value |
|---|---|
| Facility Type | Sidewalk |
| Light Segregation | Present |
| Delineation | Not Present |
| Adjacent Road Lane 0-1m | *(see Adjacent Road Logic below)* |
| Adjacent Road Lane 1-3m | *(see Adjacent Road Logic below)* |
| Adjacent Object/Level Change 0-1m | Same as Adjacent Road Lane 0-1m |
| Adjacent Object/Level Change 1-3m | Same as Adjacent Road Lane 1-3m |
| Adjacent Sidewalk 0-1m | Present |
| Crossing Facility | Not Present |
| Peak Pedestrian Flow | Low |
| Intersection/Road Crossing | Not Present |
| No of Lanes on Intersecting Road | 1 per direction |

---

### Step 2 — Cycling Path Surface Detected

**Trigger:** The model detects a Cycling Path or Wet Cycling Path surface anywhere in the **bottom 20%** of the image.

**Why the bottom 20%?** The bottom of the frame shows the surface immediately underfoot — what the user is actually riding or walking on. Detecting a cycling surface there confirms the facility type.

**What changes:**

| Attribute | Value |
|---|---|
| Facility Type | Off-Road Bicycle Path |
| Delineation | Present |
| *(all others)* | Unchanged from Step 1 |

---

### Step 3 — Red Stripe Surface Detected

**Trigger:** The model detects a Red Stripe or Wet Red Stripe surface anywhere in the **bottom 20%** of the image.

**Why red stripe?** Red stripe markings are used in Singapore to designate shared multi-use paths (pedestrian and cyclist).

**What changes:**

| Attribute | Value |
|---|---|
| Facility Type | Multi-Use Path |
| Delineation | Present |
| *(all others)* | Unchanged from Step 1 |

---

### Step 4 — Traffic Crossing Dominates the Foreground

**Trigger:** Traffic Crossing markings (painted signal-controlled crossing lines) cover **80% or more** of the **bottom 10%** of the image.

**Why 80% of the bottom 10%?** When the camera is positioned directly on a crossing, the crossing surface will dominate the immediate foreground almost entirely. A high threshold prevents false positives from crossings that are only partially visible at the edge of the frame.

**What changes:**

| Attribute | Value |
|---|---|
| Facility Type | Mixed Traffic Road Lane |
| Light Segregation | Present |
| Delineation | Present |
| Adjacent Road Lane 0-1m | Present |
| Adjacent Road Lane 1-3m | Not Present |
| Adjacent Object/Level Change 0-1m | Not Present |
| Adjacent Object/Level Change 1-3m | Not Present |
| Adjacent Sidewalk 0-1m | Not Present |
| Crossing Facility | Present |
| Intersection/Road Crossing | Present |
| No of Lanes on Intersecting Road | **>1 per direction** |

---

### Step 5 — Zebra Crossing Dominates the Foreground

**Trigger:** Zebra Crossing markings cover **80% or more** of the **bottom 10%** of the image.

**Nearly identical to Step 4**, with one difference: a zebra crossing typically marks a simpler, single-lane road junction rather than a multi-lane signalised intersection.

**What changes (compared to Step 4):**

| Attribute | Value |
|---|---|
| *(same as Step 4 in all attributes)* | — |
| No of Lanes on Intersecting Road | **1 per direction** ← only difference |

---

### Step 6 — Road Surface Dominates the Foreground

**Trigger:** Road surface pixels cover **80% or more** of the **bottom 10%** of the image.

**What this means:** The camera is positioned on an open road lane with no dedicated crossing markings. This is the highest-priority condition — if the bottom of the frame is almost entirely road, it overrides everything else.

**What changes:**

| Attribute | Value |
|---|---|
| Facility Type | Mixed Traffic Road Lane |
| Light Segregation | **Not Present** |
| Delineation | **Not Present** |
| Adjacent Road Lane 0-1m | Present |
| Adjacent Road Lane 1-3m | Not Present |
| Adjacent Object/Level Change 0-1m | Not Present |
| Adjacent Object/Level Change 1-3m | Not Present |
| Adjacent Sidewalk 0-1m | Not Present |
| Crossing Facility | Not Present |
| Intersection/Road Crossing | Not Present |
| No of Lanes on Intersecting Road | >1 per direction |

---

## Adjacent Road Lane Logic

The two adjacent road lane attributes (`0-1m` and `1-3m`) are determined separately using their own two-stage logic. This logic runs once per image and feeds into Steps 1, 2, and 3 (Steps 4–6 override these with fixed values).

### Stage 1 — Immediate Foreground Check

The bottom 20% of the image is inspected. If road pixels make up **75% or more** of that region, or if **any** crossing marking is present there, a road lane is considered to be within 0–1 m of the facility.

> **Result:** Adjacent Road Lane 0-1m = Present, 1-3m = Not Present

### Stage 2 — Side-of-Frame Check

If Stage 1 does not trigger, the image is split down the middle (left half vs. right half) and the proportion of road pixels is measured on each side. The larger of the two ratios determines the outcome:

| Road/Crossing Pixel Ratio (larger side) | Result |
|---|---|
| More than 7% | Adjacent Road Lane 0-1m = **Present**, 1-3m = Not Present |
| Between 5% and 7% | Adjacent Road Lane 0-1m = Not Present, 1-3m = **Present** |
| Less than 5% | Adjacent Road Lane 0-1m = Not Present, 1-3m = Not Present |

**Intuition:** A road running alongside the path at close range (0–1 m) will produce a large proportion of road pixels on one side of the frame. A road further away (1–3 m) produces a smaller proportion. Very little road visible on either side means no adjacent road lane.

---

## Adjacent Object / Level Change

These two attributes are **not independently assessed**. They are set to mirror the adjacent road lane result:

- **Adjacent Object/Level Change 0-1m** = same value as Adjacent Road Lane 0-1m
- **Adjacent Object/Level Change 1-3m** = same value as Adjacent Road Lane 1-3m

The rationale is that an adjacent road lane and an adjacent object/level change (e.g. a kerb or barrier) are treated as co-occurring — if there is a road lane at a given distance, there is assumed to be a level change or object marking that boundary.

When the facility is a Mixed Traffic Road Lane (Steps 4, 5, 6), both Adjacent Object attributes are set to **Not Present** unconditionally, since the camera is on the road itself.

---

## Summary Table — What Each Condition Changes

|  | Step 1 Default | Step 2 Cycling | Step 3 Red Stripe | Step 4 Traffic Crossing | Step 5 Zebra Crossing | Step 6 Road |
|---|---|---|---|---|---|---|
| **Facility Type** | Sidewalk | Off-Road Bicycle Path | Multi-Use Path | Mixed Traffic Road Lane | Mixed Traffic Road Lane | Mixed Traffic Road Lane |
| **Light Segregation** | Present | Present | Present | Present | Present | **Not Present** |
| **Delineation** | Not Present | **Present** | **Present** | **Present** | **Present** | Not Present |
| **Adj Road 0-1m** | adjroad logic | adjroad logic | adjroad logic | **Present** | **Present** | **Present** |
| **Adj Road 1-3m** | adjroad logic | adjroad logic | adjroad logic | **Not Present** | **Not Present** | **Not Present** |
| **Adj Object 0-1m** | mirrors 0-1m | mirrors 0-1m | mirrors 0-1m | **Not Present** | **Not Present** | **Not Present** |
| **Adj Object 1-3m** | mirrors 1-3m | mirrors 1-3m | mirrors 1-3m | **Not Present** | **Not Present** | **Not Present** |
| **Adj Sidewalk 0-1m** | Present | Present | Present | **Not Present** | **Not Present** | **Not Present** |
| **Crossing Facility** | Not Present | Not Present | Not Present | **Present** | **Present** | Not Present |
| **Peak Ped Flow** | Low | Low | Low | Low | Low | Low |
| **Intersection** | Not Present | Not Present | Not Present | **Present** | **Present** | Not Present |
| **Lanes Intersecting** | 1 per dir | 1 per dir | 1 per dir | **>1 per dir** | **1 per dir** | **>1 per dir** |
