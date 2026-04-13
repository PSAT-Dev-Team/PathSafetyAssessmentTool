# CLAUDE.md - PathSafetyAssessmentTool

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

### GeoDataPanel `startIndex` Prop
- **IMPORTANT:** When passing ALL aggregated `geoFeatures` and `scores` to `GeoDataPanel`, `startIndex` MUST be `0` — the local index already equals the global index
- `startIndex` should only be non-zero when passing a SUBSET of features (single project) that needs mapping to global indices
- **Bug fixed:** Previously, `treatmentDetailPage.tsx` passed the active project's `getProjectFirstSegmentIndex()` as `startIndex` even though ALL features were passed. This caused `globalIdx = startIndex + i` to overflow the scores array, producing blue (#2563EB) fallback colors for non-first projects

### Segment Color System
- Colors are determined by max risk level across crash types (BB, BP, SB, VB)
- Risk band colors: LOW=#87C424, MEDIUM=#FFCC1A, HIGH=#FF5B1A, EXTREME=#CD1AFF
- Blue (#2563EB) is the FALLBACK color when scores are missing — if you see blue segments, scores lookup is broken
- Defined in `colorConstants.ts`, used in `GeoDataPanel.getSegmentColor()`

## Commands
- Frontend: `cd frontend && npm run dev`
- Backend: `cd backend && python -m flask run` (or similar)
