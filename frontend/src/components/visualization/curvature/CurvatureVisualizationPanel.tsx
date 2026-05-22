import { useState, useEffect } from 'react';
import { CurvatureVisualization } from './CurvatureVisualization';
import { CurvatureDiagnostics } from './CurvatureDiagnostics';
import { fetchCurvatureVisualization, type CurvatureVisualizationResponse } from '../../../api/curvatureVisualization';

interface CurvatureVisualizationPanelProps {
  projectName: string;
  coordinates: [number, number][]; // [[lon, lat], ...]
  segmentIndex?: number;
}

function getCurvatureAccent(data: CurvatureVisualizationResponse | null): string {
  if (!data) return '#27AE60';
  if (data.curvature !== 1) return '#27AE60';
  if (data.curvature_subcategory === '<6.5m') return '#DC2626';
  if (data.curvature_subcategory === '<10m') return '#EA580C';
  if (data.curvature_subcategory === 'Path Junction') return '#9333EA';
  if (data.curvature_subcategory === 'Both') return '#9333EA';
  return '#E74C3C';
}

function getCurvatureLabel(data: CurvatureVisualizationResponse | null): string {
  if (!data || data.curvature !== 1) return '✓ No Sharp Turn';
  if (data.curvature_subcategory === '<6.5m') return '⚠️ <6.5m Radius';
  if (data.curvature_subcategory === '<10m') return '⚠️ <10m Radius';
  if (data.curvature_subcategory === 'Path Junction') return '⚠️ Path Junction';
  if (data.curvature_subcategory === 'Both') return '⚠️ Sharp Bend + Junction';
  return '⚠️ Sharp Bend';
}

function shouldShowCurvatureSummaryRadius(data: CurvatureVisualizationResponse | null): boolean {
  return !!data && data.radius !== null && data.curvature_subcategory !== 'Path Junction';
}

export function CurvatureVisualizationPanel({
  projectName,
  coordinates,
  segmentIndex,
}: CurvatureVisualizationPanelProps) {
  const [data, setData] = useState<CurvatureVisualizationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadVisualization() {
      try {
        setData(null);
        setLoading(true);
        setError(null);
        const result = await fetchCurvatureVisualization(projectName, coordinates, segmentIndex, controller.signal);
        if (!controller.signal.aborted) {
          setData(result);
        }
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load visualization');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    if (projectName && coordinates && coordinates.length > 0) {
      loadVisualization();
    }

    return () => controller.abort();
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
      {/* Collapsible Header */}
      <div
        className="curvature-panel-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
            Curvature Analysis {isExpanded ? '▼' : '▶'}
          </h3>
          {/* Quick summary when collapsed */}
          {!isExpanded && data && (
            <span
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: getCurvatureAccent(data)
              }}
            >
              {getCurvatureLabel(data)}
              {shouldShowCurvatureSummaryRadius(data) && ` (${data.radius!.toFixed(1)}m)`}
            </span>
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="curvature-panel-content">
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
                {data.radius !== null
                  ? `${data.radius.toFixed(1)}m`
                  : data.layer_used
                    ? '∞ (Straight)'
                    : 'N/A'}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Classification:</span>
              <span className={`value ${data.curvature === 1 ? 'sharp-turn' : 'safe'}`}>
                {getCurvatureLabel(data)}
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
                      marginLeft: '8px',
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%'
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
                <div className="legend-symbol circle blue-triplet"></div>
                <span>Triplet Points (P1, P2, P3)</span>
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
      )}
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
