## 5. Path Analysis

The Path Analysis page is the multi-project analysis workspace.

---

## Table of Contents

- [5.1 Select Projects](#51-select-projects)
- [5.2 Filter Before Loading](#52-filter-before-loading)
- [5.3 Analyse Loaded Data](#53-analyse-loaded-data)
  - [5.3.1 Attribute Filters and Finer Filtering](#531-attribute-filters-and-finer-filtering)
  - [5.3.2 Finer Filtering — Sub-category Options](#532-finer-filtering--sub-category-options)
- [5.4 Export](#54-export)
- [5.5 Session Continuity](#55-session-continuity)

---

### 5.1 Select Projects

You can select one or more projects to analyse together. The search box matches both **project names** and **source road names**, so you can find projects even when the project title and road name differ.

### 5.2 Filter Before Loading

Before loading projects, you can filter by:

| Filter | Description |
|---|---|
| Project or road name | Text search |
| Tag | e.g. NSC, AMK, Pre, Post |
| Date created range | Filter projects created within a date window |
| Last updated range | Filter projects updated within a date window |

### 5.3 Analyse Loaded Data

After loading projects, you can:

- choose **up to five attributes** to focus on
- apply segment-level filters (see sections below)
- view attribute distributions and aggregated score-band summaries
- inspect filtered segments on the map and in the table
- click a segment to navigate to the Coding page to make edits
- click **Back to Analysis** to return and continue

#### 5.3.1 Attribute Filters and Finer Filtering

When you select an attribute for analysis, you can filter segments by its coded values. Attributes marked **❖** also support **finer filtering** — selecting a specific value (e.g. *Present* for Fixed Obstacle on Facility) reveals a secondary sub-category dropdown so you can pinpoint exact sub-types. The map updates to show distinct colours for each sub-category once a sub-type is selected.

| Attribute | Filter Values | Finer Filter Sub-categories (❖ = available) |
|---|---|---|
| Facility Type | Sidewalk; Multi-Use Path; Off-Road Bicycle Path; On-road Bicycle Lane; Road Shoulder; Mixed Traffic Road Lane | — |
| Area Type | Urban/CBD; Suburban; Rural; Industrial; Recreational | — |
| Adjacent Road Lane 0–1m | Present; Not Present | — |
| Adjacent Road Lane 1–3m | Present; Not Present | — |
| Adjacent Vehicle Parking 0–1m | Present; Not Present | — |
| Adjacent Vehicle Parking 1–3m | Present; Not Present | — |
| Facility Width per Direction **❖** | Very Narrow; Narrow; Wide | Very Narrow: ≤1.5m; >1.5–1.8m; >1.8–<2m · Narrow: 2–<3.5m; 3.5–4m · Wide: >4m |
| Flow Direction | One Way; Two Way | — |
| Grade | ≤2% (1:25); 2.9% (1:20); 3.8% (1:15); 4.7% (1:12); ≥5% | — |
| Curvature **❖** | Sharp Turn Present; No Sharp Turn Present | Sharp Turn: <6.5m; 6.5–<10m; Path Junction · No Sharp Turn: 10–18m; >18m |
| Street Lighting | Present; Not Present | — |
| Delineation **❖** | Present; Not Present | When "Present": Cycling Path; Red Stripe; Signalised Crossing; Traffic Crossing; Zebra Crossing |
| Fixed Obstacle on Facility **❖** | Present; Not Present | When "Present": Lamp Post; Traffic Light; Pillar; Bollards; Fence; Vegetation; Others |
| Non-Fixed Obstacle on Facility **❖** | Present; Not Present | When "Present": Barrier; Bins; Bicycle; Cone; Others |
| Light Segregation | Present; Not Present | — |
| Intersection or Road Crossing | Present; Not Present | — |
| Crossing Facility **❖** | Present; Not Present | When "Present": Zebra Crossing; Signalised PC; Bicycle Crossing; Unsignalised Junction; Development Access |
| Property Access | Present; Not Present | — |
| Tram or Train Rails | Present; Not Present | — |
| Major Surface Deformation or Drain Opening | Present; Not Present | — |
| Peak Pedestrian Flow | None; Low; Moderate to High | — |
| Peak Bicycle/LV Traffic Flow | Low; Moderate to High | — |
| Observed Proportion of Cargo Bikes | Low; Moderate to High | — |
| Heavy Vehicle Flow | Low; Moderate to High | — |
| Bicycle/LV Speed – Average | < 20 km/h; ≥ 20 km/h | — |
| Road Speed Limit | NA; 30 km/h; 40 km/h; 50 km/h; 60 km/h; 70 km/h; 80 km/h; 90 km/h | — |
| Overall Risk Level Band | 1 (Low); 2 (Medium); 3 (High); 4 (Extreme) | — |

#### 5.3.2 Finer Filtering — Sub-category Options

Selecting a top-level filter value for any attribute marked **❖** reveals a secondary sub-category dropdown. Each sub-category is shown with a distinct colour on the map.

| Attribute | Trigger Value | Sub-category Options |
|---|---|---|
| Facility Width per Direction | Very Narrow | ≤1.5 m; >1.5–1.8 m; >1.8–<2 m |
| Facility Width per Direction | Narrow | 2–<3.5 m; 3.5–4 m |
| Facility Width per Direction | Wide | >4 m |
| Curvature | Sharp Turn Present | <6.5 m (footpath threshold); 6.5–<10 m; Path Junction |
| Curvature | No Sharp Turn Present | 10–18 m; >18 m (cycling path threshold ≥18 m) |
| Fixed Obstacle on Facility | Present | Lamp Post; Traffic Light; Pillar; Bollards; Fence; Vegetation; Others |
| Non-Fixed Obstacle on Facility | Present | Barrier; Bins; Bicycle; Cone; Others |
| Delineation | Present | Cycling Path; Red Stripe; Signalised Crossing; Traffic Crossing; Zebra Crossing |
| Crossing Facility | Present | Zebra Crossing; Signalised PC; Bicycle Crossing; Unsignalised Junction; Development Access |

**How to use finer filtering:**

1. In the Filter panel, select an attribute that supports finer filtering (marked **❖**).
2. Choose a top-level value (e.g. *Present* for Fixed Obstacle on Facility).
3. A second dropdown appears — select the specific sub-type you want to highlight.
4. The map immediately updates to colour only segments matching that sub-type.
5. To adjust or clear the sub-filter, click the **×** on the active sub-category chip, or change the top-level value.

> **If the finer filtering colours are not appearing correctly on the map**, it is likely because the source attribute was coded incorrectly for some segments. To fix this:
>
> 1. Click the affected segment on the map to open it in the Coding page.
> 2. Review and correct the attribute value (e.g. change the sub-type for Fixed Obstacle Type).
> 3. Save the segment, then click **Back to Analysis** to return.
> 4. Re-apply the filter — the updated colour will now be reflected on the map.

### 5.4 Export

The page supports three exports:

| Export | Format | Contents |
|---|---|---|
| **Download Table** | CSV | All currently filtered segment rows |
| **Download Images** | ZIP | All images for the currently filtered segments |
| **Download Shapefile** | ZIP (Shapefile) | Filtered segments exported as point geometry with attributes |

**Download Shapefile** exports the currently visible filtered segments as a standard GIS shapefile package (`.zip`). The file is named `shapefile_export_YYYY-MM-DD.zip` and can be opened in QGIS, ArcGIS, or any other GIS application. Only segments that have a valid image reference are included.

### 5.5 Session Continuity

Your selections and filters are kept for the browser session, so navigating away (e.g. to edit a segment in Coding) and returning does not immediately clear the analysis setup.
