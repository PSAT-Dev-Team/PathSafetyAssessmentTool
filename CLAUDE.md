# CLAUDE.md - PathSafetyAssessmentTool

## Standard Protocols

- **Read actions (Grep, Glob, Read, Bash reads):** Execute without asking for permission — never prompt the user before reading files or searching the codebase.

## Project Overview
Path Safety Assessment Tool for LTA - a React + Python (Flask) application for analyzing cycling path safety using CycleRAP methodology.

## Architecture
- **Frontend:** React + TypeScript + Chakra UI + Leaflet maps
- **Backend:** Python Flask API
- **Key pages:** CodingPage (attribute coding), PathAnalysisPage (multi-project analysis), TreatmentPage (treatment application), GisLayersPage

## Key Patterns & Gotchas

### Multi-Project Index Mapping
- When multiple projects are loaded, segments are aggregated into global arrays (`attrs`, `geoFeatures`, `scores`)
- `projectMap` tracks each project's `startIndex` and `count` in the global arrays
- `resolveIndex(globalIndex)` maps global → `{ projectName, localIndex }`

### PathAnalysisPage: Project Selection Honors Reselection (2026-04-29)

**Symptom:** After loading multiple projects in PathAnalysisPage, navigating back to the Projects page and reselecting a different subset, the page still loaded **all** projects from the backend instead of only the reselected ones.

**Root cause:** `pathAnalysisPage.tsx` had a mount-time `useEffect` that unconditionally called `fetchProjectList()` and set `loadedProjects` to every project. The session storage key `pathAnalysis_loadedProjects` set by `projects.tsx::loadPathAnalysis()` was completely ignored.

**Fix:** Initialize `loadedProjects` state from `loadState("loadedProjects", [])` (which reads `pathAnalysis_loadedProjects` via the `SESSION_KEY_PREFIX`). Only fall back to `fetchProjectList()` when session storage is empty (e.g. user navigates directly to `/analysis/path` without going through the projects page).

**Key files:**

- `frontend/src/pages/PathAnalysisPage/pathAnalysisPage.tsx` — `useState` initializer + fallback `useEffect`
- `frontend/src/pages/Projects/projects.tsx` — `loadPathAnalysis()` writes `pathAnalysis_loadedProjects` (always overwrites, so each reselection refreshes the value)

### Chakra UI Dialog: Blocking Interaction After Close

**Symptom:** After closing a `Dialog` (e.g. EditProjectModal), the page beneath becomes unresponsive — mouse wheel scroll and clicks on rows are blocked. Only the native scrollbar thumb drag still works.

#### Root cause (fully traced through library source)

**Architecture:**
- `Dialog.Backdrop` is `position: fixed`, `100dvw × 100dvh`, stays in DOM during close animation
- `@zag-js/presence` only removes overlay DOM nodes after `animationend` fires. During animation, the backdrop remains with `pointer-events: auto` (browser default)
- `Dialog.Positioner` has `pointer-events: none` via Zag's inline style when closed AND is immediately removed from DOM (its presence machine has no node → `animationName = "none"` → immediate UNMOUNT). **Positioner is not the blocking element.**
- The **backdrop** is the blocking element during the close animation (~200–300 ms)

**Why CSS class selectors failed (Attempt 3):**
The previous fix used:
```css
.chakra-dialog__backdrop[data-state="closed"] { pointer-events: none; }
.chakra-dialog__positioner[data-state="closed"] { pointer-events: none; }
```
The positioner rule matched **nothing** — `getPositionerProps()` does not set `data-state` (confirmed in `@zag-js/dialog/dist/dialog.connect.js` line 75–84). The backdrop rule *should* work (`.chakra-dialog__backdrop` IS applied via `classNameMap["backdrop"] = \`${config.className}__${slot}\`` in `sva.cjs`), but may have been overridden or did not reliably prevent the block.

**Why `unmountOnExit` alone failed (Attempt 2):**
`unmountOnExit: true` is already Chakra's **default** (set in `dialog.cjs` line 24: `defaultProps: { unmountOnExit: true, lazyMount: true }`). So adding it explicitly was a no-op. And even if it weren't, unmountOnExit only removes the DOM after `animationend` — it can't prevent the block during the animation.

**Why `setTimeout` failed (Attempt 1):**
Races with the animation. Doesn't affect pointer-events. Doesn't touch Zag presence cleanup.

#### Correct fix (Updated)

**Why the CSS fix alone was insufficient:** While removing pointer events from the backdrop solved some issues, Zag.js/Chakra UI actively places a `data-scroll-locked` attribute and inline `pointer-events: none` directly on the `<html>` and `<body>` tags. If the modal's `open` state becomes `false` simultaneously with a heavy parent state update (e.g., updating the project list which triggers a re-render), the modal may unmount or lose its internal cleanup sequence before it restores these tags.

**JS Cleanup Workaround:**
To reliably prevent the entire app from permanently freezing, explicitly clean up the `html` and `body` tag scroll locks using a `useEffect` hook with a delayed `setTimeout` whenever the modal closes (`open === false`):

```tsx
  useEffect(() => {
    if (!open) {
      // Force cleanup of pointer-events lock caused by Chakra UI Dialog bugs
      setTimeout(() => {
        document.body.style.pointerEvents = "auto";
        document.documentElement.style.pointerEvents = "auto";
        document.body.removeAttribute("data-scroll-locked");
        document.documentElement.removeAttribute("data-scroll-locked");
      }, 400);
    }
  }, [open]);
```

**Key files:** `frontend/src/pages/Projects/components/EditProjectModal.tsx`, `frontend/src/pages/PathAnalysisPage/components/AddSegmentsDialog.tsx`

#### Quick lookup: what attribute each element gets

| Element | `data-state` | `data-part` | Blocking risk |
|---------|-------------|-------------|---------------|
| Backdrop | ✓ `"open"/"closed"` | `"backdrop"` | YES during animation |
| Positioner | ✗ none | `"positioner"` | NO (immediate unmount via null-node presence machine) |
| Content | ✓ `"open"/"closed"` | `"content"` | No (not full-screen) |

### GeoDataPanel `startIndex` Prop
- **IMPORTANT:** When passing ALL aggregated `geoFeatures` and `scores` to `GeoDataPanel`, `startIndex` MUST be `0` — the local index already equals the global index
- `startIndex` should only be non-zero when passing a SUBSET of features (single project) that needs mapping to global indices
- **Bug fixed:** Previously, `treatmentDetailPage.tsx` passed the active project's `getProjectFirstSegmentIndex()` as `startIndex` even though ALL features were passed. This caused `globalIdx = startIndex + i` to overflow the scores array, producing blue (#2563EB) fallback colors for non-first projects

### Segment Color System
- Colors are determined by max risk level across crash types (BB, BP, SB, VB)
- Risk band colors: LOW=#87C424, MEDIUM=#FFCC1A, HIGH=#FF5B1A, EXTREME=#CD1AFF
- Blue (#2563EB) is the FALLBACK color when scores are missing — if you see blue segments, scores lookup is broken
- Defined in `colorConstants.ts`, used in `GeoDataPanel.getSegmentColor()`

### Autocode Per-Attribute: CV Skip Optimisation

The "Auto-code (By Attribute)" flow sends `fields: string[]` to `POST /<project>/autocode/all`.
Two skip flags are computed from `fields_filter` before the bulk loop:

| Flag             | Condition                                                                 | Effect                                                         |
|------------------|---------------------------------------------------------------------------|----------------------------------------------------------------|
| `skip_cv`        | ALL requested fields are in `_GIS_ONLY_FIELDS`                            | Skips the path-segmentation YOLO model entirely                |
| `skip_obstacles` | CV runs, but none of the obstacle fields are requested (see list below)   | Skips the second YOLO model pass (obstacle detector)           |

Obstacle fields that require the detector: `"Fixed Obstacle on Facility"`, `"Non-Fixed Obstacle on Facility"`,
`"Width Restriction"`, `"FO Type"`, `"NFO Type"`.

**Bug fixed (2026-04-15):** Selecting only "Facility type" always ran the obstacle detector (`_detect_obstacles`)
unnecessarily. Root cause: `autocode()` in `prediction.py` always called `_detect_obstacles` regardless of which
fields were requested. Fix: added `skip_obstacles: bool = False` to `autocode()`, propagated through
`autocode_image` (reads `skipObstacles` from JSON body) → `_call_autocode_pair` → `autocode_all`.

**Key files:**

- `backend/app/services/prediction.py` — `autocode()`: the `skip_obstacles` branch
- `backend/app/api/projects/routes.py` — `autocode_all()`: `_GIS_ONLY_FIELDS`, `_CV_OBSTACLE_FIELDS`, `skip_cv`, `skip_obstacles`; `_call_autocode_pair()`: passes `skipObstacles` in json
- `frontend/src/constants/autocodeAttributes.ts` — `KEY_ALIASES` maps display names → real backend field keys
- `frontend/src/pages/sidebar/components/CodingSidebar.tsx` — `handleRun()` converts names via `KEY_ALIASES`, calls `onAutoCodeByAttribute(realKeys)`

### Autocode Per-Attribute: Remaining Performance Issues (2026-04-15)

Despite the `skip_obstacles` fix, bulk autocode is still slow. Four root causes identified:

#### Issue 1: `test_request_context` overhead in `_call_autocode_pair` (routes.py:3249–3261) — **CONFIRMED PRIMARY BOTTLENECK (~2.5 s/seg floor)**

`_call_autocode_pair` calls `autocode_image` and `autocode_gis` by creating a fake Flask HTTP context
(`current_app.test_request_context(...)`) for every single segment. This adds per-segment overhead:

- Flask `RequestContext` setup/teardown
- JSON serialisation → `.get_json()` → JSON deserialisation (round-trip per sub-call)
- `_ensure_models_ready()` (acquires `_INIT_LOCK`) re-entered inside `autocode_image` for every segment
- Response object creation (`ok(...)`) just to be immediately unwrapped

**Fix:** Extract the core logic of `autocode_image` and `autocode_gis` into private helper functions
(e.g. `_cv_autocode_core(image_ref, skip_obstacles)` and `_gis_autocode_core(coords)`) and call those
directly from `_call_autocode_pair`, bypassing HTTP dispatch entirely.

#### Issue 2: Double `_inject_grade` per segment in bulk mode (routes.py:2571 + 3424–3425) — **MEDIUM IMPACT**

`autocode_image` (line 2571) already calls `_inject_grade`, which injects Grade/Gradient% into `updates`
before returning. `_call_autocode_pair` then propagates those already-injected values. Despite this,
`_bulk_gen` calls `_inject_grade` again at line 3424–3425 on the merged result. The gradient lookup
includes a linear O(N) scan fallback, so this wasted work scales with project size.

**Fix:** Remove the `_inject_grade` call from `autocode_image` (the single-image endpoint should still
call it, but via the caller), OR remove the duplicate call in `_bulk_gen` by checking whether Grade
was already set in `merged` before calling `_inject_grade`.

#### Issue 3: `autocode_gis` runs ALL 11 GIS spatial queries regardless of `fields_filter` (routes.py:2606–2673) — **HIGH IMPACT**

`fields_filter` is only applied at line 3429 (after `_call_autocode_pair` returns). `autocode_gis` always
runs every GIS query — MRT check, bus lane check, parking check, pedestrian flow lookup, road speed, speed
limit, heavy vehicle flow, curvature, facility width — even when only one field is requested. For example,
requesting only "Curvature" still fires all 11 spatial queries.

Additionally, the `skip_gis` parameter in `_call_autocode_pair` (line 3221) is **never set to True** in the
bulk loop (line 3418). There is no symmetric `_CV_ONLY_FIELDS` guard, so GIS always runs even when all
requested fields are CV-only (e.g. "Facility Type").

**Fix:** Pass `fields_filter` into `autocode_gis` (or its extracted core) so it can skip queries whose
output field is not in the filter. Also define a `_CV_ONLY_FIELDS` set and use it to set `skip_gis=True`
in the bulk loop when all requested fields are CV-only.

#### Issue 4: Sequential segment processing — no parallelism (routes.py:3396) — **HIGH IMPACT**

Segments are processed strictly one-at-a-time in `_bulk_gen`'s `for idx in indices:` loop. YOLO inference
is CPU-bound (limited by GIL), but GIS spatial queries are I/O-bound (shapefile reads, STRtree lookups) and
could run concurrently. There is no batching or pipelining.

**Fix:** Consider `ThreadPoolExecutor` for GIS calls (GIL-releasing C extensions), or a producer-consumer
pipeline that overlaps GIS queries for segment N+1 while CV runs on segment N. For the most impactful gain,
pre-compute all GIS results in a single vectorised spatial join before the YOLO loop.

### Autocode Per-Attribute: Benchmark Results (2026-04-15, AMK AVE 8, 412 segments)

Measured on the full AMK AVE 8 project using `scripts/benchmark_autocode.py`. `save: false` to avoid
mutating stored attributes. Backend on localhost, models already warm.

| Mode | Total time | Per-segment | skip_cv | skip_obstacles |
| ---- | ---------- | ----------- | ------- | -------------- |
| All attributes (full) | 1116.5 s (18.6 min) | 2.710 s | False | False |
| Single attr — "Curvature" | 953.2 s (15.9 min) | 2.314 s | **True** | n/a |
| Single attr — "Facility Type" | 1102.6 s (18.4 min) | 2.676 s | False | **True** |

**Per-segment time breakdown (derived from baseline):**

| Component | Time/seg | Share of total |
| --------- | -------- | -------------- |
| GIS queries (all 11) | ~2.31 s | ~85% |
| Path-seg YOLO (1 pass) | ~0.36 s | ~13% |
| Obstacle detector YOLO | ~0.03 s | ~1% |
| Overhead (test_request_context etc.) | baked in | — |

**Key finding (baseline):** GIS queries appeared to consume ~85% of per-segment time, suggesting
per-field short-circuiting (Issue 3) would yield a large speedup.

**Issue 3 fix applied (2026-04-15):** Per-field `_needs()` guards added to `autocode_gis`. After fix:

| Mode | Total time | Per-segment | Notes |
| ---- | ---------- | ----------- | ----- |
| All attributes (full) | 1064.9 s (17.7 min) | 2.585 s | All 11 GIS queries + CV |
| Single attr — "Curvature" | 1024.3 s (17.1 min) | 2.486 s | Only get_curvature() fires |
| Single attr — "Facility Type" | 1030.6 s (17.2 min) | 2.501 s | **Zero GIS queries** fire (CV-only field) |

**Revised finding:** The Issue 3 fix produced **no meaningful speedup (1.0×)**. "Facility Type" now
skips every GIS query entirely yet still costs ~2.5 s/seg — nearly identical to running 11 queries.
This proves the GIS spatial queries themselves are fast (collectively <0.1 s/seg); the ~2.5 s/seg
floor is almost entirely the `test_request_context` overhead (Issue 1): creating a fake Flask HTTP
context, JSON encoding/decoding, and route dispatch runs for every segment even when no work is done.

**Revised priority: Issue 1 is the dominant bottleneck.** Fixing `_call_autocode_pair` to call
`_gis_autocode_core()` / `_cv_autocode_core()` directly (bypassing HTTP dispatch) is expected to
reduce per-segment time from ~2.5 s to <0.5 s and is the highest-impact remaining fix.

## Commands

- Frontend: `cd frontend && npm run dev`
- Backend: `cd backend && python -m flask run` (or similar)

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: After completing any code edits, ALWAYS call `build_or_update_graph_tool` (incremental, no args needed) to keep the knowledge graph in sync.**

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
