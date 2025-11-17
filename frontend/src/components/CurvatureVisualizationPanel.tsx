import { useState, useEffect } from 'react';
import { CurvatureVisualization } from './CurvatureVisualization';
import { CurvatureDiagnostics } from './CurvatureDiagnostics';
import { fetchCurvatureVisualization, CurvatureVisualizationResponse } from '../api/curvatureVisualization';

interface CurvatureVisualizationPanelProps {
  projectName: string;
  coordinates: [number, number][]; // [[lon, lat], ...]
  segmentIndex?: number;
}

export function CurvatureVisualizationPanel({
  projectName,
  coordinates,
  segmentIndex,
}: CurvatureVisualizationPanelProps) {
  const [data, setData] = useState<CurvatureVisualizationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVisualization() {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchCurvatureVisualization(projectName, coordinates, segmentIndex);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load visualization');
        console.error('Error loading curvature visualization:', err);
      } finally {
        setLoading(false);
      }
    }

    if (projectName && coordinates && coordinates.length > 0) {
      loadVisualization();
    }
  }, [projectName, coordinates, segmentIndex]);

  if (loading) {
    return (
      <div className="curvature-loading">
        <div className="spinner"></div>
        <p>Loading curvature visualization...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="curvature-error">
        <p>❌ {error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="curvature-visualization-panel">
      {/* Diagnostic Dropdown (only shows for sharp turns) */}
      <CurvatureDiagnostics
        diagnostics={data.diagnostics || null}
        curvature={data.curvature}
      />

      {/* Info Summary */}
      <div className="curvature-info">
        <div className="info-row">
          <span className="label">Curvature Radius:</span>
          <span className="value">
            {data.radius !== null ? `${data.radius.toFixed(1)}m` : 'N/A'}
          </span>
        </div>
        <div className="info-row">
          <span className="label">Path Width:</span>
          <span className="value">
            {data.width !== null ? `${data.width.toFixed(1)}m` : 'N/A'}
          </span>
        </div>
        <div className="info-row">
          <span className="label">Classification:</span>
          <span className={`value ${data.curvature === 1 ? 'sharp-turn' : 'safe'}`}>
            {data.curvature === 1 ? '⚠️ Sharp Turn' : '✓ No Sharp Turn'}
          </span>
        </div>
        {data.layer_used && (
          <div className="info-row">
            <span className="label">Analysis Layer:</span>
            <span className="value">
              {data.layer_used}
              <span
                className="layer-indicator"
                style={{
                  backgroundColor: getLayerColor(data.layer_used),
                }}
              />
            </span>
          </div>
        )}
      </div>

      {/* Map Visualization */}
      <CurvatureVisualization data={data} />

      {/* Legend */}
      <div className="curvature-legend">
        <h4>Legend:</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-symbol circle red"></div>
            <span>Analysis Point</span>
          </div>
          <div className="legend-item">
            <div className="legend-symbol line black"></div>
            <span>5m Analysis Window</span>
          </div>
          <div className="legend-item">
            <div className="legend-symbol line green"></div>
            <span>Cycling Path</span>
          </div>
          <div className="legend-item">
            <div className="legend-symbol line orange"></div>
            <span>Shared Path</span>
          </div>
          <div className="legend-item">
            <div className="legend-symbol line blue"></div>
            <span>Footpath</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getLayerColor(layer: string): string {
  const colors: Record<string, string> = {
    cycling: '#00B400',
    shared: '#E68C00',
    footpath: '#1E90FF',
  };
  return colors[layer] || '#000000';
}

export default CurvatureVisualizationPanel;
