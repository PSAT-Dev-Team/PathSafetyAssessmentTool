import { useState } from 'react';
import { Box, IconButton } from '@chakra-ui/react';
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';
import { CurvatureDiagnostics } from './curvature/CurvatureDiagnostics';
import { WidthSearchDiagnostics } from './width/WidthSearchDiagnostics';
import type { WidthVisualizationResponse } from '../../api/widthVisualization';
import type { CurvatureVisualizationResponse } from '../../api/curvatureVisualization';
import { getGradientDisplayColor, getGradientDisplayState } from '../../utils/gradientDisplay';
import './AnalysisPanel.css'; // Reusing styles

interface AnalysisSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  widthData: WidthVisualizationResponse | null;
  widthLoading: boolean;
  widthError: string | null;
  curvData: CurvatureVisualizationResponse | null;
  curvLoading: boolean;
  curvError: string | null;
  grade?: number | string | null;
  gradientPct?: number | string | null;
  gradientStatus?: string | null;
}

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

function DataCard({ label, value, loading, error, accent }: { label: string; value: React.ReactNode; loading?: boolean; error?: boolean; accent?: string }) {
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

export function AnalysisSidebar({
  isOpen,
  onToggle,
  widthData,
  widthLoading,
  widthError,
  curvData,
  curvLoading,
  curvError,
  grade,
  gradientPct,
  gradientStatus,
}: AnalysisSidebarProps) {
  const [showDiag, setShowDiag] = useState(false);

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
    <>
      {/* Overlay panel — slides in from the left over the map */}
      <Box
        position="absolute"
        top="0"
        left="0"
        bottom="0"
        w={isOpen ? "420px" : "0"}
        overflow="hidden"
        transition="width 0.25s ease"
        zIndex={1000}
        bg="white"
        _dark={{ bg: "gray.800", borderColor: "gray.700" }}
        borderRight={isOpen ? "1px solid" : "none"}
        borderColor="gray.200"
        boxShadow={isOpen ? "lg" : "none"}
      >
        <Box w="420px" h="100%" overflowY="auto" p="4">
          <Box mb={6}>
            <Box fontWeight="semibold" mb={3} fontSize="sm" color="gray.500" _dark={{ color: "gray.400" }} textTransform="uppercase" letterSpacing="wider">Width Analysis</Box>
            <div className="analysis-grid" style={{ gridTemplateColumns: '1fr' }}>
              <DataCard
                label="Facility Width"
                loading={widthLoading}
                error={!!widthError}
                value={widthData?.width != null ? `${widthData.width.toFixed(2)} m` : <span className="analysis-card-na">Not Found</span>}
              />
              <DataCard
                label="Width Category"
                loading={widthLoading}
                error={!!widthError}
                accent={widthData ? getWidthCategoryColor(widthData.width_category) : undefined}
                value={widthData ? `${getWidthCategoryIcon(widthData.width_category)} ${widthData.category_labels[widthData.width_category as 1|2|3]}` : undefined}
              />
              <DataCard
                label="Width Source Layer"
                loading={widthLoading}
                error={!!widthError}
                value={widthData?.search_info?.layer_used ? <>{widthData.search_info.layer_used}<LayerDot layer={widthData.search_info.layer_used} /></> : <span className="analysis-card-na">—</span>}
              />
            </div>
          </Box>

          <Box mb={6}>
            <Box fontWeight="semibold" mb={3} fontSize="sm" color="gray.500" _dark={{ color: "gray.400" }} textTransform="uppercase" letterSpacing="wider">Curvature Analysis</Box>
            <div className="analysis-grid" style={{ gridTemplateColumns: '1fr' }}>
              <DataCard
                label="Curvature Radius"
                loading={curvLoading}
                error={!!curvError}
                value={curvData?.radius != null ? `${curvData.radius.toFixed(1)} m` : curvData?.layer_used ? <span style={{ color: '#27AE60' }}>∞ (Straight)</span> : <span className="analysis-card-na">N/A</span>}
              />
              <DataCard
                label="Curvature Class"
                loading={curvLoading}
                error={!!curvError}
                accent={curvData ? (curvData.curvature === 1 ? '#E74C3C' : '#27AE60') : undefined}
                value={curvData ? (curvData.curvature === 1 ? '⚠️ Sharp Turn' : '✓ No Sharp Turn') : undefined}
              />
              <DataCard
                label="Curvature Layer"
                loading={curvLoading}
                error={!!curvError}
                value={curvData?.layer_used ? <>{curvData.layer_used}<LayerDot layer={curvData.layer_used} /></> : <span className="analysis-card-na">—</span>}
              />
            </div>
          </Box>

          <Box mb={6}>
            <Box fontWeight="semibold" mb={3} fontSize="sm" color="gray.500" _dark={{ color: "gray.400" }} textTransform="uppercase" letterSpacing="wider">Gradient Analysis</Box>
            <div className="analysis-grid" style={{ gridTemplateColumns: '1fr' }}>
              <DataCard label="Gradient" value={gradientValue} />
            </div>
          </Box>

          <div className="analysis-diagnostics-section" style={{ marginTop: '16px' }}>
            <button className="analysis-diagnostics-toggle" onClick={() => setShowDiag(v => !v)}>
              {showDiag ? '▼' : '▶'} Show Diagnostics
            </button>
            {showDiag && (
              <div className="analysis-diagnostics-content">
                {widthData && (
                  <div className="analysis-diag-group">
                    <h4>Width Search Diagnostics</h4>
                    <WidthSearchDiagnostics searchInfo={widthData.search_info} searchRings={widthData.search_rings} widthDistribution={widthData.width_distribution} />
                  </div>
                )}
                {curvData && (
                  <div className="analysis-diag-group">
                    <h4>Curvature Diagnostics</h4>
                    <CurvatureDiagnostics diagnostics={curvData.diagnostics || null} curvature={curvData.curvature} />
                  </div>
                )}
              </div>
            )}
          </div>
        </Box>
      </Box>

      {/* Toggle button — always visible at the left edge of the map */}
      <IconButton
        aria-label="Toggle Analysis Panel"
        size="xs"
        position="absolute"
        top="50%"
        left={isOpen ? "420px" : "0"}
        transform="translateY(-50%)"
        transition="left 0.25s ease"
        zIndex={1001}
        onClick={onToggle}
        bg="white"
        color="gray.600"
        _dark={{ bg: "gray.700", color: "gray.200", borderColor: "gray.600" }}
        borderWidth="1px"
        borderColor="gray.200"
        boxShadow="md"
        borderLeftRadius="0"
        borderRightRadius="md"
        w="24px"
        minW="24px"
        h="40px"
        css={{ "& svg": { width: "14px", height: "14px" } }}
      >
        {isOpen ? <FiChevronsLeft /> : <FiChevronsRight />}
      </IconButton>
    </>
  );
}
