# Curvature Visualization - Frontend Integration Guide

## ✅ What Has Been Created

All frontend components for curvature visualization are ready to use!

### Files Created:

1. **`src/components/CurvatureVisualization.tsx`** - Leaflet map component
2. **`src/components/CurvatureDiagnostics.tsx`** - Diagnostic dropdown component
3. **`src/components/CurvatureDiagnostics.css`** - Diagnostics styles
4. **`src/components/CurvatureVisualizationPanel.tsx`** - Complete panel combining map + diagnostics
5. **`src/components/CurvatureVisualizationPanel.css`** - Panel styles
6. **`src/api/curvatureVisualization.ts`** - API service for fetching data

---

## 🚀 How to Integrate in Coding Page

### Option 1: Full Panel (Recommended)

Add the complete visualization panel to your coding page:

```tsx
import { CurvatureVisualizationPanel } from '../components/CurvatureVisualizationPanel';
import '../components/CurvatureVisualizationPanel.css';

function CodingPage() {
  const [selectedSegment, setSelectedSegment] = useState(null);
  const projectName = "MyProject"; // Get from your app state/router

  return (
    <div className="coding-page">
      {/* Your existing attributes table */}
      <AttributesTable
        onRowClick={(row) => setSelectedSegment(row)}
      />

      {/* Curvature visualization panel */}
      {selectedSegment && selectedSegment.geometry && (
        <CurvatureVisualizationPanel
          projectName={projectName}
          coordinates={selectedSegment.geometry.coordinates}
          segmentIndex={selectedSegment.index}
        />
      )}
    </div>
  );
}
```

### Option 2: Custom Layout

Use individual components for more control:

```tsx
import { CurvatureVisualization } from '../components/CurvatureVisualization';
import { CurvatureDiagnostics } from '../components/CurvatureDiagnostics';
import { fetchCurvatureVisualization } from '../api/curvatureVisualization';

function CodingPage() {
  const [vizData, setVizData] = useState(null);

  const loadVisualization = async (coordinates) => {
    try {
      const data = await fetchCurvatureVisualization(projectName, coordinates);
      setVizData(data);
    } catch (error) {
      console.error('Failed to load visualization:', error);
    }
  };

  return (
    <div className="coding-page">
      <AttributesTable onRowClick={(row) => loadVisualization(row.geometry.coordinates)} />

      {vizData && (
        <div className="visualization-section">
          {/* Diagnostic dropdown above map */}
          <CurvatureDiagnostics
            diagnostics={vizData.diagnostics}
            curvature={vizData.curvature}
          />

          {/* Map */}
          <CurvatureVisualization data={vizData} />
        </div>
      )}
    </div>
  );
}
```

---

## 📦 Required Dependencies

All dependencies are already in your `package.json`! ✅

- `leaflet` ✅
- `react-leaflet` ✅
- `lucide-react` ✅

---

## 🎨 What You'll See

### When User Clicks on a Segment:

1. **Diagnostic Dropdown** (yellow warning - only for sharp turns):
   ```
   ┌──────────────────────────────────────────┐
   │ ⚠️ Sharp Turn Detected                    │
   │ Radius: 8.3m (Threshold: 10m)        [▼] │
   └──────────────────────────────────────────┘
   ```

2. **Info Summary**:
   ```
   Curvature Radius: 8.3m
   Path Width: 2.5m
   Classification: ⚠️ Sharp Turn
   Analysis Layer: cycling 🟢
   ```

3. **Interactive Map** showing:
   - 🔴 Red dot (analysis point)
   - ⚫ Black circle (5m window)
   - 🟢 Green paths (cycling)
   - 🟠 Orange paths (shared)
   - 🔵 Blue paths (footpath)

4. **Legend** explaining the symbols

---

## 🔧 Configuration

### Environment Variable

Create/update `.env` file in frontend root:

```env
VITE_API_URL=http://localhost:5000
```

### Customization Options

#### Change Map Style

In `CurvatureVisualization.tsx`, update the `TileLayer` URL:

```tsx
// OpenStreetMap (current)
url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

// CartoDB Light
url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"

// Mapbox (requires token)
url="https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token={your_token}"
```

#### Adjust Circle Thickness

In `CurvatureVisualization.tsx`:

```tsx
<Polyline
  positions={circleCoords}
  pathOptions={{
    color: '#000000',
    weight: 3,  // Change this (default: 2)
    fill: false,
  }}
/>
```

#### Change Colors

In `CurvatureVisualizationPanel.tsx`:

```tsx
function getLayerColor(layer: string): string {
  return {
    cycling: '#00FF00',  // Change to your preferred color
    shared: '#FFA500',
    footpath: '#0000FF',
  }[layer] || '#000000';
}
```

---

## 📱 Mobile Responsive

All components are mobile-responsive:

- Diagnostic dropdown collapses nicely
- Map adjusts to screen size
- Legend stacks vertically on small screens
- Touch-friendly tap targets

---

## ♿ Accessibility

Built-in accessibility features:

- ✅ Keyboard navigation (Tab, Enter, Space)
- ✅ ARIA labels on interactive elements
- ✅ Screen reader friendly
- ✅ Focus indicators
- ✅ High contrast mode support

---

## 🧪 Testing the Integration

### Step 1: Import Components

In your `CodingPage.tsx` or wherever you want to show the visualization:

```tsx
import { CurvatureVisualizationPanel } from '../components/CurvatureVisualizationPanel';
import '../components/CurvatureVisualizationPanel.css';
```

### Step 2: Add State

```tsx
const [selectedCoordinates, setSelectedCoordinates] = useState<[number, number][] | null>(null);
```

### Step 3: Handle Row Click

```tsx
const handleRowClick = (row: any) => {
  // Assuming your row has geometry.coordinates
  if (row.geometry && row.geometry.coordinates) {
    setSelectedCoordinates(row.geometry.coordinates);
  }
};
```

### Step 4: Render Component

```tsx
{selectedCoordinates && (
  <CurvatureVisualizationPanel
    projectName={currentProject.name}
    coordinates={selectedCoordinates}
  />
)}
```

---

## 📊 Example Data Flow

```
User clicks segment row
    ↓
handleRowClick(row)
    ↓
Extract coordinates from row.geometry.coordinates
    ↓
Pass to CurvatureVisualizationPanel
    ↓
Panel calls fetchCurvatureVisualization(projectName, coords)
    ↓
Backend POST /api/projects/{project}/curvature/visualize
    ↓
Returns visualization data + diagnostics
    ↓
CurvatureDiagnostics shows dropdown (if sharp turn)
    ↓
CurvatureVisualization renders Leaflet map
    ↓
User sees complete visualization!
```

---

## 🎯 Quick Start Example

Copy this into your Coding Page as a starting point:

```tsx
import { useState } from 'react';
import { CurvatureVisualizationPanel } from '../components/CurvatureVisualizationPanel';
import '../components/CurvatureVisualizationPanel.css';

export function CodingPage() {
  const [selectedSegment, setSelectedSegment] = useState<any>(null);
  const projectName = "TestProject"; // Replace with actual project name

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Attributes Coding</h1>

      {/* Your existing table component */}
      <YourAttributesTable onRowSelect={setSelectedSegment} />

      {/* Curvature visualization */}
      {selectedSegment?.geometry?.coordinates && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Curvature Analysis</h2>
          <CurvatureVisualizationPanel
            projectName={projectName}
            coordinates={selectedSegment.geometry.coordinates}
            segmentIndex={selectedSegment.index}
          />
        </div>
      )}
    </div>
  );
}
```

---

## 🐛 Troubleshooting

### Map not showing?

1. Check Leaflet CSS is imported:
   ```tsx
   import 'leaflet/dist/leaflet.css';
   ```

2. Ensure container has height:
   ```css
   .curvature-visualization-panel {
     min-height: 500px;
   }
   ```

### API errors?

1. Verify backend is running on port 5000
2. Check CORS is enabled in Flask
3. Verify `.env` has correct `VITE_API_URL`

### Diagnostics not showing?

- Diagnostics only appear when `curvature === 1` (sharp turn detected)
- Check that `vizData.diagnostics` is not null
- Verify the radius is actually < 10m

### TypeScript errors?

Install type definitions:
```bash
npm install --save-dev @types/leaflet @types/geojson
```

---

## 🎨 Styling Tips

### Match Your App Theme

Update the diagnostic header background in `CurvatureDiagnostics.css`:

```css
.diagnostic-header {
  background: var(--your-app-warning-color);
  /* or use your app's theme colors */
}
```

### Dark Mode Support

Add dark mode styles:

```css
@media (prefers-color-scheme: dark) {
  .curvature-visualization-panel {
    background: #2a2a2a;
    color: #e0e0e0;
  }

  .diagnostic-header {
    background: linear-gradient(135deg, #5a5a3d 0%, #7a7a5d 100%);
  }
}
```

---

## 📚 API Reference

See the full API documentation in:
- **Backend**: `backend/CURVATURE_VISUALIZATION_API.md`
- **Diagnostics**: `backend/CURVATURE_DIAGNOSTICS.md`

---

## ✨ Summary

Everything is ready to use! Just:

1. ✅ Import `CurvatureVisualizationPanel`
2. ✅ Pass `projectName` and `coordinates`
3. ✅ Render when user selects a segment

The component handles:
- ✅ API calls
- ✅ Loading states
- ✅ Error handling
- ✅ Map rendering
- ✅ Diagnostic calculations
- ✅ Responsive layout
- ✅ Accessibility

You now have the exact same visualization as the original Streamlit app! 🎉

