import { useState, useEffect } from 'react';
import { WidthSearchDiagnostics } from './WidthSearchDiagnostics';
import { fetchWidthVisualization, type WidthVisualizationResponse } from '../../../api/widthVisualization';

interface WidthVisualizationPanelProps {
  projectName: string;
  coordinates: [number, number][]; // [[lon, lat], ...]
  segmentIndex?: number;
}

export function WidthVisualizationPanel({
  projectName,
  coordinates,
  segmentIndex,
}: WidthVisualizationPanelProps) {
  const [data, setData] = useState<WidthVisualizationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    async function loadVisualization() {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchWidthVisualization(projectName, coordinates, segmentIndex);
        console.log('Width Visualization Data:', {
          width: result.width,
          category: result.width_category,
          foundAt: result.search_info.found_at_radius,
          layer: result.search_info.layer_used,
          pathsCount: result.paths.length,
          ringsCount: result.search_rings.length
        });
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load visualization');
        console.error('Error loading width visualization:', err);
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
      <div className="width-loading">
        <div className="spinner"></div>
        <p>Loading facility width visualization...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="width-error">
        <p>❌ {error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const getCategoryColor = (category: number): string => {
    switch (category) {
      case 1: return '#E74C3C'; // Red for Very Narrow
      case 2: return '#F39C12'; // Orange for Narrow
      case 3: return '#27AE60'; // Green for Wide
      default: return '#95A5A6';
    }
  };

  const getCategoryIcon = (category: number): string => {
    switch (category) {
      case 1: return '⚠️';
      case 2: return '⚡';
      case 3: return '✓';
      default: return '?';
    }
  };

  return (
    <div className="width-visualization-panel">
      {/* Collapsible Header */}
      <div
        className="width-panel-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
            Facility Width Analysis {isExpanded ? '▼' : '▶'}
          </h3>
          {/* Quick summary when collapsed */}
          {!isExpanded && data && (
            <span
              style={{
                fontSize: '14px',
                color: getCategoryColor(data.width_category),
                fontWeight: 'bold'
              }}
            >
              {getCategoryIcon(data.width_category)} {data.width !== null ? `${data.width.toFixed(2)}m` : 'Not Found'}
            </span>
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="width-panel-content">
          {/* Info Summary */}
          <div className="width-info">
            <div className="info-row">
              <span className="label">Facility Width:</span>
              <span className="value">
                {data.width !== null ? `${data.width.toFixed(2)}m` : 'Not Found'}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Category:</span>
              <span
                className="value"
                style={{
                  color: getCategoryColor(data.width_category),
                  fontWeight: 'bold'
                }}
              >
                {getCategoryIcon(data.width_category)} {data.category_labels[data.width_category as 1 | 2 | 3]}
              </span>
            </div>
            {data.search_info.layer_used && (
              <div className="info-row">
                <span className="label">Source Layer:</span>
                <span className="value">
                  {data.search_info.layer_used}
                  <span
                    className="layer-indicator"
                    style={{
                      backgroundColor: getLayerColor(data.search_info.layer_used),
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
            {data.search_info.found_at_radius !== null && (
              <div className="info-row">
                <span className="label">Found at Radius:</span>
                <span className="value">{data.search_info.found_at_radius.toFixed(1)}m</span>
              </div>
            )}
          </div>

          {/* Search Diagnostics Dropdown */}
          <WidthSearchDiagnostics
            searchInfo={data.search_info}
            searchRings={data.search_rings}
            widthDistribution={data.width_distribution}
          />
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

export default WidthVisualizationPanel;
