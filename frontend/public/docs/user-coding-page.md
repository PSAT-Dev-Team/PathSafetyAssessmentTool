## 2. Coding Page

The Coding page is the main review workspace. It can open one or more selected projects in a combined session.

### Main layout

The page keeps three views in sync:

- the current segment image
- the attributes table
- the segment map

Selecting a segment in one area updates the others.

### Auto-code options

PSAT supports several auto-code paths:

- CV auto-code from the image
- GIS auto-code from the segment geometry
- bulk auto-code across selected rows or the full project
- per-attribute auto-code in workflows that target only certain fields

Autocode updates are tracked, and the Segments Autocoded counter is updated in the project metadata.

### Manual review

You can override any coded value directly in the table. The page also shows:

- score updates for the selected segment
- a validation summary comparing current rows against the stored baseline
- field-source provenance for auto-coded changes

### Details and GIS context

For supported attributes, the page can show extra spatial detail such as:

- nearby GIS layers around the current segment
- curvature visualization
- width visualization
- grade or gradient details when profile data is available

### Save and progress tracking

After review:

- save your attribute edits to persist them and recalculate scores
- update the Segments Verified counter as you complete manual checks
