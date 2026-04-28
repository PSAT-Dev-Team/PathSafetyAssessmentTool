import re

with open("frontend/src/pages/CodingPage/components/GeoDataPanel.tsx", "r") as f:
    content = f.read()

# 1. Update GeoDataPanelProps
old_props = """interface GeoDataPanelProps {
  projectName: string;
  feature: Feature<LineString, any> | null;
  index: number;
  onJump: (index: number) => void;
  scores: any[];
  onDataChange?: () => void;
  containerHeight?: number;
  subtitle?: string;
  geoFeatures?: Feature<LineString, any>[];
  startIndex?: number;
}"""

new_props = """import type { CurvatureVisualizationResponse } from '../../../../api/curvatureVisualization';

interface GeoDataPanelProps {
  projectName: string;
  feature: Feature<LineString, any> | null;
  index: number;
  onJump: (index: number) => void;
  scores: any[];
  onDataChange?: () => void;
  containerHeight?: number;
  subtitle?: string;
  geoFeatures?: Feature<LineString, any>[];
  startIndex?: number;
  curvData?: CurvatureVisualizationResponse | null;
  showCurvatureOverlay?: boolean;
  onToggleCurvatureOverlay?: () => void;
}"""
content = content.replace(old_props, new_props)

# 2. Update Component Signature
old_sig = """export const GeoDataPanel = ({
  projectName,
  feature,
  index,
  onJump,
  scores,
  onDataChange,
  containerHeight = 650,
  subtitle,
  geoFeatures,
  startIndex = 0,
}: GeoDataPanelProps) => {"""

new_sig = """export const GeoDataPanel = ({
  projectName,
  feature,
  index,
  onJump,
  scores,
  onDataChange,
  containerHeight = 650,
  subtitle,
  geoFeatures,
  startIndex = 0,
  curvData,
  showCurvatureOverlay,
  onToggleCurvatureOverlay,
}: GeoDataPanelProps) => {"""
content = content.replace(old_sig, new_sig)

# 3. Add proj4 parsing to dependencies
proj4_import = "import proj4 from 'proj4';"
if proj4_import not in content:
    content = content.replace("import { useEffect, useState, useRef, useMemo } from 'react';", "import { useEffect, useState, useRef, useMemo } from 'react';\n" + proj4_import)

# 4. Extract triplet points from curvData
triplet_logic = """
  // Convert triplet points from EPSG:3414 to WGS84 (lat, lon) for display
  const tripletPoints: [number, number][] | null = useMemo(() => {
    if (!curvData?.diagnostics?.min_triplet?.points) return null;

    try {
      if (!proj4.defs('EPSG:3414')) {
        proj4.defs('EPSG:3414', '+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs');
      }
      return curvData.diagnostics.min_triplet.points.map(([x, y]) => {
        const [lon, lat] = proj4('EPSG:3414', 'WGS84', [x, y]);
        return [lat, lon] as [number, number];
      });
    } catch (error) {
      return null;
    }
  }, [curvData]);
  
  const circleCoords: [number, number][] | null = useMemo(() => {
    if (!curvData?.circle_geojson?.geometry?.coordinates?.[0]) return null;
    return curvData.circle_geojson.geometry.coordinates[0].map(
      ([lon, lat]) => [lat, lon] as [number, number]
    );
  }, [curvData]);
"""
injection_target2 = "  const [pointToAddMode, setPointToAddMode] = useState<\"left\" | \"right\" | null>(null);"
content = content.replace(injection_target2, triplet_logic + "\n" + injection_target2)

# 5. Add overlay JSX inside MapContainer
overlay_jsx = """
              {/* === Curvature Analysis Overlays === */}
              {showCurvatureOverlay && curvData && (
                <>
                  {/* Black circle outline (5m analysis window) */}
                  {circleCoords && (
                    <Polyline
                      positions={circleCoords}
                      pathOptions={{ color: '#000000', weight: 5, fill: false, opacity: 1 }}
                    />
                  )}
                  {/* Path centerlines (color-coded) */}
                  {curvData.paths?.map((path, pathIdx) => {
                    const pathCoords = path.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]);
                    return (
                      <Polyline
                        key={`curv-path-${pathIdx}`}
                        positions={pathCoords}
                        pathOptions={{
                          color: `rgb(${path.color.join(',')})`,
                          weight: path.is_analysis_layer ? 6 : 4,
                          opacity: path.is_analysis_layer ? 1 : 0.8,
                        }}
                      />
                    );
                  })}
                  {/* Red dot (analysis point) */}
                  {curvData.point && (
                    <CircleMarker
                      center={[curvData.point.lat, curvData.point.lon]}
                      radius={12}
                      pathOptions={{ fillColor: '#ff0000', fillOpacity: 1, color: '#ffffff', weight: 3 }}
                    />
                  )}
                  {/* Blue triplet points (P1, P2, P3) */}
                  {tripletPoints?.map((pt, ptIdx) => (
                    <CircleMarker
                      key={`triplet-${ptIdx}`}
                      center={pt}
                      radius={8}
                      pathOptions={{ fillColor: '#1E90FF', fillOpacity: 1, color: '#ffffff', weight: 2 }}
                    />
                  ))}
                </>
              )}
"""
content = content.replace("{/* 所有起点 */}", overlay_jsx + "\n              {/* 所有起点 */}")

# 6. Add Toggle Button in the Toolbar
toggle_button_jsx = """
                <Button
                  size="sm"
                  variant={showKerbLine ? "solid" : "outline"}
                  colorScheme={showKerbLine ? "teal" : "gray"}
                  onClick={() => setShowKerbLine(!showKerbLine)}
                  leftIcon={<Icon as={FiFilter} />}
                >
                  Kerb Lines
                </Button>

                {onToggleCurvatureOverlay && curvData && (
                  <Button
                    size="sm"
                    variant={showCurvatureOverlay ? "solid" : "outline"}
                    colorScheme={showCurvatureOverlay ? "purple" : "gray"}
                    onClick={onToggleCurvatureOverlay}
                    leftIcon={<Icon as={showCurvatureOverlay ? FiEyeOff : FiEye} />}
                  >
                    Analysis Overlay
                  </Button>
                )}
"""
content = content.replace("""<Button
                  size="sm"
                  variant={showKerbLine ? "solid" : "outline"}
                  colorScheme={showKerbLine ? "teal" : "gray"}
                  onClick={() => setShowKerbLine(!showKerbLine)}
                  leftIcon={<Icon as={FiFilter} />}
                >
                  Kerb Lines
                </Button>""", toggle_button_jsx)

# Also import FiEye, FiEyeOff if not present
if "FiEye" not in content:
    content = content.replace("FiMap,", "FiMap, FiEye, FiEyeOff,")
    
with open("frontend/src/pages/CodingPage/components/GeoDataPanel.tsx", "w") as f:
    f.write(content)
