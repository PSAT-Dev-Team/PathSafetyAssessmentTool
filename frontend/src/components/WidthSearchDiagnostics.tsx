import { useState } from 'react';
import type { WidthVisualizationResponse } from '../api/widthVisualization';

interface WidthSearchDiagnosticsProps {
  searchInfo: WidthVisualizationResponse['search_info'];
  searchRings: WidthVisualizationResponse['search_rings'];
  widthDistribution: WidthVisualizationResponse['width_distribution'];
}

export function WidthSearchDiagnostics({
  searchInfo,
  searchRings,
}: WidthSearchDiagnosticsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasNoPaths = searchInfo.found_at_radius === null;

  return (
    <div className="width-diagnostics">
      <button
        className="diagnostics-toggle"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          backgroundColor: hasNoPaths ? '#E74C3C' : '#3498DB',
        }}
      >
        {isOpen ? '▼' : '▶'} Search Details & Diagnostics
        {hasNoPaths && ' ⚠️ No Paths Found'}
      </button>

      {isOpen && (
        <div className="diagnostics-content">
          {/* Search Summary */}
          <div className="diagnostics-section">
            <h4>Search Summary</h4>
            <div className="diagnostic-item">
              <span className="diag-label">Search Range:</span>
              <span className="diag-value">
                {searchInfo.start_radius}m - {searchInfo.max_radius}m (step: {searchInfo.step}m)
              </span>
            </div>
            {searchInfo.found_at_radius !== null ? (
              <>
                <div className="diagnostic-item success">
                  <span className="diag-label">✓ Width Found at:</span>
                  <span className="diag-value">{searchInfo.found_at_radius.toFixed(1)}m</span>
                </div>
                <div className="diagnostic-item success">
                  <span className="diag-label">✓ Source Layer:</span>
                  <span className="diag-value">{searchInfo.layer_used}</span>
                </div>
              </>
            ) : (
              <div className="diagnostic-item error">
                <span className="diag-label">✗ Width Found:</span>
                <span className="diag-value">No (using default: Narrow)</span>
              </div>
            )}
          </div>

          {/* Expanding Ring Search Details */}
          <div className="diagnostics-section">
            <h4>Expanding Ring Search (by radius)</h4>
            <div className="search-table-container">
              <table className="search-table">
                <thead>
                  <tr>
                    <th>Radius</th>
                    <th>Cycling</th>
                    <th>Shared</th>
                    <th>Footpath</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {searchRings.map((ring, i) => {
                    const hasAnyCandidate =
                      ring.candidates_by_layer.cycling +
                      ring.candidates_by_layer.shared +
                      ring.candidates_by_layer.footpath >
                      0;

                    // Only show rows up to and including the locked radius
                    const isLockedRow = ring.width_locked && searchInfo.found_at_radius === ring.radius;
                    const shouldShow = !ring.width_locked || isLockedRow;

                    if (!shouldShow) return null;

                    return (
                      <tr
                        key={i}
                        className={isLockedRow ? 'locked-row' : ''}
                      >
                        <td>{ring.radius.toFixed(1)}m</td>
                        <td className={ring.candidates_by_layer.cycling > 0 ? 'has-candidates' : ''}>
                          {ring.candidates_by_layer.cycling || '-'}
                        </td>
                        <td className={ring.candidates_by_layer.shared > 0 ? 'has-candidates' : ''}>
                          {ring.candidates_by_layer.shared || '-'}
                        </td>
                        <td className={ring.candidates_by_layer.footpath > 0 ? 'has-candidates' : ''}>
                          {ring.candidates_by_layer.footpath || '-'}
                        </td>
                        <td>
                          {isLockedRow ? (
                            <span className="status-locked">🔒 LOCKED</span>
                          ) : hasAnyCandidate ? (
                            <span className="status-found">Found</span>
                          ) : (
                            <span className="status-none">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {hasNoPaths && (
              <div className="diagnostic-warning">
                <p>
                  ⚠️ <strong>No path centerlines found within {searchInfo.max_radius}m</strong>
                </p>
                <p style={{ fontSize: '0.9em', marginTop: '8px' }}>
                  This means there are no cycling paths, shared paths, or footpaths near this
                  location. The default category (Narrow) is being used.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WidthSearchDiagnostics;
