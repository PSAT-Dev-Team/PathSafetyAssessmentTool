## 4. Path Analysis

The Path Analysis page is the multi-project analysis workspace.

---

## Table of Contents

- [4.1 Select Projects](#41-select-projects)
- [4.2 Filter Before Loading](#42-filter-before-loading)
- [4.3 Analyse Loaded Data](#43-analyse-loaded-data)
  - [4.3.1 Attribute Filters (Child Parameters)](#431-attribute-filters-child-parameters)
- [4.4 Export](#44-export)
- [4.5 Session Continuity](#45-session-continuity)

---

### 4.1 Select Projects

You can select one or more projects to analyse together. The search box matches both **project names** and **source road names**, so you can find projects even when the project title and road name differ.

### 4.2 Filter Before Loading

Before loading projects, you can filter by:

| Filter | Description |
|---|---|
| Project or road name | Text search |
| Tag | e.g. NSC, AMK, Pre, Post |
| Date created range | Filter projects created within a date window |
| Last updated range | Filter projects updated within a date window |

### 4.3 Analyse Loaded Data

After loading projects, you can:

- choose **up to five attributes** to focus on
- apply segment-level filters (see child parameters below)
- view attribute distributions and aggregated score-band summaries
- inspect filtered segments on the map and in the table
- click a segment to navigate to the Coding page to make edits
- click **Back to Analysis** to return and continue

#### 4.3.1 Attribute Filters (Child Parameters)

When you select an attribute for analysis, you can drill down further using child filter parameters. The table below lists the attributes that support child-level filtering:

| Parent Attribute | Child Filter Options |
|---|---|
| Facility Type | Sidewalk; Multi-Use Path; Off-Road Bicycle Path; On-road Bicycle Lane; Road Shoulder; Mixed Traffic Road Lane |
| Area Type | Urban/CBD; Suburban; Rural; Industrial; Recreational |
| Adjacent Road Lane 0–1m | Present; Not Present |
| Adjacent Road Lane 1–3m | Present; Not Present |
| Adjacent Vehicle Parking 0–1m | Present; Not Present |
| Adjacent Vehicle Parking 1–3m | Present; Not Present |
| Facility Width per Direction | Very Narrow; Narrow; Wide |
| Flow Direction | One Way; Two Way |
| Grade | < 5 Degrees; ≥ 5 Degrees |
| Curvature | Sharp Turn Present; No Sharp Turn |
| Street Lighting | Present; Not Present |
| Delineation | Present; Not Present |
| Fixed Obstacle on Facility | Present; Not Present |
| Non-Fixed Obstacle on Facility | Present; Not Present |
| Light Segregation | Present; Not Present |
| Intersection or Road Crossing | Present; Not Present |
| Crossing Facility | Present; Not Present |
| Property Access | Present; Not Present |
| Tram or Train Rails | Present; Not Present |
| Peak Pedestrian Flow | None; Low; Moderate to High |
| Peak Bicycle/LV Traffic Flow | Low; Moderate to High |
| Observed Proportion of Cargo Bikes | Low; Moderate to High |
| Heavy Vehicle Flow | Low; Moderate to High |
| Bicycle/LV Speed – Average | < 20 km/h; ≥ 20 km/h |
| Overall Risk Level Band | 1 (Low); 2 (Medium); 3 (High); 4 (Extreme) |

### 4.4 Export

The page supports two main exports:

| Export | Format | Contents |
|---|---|---|
| **Download Table** | CSV | All currently filtered segment rows |
| **Download Images** | ZIP | All images for the currently filtered segments |

### 4.5 Session Continuity

Your selections and filters are kept for the browser session, so navigating away (e.g. to edit a segment in Coding) and returning does not immediately clear the analysis setup.
