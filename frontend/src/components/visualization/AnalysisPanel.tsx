import { useState, useEffect } from 'react';
import { CurvatureVisualization } from './curvature/CurvatureVisualization';
import { CurvatureDiagnostics } from './curvature/CurvatureDiagnostics';
import { WidthSearchDiagnostics } from './width/WidthSearchDiagnostics';
import { fetchWidthVisualization, type WidthVisualizationResponse } from '../../api/widthVisualization';
import { fetchCurvatureVisualization, type CurvatureVisualizationResponse } from '../../api/curvatureVisualization';
import { getGradientDisplayColor, getGradientDisplayState } from '../../utils/gradientDisplay';
import './AnalysisPanel.css';

interface AnalysisPanelProps {
  projectName: string;
  coordinates: [number, number][];
  segmentIndex?: number;
  grade?: number | string | null;
  gradientPct?: number | string | null;
  gradientStatus?: string | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getWidthCategoryColor(category: number): string {
  switch (category) {
    case 1: return '#E74C3C';
    case 2: return '#F39C12';
    case 3: return '#27AE60';
    default: return '#95A5A6';
  }
}

function getWidthCategoryIcon(category: number): string {
  switch (category) {
    case 1: return '⚠️';
    case 2: return '⚡';
    case 3: return '✓';
    default: return '?';
  }
}

function getLayerColor(layer: string): string {
  const colors: Record<string, string> = {
    cycling: '#00B400',
    shared:  '#E68C00',
    footpath:'#1E90FF',
  };
  return colors[layer] || '#888';
}

function LayerDot({ layer }: { layer: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: getLayerColor(layer),
        marginLeft: 6,
        verticalAlign: 'middle',
      }}
    />
  );
}

function getCurvatureAccent(data: CurvatureVisualizationResponse | null): string | undefined {
  if (!data) return undefined;
  if (data.curvature !== 1) return '#27AE60';
  if (data.curvature_subcategory === '<6.5m') return '#DC2626';
  if (data.curvature_subcategory === '<10m') return '#EA580C';
  if (data.curvature_subcategory === 'Path Junction') return '#9333EA';
  if (data.curvature_subcategory === 'Both') return '#9333EA';
  return '#E74C3C';
}

function getCurvatureLabel(data: CurvatureVisualizationResponse | null): string | null {
  if (!data) return null;
  if (data.curvature !== 1) return '✓ No Sharp Turn';
  if (data.curvature_subcategory === '<6.5m') return '⚠️ <6.5m Radius';
  if (data.curvature_subcategory === '<10m') return '⚠️ <10m Radius';
  if (data.curvature_subcategory === 'Path Junction') return '⚠️ Path Junction';
  if (data.curvature_subcategory === 'Both') return '⚠️ Sharp Bend + Junction';
  return '⚠️ Sharp Bend';
}

function shouldShowCurvatureSummaryRadius(data: CurvatureVisualizationResponse | null): boolean {
  return !!data && data.radius !== null && data.curvature_subcategory !== 'Path Junction';
}

// ─── individual data card ─────────────────────────────────────────────────────

interface DataCardProps {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
  error?: boolean;
  accent?: string;
}

function DataCard({ label, value, loading, error, accent }: DataCardProps) {
  return (
    <div className="analysis-card">
      <span className="analysis-card-label">{label}</span>
      <span
        className="analysis-card-value"
        style={accent ? { color: accent } : undefined}
      >
        {loading ? <span className="analysis-card-loading">…</span>
          : error  ? <span className="analysis-card-na">—</span>
          : value}
      </span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function AnalysisPanel({
  projectName,
  coordinates,
  segmentIndex,
  grade,
  gradientPct,
  gradientStatus,
}: AnalysisPanelProps) {
  const [widthData,      setWidthData]      = useState<WidthVisualizationResponse | null>(null);
  const [widthLoading,   setWidthLoading]   = useState(true);
  const [widthError,     setWidthError]     = useState<string | null>(null);

  const [curvData,       setCurvData]       = useState<CurvatureVisualizationResponse | null>(null);
  const [curvLoading,    setCurvLoading]    = useState(true);
  const [curvError,      setCurvError]      = useState<string | null>(null);

  const [isExpanded,     setIsExpanded]     = useState(false);
  const [showDiag,       setShowDiag]       = useState(false);

  useEffect(() => {
    if (!projectName || !coordinates?.length) return;
    const controller = new AbortController();
    setWidthData(null);
    setWidthLoading(true);
    setWidthError(null);
    fetchWidthVisualization(projectName, coordinates, segmentIndex, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setWidthData(data);
        }
      })
      .catch((e) => {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
          return;
        }
        setWidthError(e instanceof Error ? e.message : 'Failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setWidthLoading(false);
        }
      });
    return () => controller.abort();
  }, [projectName, coordinates, segmentIndex]);

  useEffect(() => {
    if (!projectName || !coordinates?.length) return;
    const controller = new AbortController();
    setCurvData(null);
    setCurvLoading(true);
    setCurvError(null);
    fetchCurvatureVisualization(projectName, coordinates, segmentIndex, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCurvData(data);
        }
      })
      .catch((e) => {
        if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
          return;
        }
        setCurvError(e instanceof Error ? e.message : 'Failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCurvLoading(false);
        }
      });
    return () => controller.abort();
  }, [projectName, coordinates, segmentIndex]);

  // ── collapsed quick-summary ──────────────────────────────────────────────
  const collapsedSummary = !isExpanded && (widthData || curvData) && (
    <span className="analysis-collapsed-summary">
      {widthData && (
        <span style={{ color: getWidthCategoryColor(widthData.width_category) }}>
          {getWidthCategoryIcon(widthData.width_category)}&nbsp;
          {widthData.width !== null ? `${widthData.width.toFixed(2)}m` : 'N/A'}
        </span>
      )}
      {widthData && curvData && <span className="analysis-summary-sep">·</span>}
      {curvData && (
        <span style={{ color: getCurvatureAccent(curvData) }}>
          {getCurvatureLabel(curvData) ?? '✓ No Turn'}
          {shouldShowCurvatureSummaryRadius(curvData) && ` (${curvData.radius!.toFixed(1)}m)`}
        </span>
      )}
    </span>
  );

  // ── gradient display ─────────────────────────────────────────────────────
  const gradientState = getGradientDisplayState({ grade, gradientPct, gradientStatus });
  const gradientColor = getGradientDisplayColor(gradientState.kind);
  const gradientValue = gradientState.mode === 'percent' ? (
    <span style={{ color: gradientColor, fontWeight: 600 }}>{gradientState.text}</span>
  ) : gradientState.mode === 'grade' && gradientState.kind === 'ok' ? (
    <span style={{ color: gradientColor }}>✓ {gradientState.text}</span>
  ) : gradientState.mode === 'grade' ? (
    <span style={{ color: gradientColor }}>⚠️ {gradientState.text}</span>
  ) : (
    <span style={{ color: gradientColor }}>{gradientState.text}</span>
  );

  return (
    <div className="analysis-panel">
      {/* ── header ── */}
      <div
        className="analysis-panel-header"
        onClick={() => setIsExpanded(v => !v)}
      >
        <div className="analysis-header-inner">
          <h3 className="analysis-panel-title">
            Details&nbsp;{isExpanded ? '▼' : '▶'}
          </h3>
          {collapsedSummary}
        </div>
      </div>

      {/* ── expanded content ── */}
      {isExpanded && (
        <div className="analysis-panel-content">

          {/* ── 3-column grid of 9 data cards ── */}
          <div className="analysis-grid">

            {/* row 1 — primary measurements */}
            <DataCard
              label="Facility Width"
              loading={widthLoading}
              error={!!widthError}
              value={widthData?.width != null
                ? `${widthData.width.toFixed(2)} m`
                : <span className="analysis-card-na">Not Found</span>}
            />
            <DataCard
              label="Curvature Radius"
              loading={curvLoading}
              error={!!curvError}
              value={curvData?.radius != null
                ? `${curvData.radius.toFixed(1)} m`
                : curvData?.layer_used
                  ? <span style={{ color: '#27AE60' }}>∞ (Straight)</span>
                  : <span className="analysis-card-na">N/A</span>}
            />
            <DataCard
              label="Gradient"
              value={gradientValue}
            />

            {/* row 2 — categories / classification */}
            <DataCard
              label="Width Category"
              loading={widthLoading}
              error={!!widthError}
              accent={widthData ? getWidthCategoryColor(widthData.width_category) : undefined}
              value={widthData
                ? `${getWidthCategoryIcon(widthData.width_category)} ${widthData.category_labels[widthData.width_category as 1|2|3]}`
                : undefined}
            />
            <DataCard
              label="Curvature Class"
              loading={curvLoading}
              error={!!curvError}
              accent={getCurvatureAccent(curvData)}
              value={getCurvatureLabel(curvData) ?? undefined}
            />
            <DataCard
              label="Category"
              value={<span className="analysis-card-filler">A</span>}
            />

            {/* row 3 — source layers */}
            <DataCard
              label="Width Source Layer"
              loading={widthLoading}
              error={!!widthError}
              value={widthData?.search_info?.layer_used
                ? <>
                    {widthData.search_info.layer_used}
                    <LayerDot layer={widthData.search_info.layer_used} />
                  </>
                : <span className="analysis-card-na">—</span>}
            />
            <DataCard
              label="Curvature Layer"
              loading={curvLoading}
              error={!!curvError}
              value={curvData?.layer_used
                ? <>
                    {curvData.layer_used}
                    <LayerDot layer={curvData.layer_used} />
                  </>
                : <span className="analysis-card-na">—</span>}
            />
            <DataCard
              label="Source Layer"
              value={<span className="analysis-card-filler">—</span>}
            />

          </div>

          {/* ── curvature map ── */}
          {curvData && !curvLoading && !curvError && (
            <div className="analysis-map-section">
              <CurvatureVisualization data={curvData} />
              <div className="analysis-map-legend">
                <span className="analysis-legend-title">Legend</span>
                <div className="analysis-legend-items">
                  {[
                    { cls: 'circle red',    label: 'Analysis Point' },
                    { cls: 'line black',    label: '5m Window' },
                    { cls: 'circle blue-triplet', label: 'P1 / P2 / P3' },
                    { cls: 'line green',    label: 'Cycling Path' },
                    { cls: 'line orange',   label: 'Shared Path' },
                    { cls: 'line blue',     label: 'Footpath' },
                  ].map(({ cls, label }) => (
                    <div key={label} className="analysis-legend-item">
                      <div className={`analysis-legend-sym ${cls}`} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {curvLoading && (
            <div className="analysis-map-placeholder">
              <div className="spinner" />
              <p>Loading curvature map…</p>
            </div>
          )}

          {/* ── diagnostics toggle ── */}
          <div className="analysis-diagnostics-section">
            <button
              className="analysis-diagnostics-toggle"
              onClick={() => setShowDiag(v => !v)}
            >
              {showDiag ? '▼' : '▶'} Show Diagnostics
            </button>

            {showDiag && (
              <div className="analysis-diagnostics-content">
                {widthData && (
                  <div className="analysis-diag-group">
                    <h4>Width Search Diagnostics</h4>
                    <WidthSearchDiagnostics
                      searchInfo={widthData.search_info}
                      searchRings={widthData.search_rings}
                      widthDistribution={widthData.width_distribution}
                    />
                  </div>
                )}
                {curvData && (
                  <div className="analysis-diag-group">
                    <h4>Curvature Diagnostics</h4>
                    <CurvatureDiagnostics
                      diagnostics={curvData.diagnostics || null}
                      curvature={curvData.curvature}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default AnalysisPanel;
