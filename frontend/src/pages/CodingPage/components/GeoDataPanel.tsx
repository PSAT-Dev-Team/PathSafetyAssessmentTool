import {
  Card, CardHeader, CardBody, Heading, Text, Box, Flex, HStack, IconButton, Button,
  Dialog, Portal
} from "@chakra-ui/react";
import { FaMousePointer, FaDrawPolygon } from "react-icons/fa";
import { toaster } from "../../../components/ui/toaster";
import { Switch } from "../../../components/ui/switch";
import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { RISK_BAND_COLORS } from "../../../components/visualization/scoreband/colorConstants";

import { MapContainer, TileLayer, CircleMarker, Polyline, Polygon, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import proj4 from "proj4";

type Props = {
  projectName: string;                       // Current project name from parent
  feature: Feature<LineString, any> | null;  // 当前段（父组件传入）
  index: number;                             // 当前页（父组件传入，0-based）
  onJump?: (idx: number) => void;            // Jump to segment callback
  containerHeight?: number;                  // 容器总高度（包括header）
  scores?: ScoreRow[];                       // Optional scores passed from parent for real-time updates
  subtitle?: string;                         // Optional subtitle to display next to "Map Preview"
  geoFeatures?: Feature<LineString, any>[];  // Optional pre-loaded geofeatures (for multi-project display)
  startIndex?: number;                       // Start index in global segments array (used with geoFeatures for multi-project)
  onDataChange?: () => void;                 // Callback when data is modified (e.g. deleted)
};

type GJ = FeatureCollection<LineString, any>;

type ScoreRow = {
  "Overall Risk Level": number;
  [key: string]: any;
};

// --- EPSG:3414 (SVY21 / Singapore TM) 定义 -> EPSG:4326 ---
proj4.defs(
  "EPSG:3414",
  "+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs"
);
const to4326 = (p: Position): [number, number] => {
  // 返回 [lat, lng]
  const [lon, lat] = proj4("EPSG:3414", "EPSG:4326", p as [number, number]) as [number, number];
  return [lat, lon];
};

// 小组件：根据点集自动 fit bounds
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [points, map]);
  return null;
}

// Polygon Drawing Tool Component
function PolygonDrawingTool({ active, points, onAddPoint }: { active: boolean, points: [number, number][], onAddPoint: (latlng: [number, number]) => void }) {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useMapEvents({
    click(e) {
      if (activeRef.current) {
        onAddPoint([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  if (!active || points.length === 0) return null;

  // Show incomplete polygon line
  return (
    <>
      {points.map((p, i) => (
        <CircleMarker key={i} center={p} radius={3} pathOptions={{ color: "orange", fillColor: "orange", fillOpacity: 1 }} />
      ))}
      <Polyline positions={points} pathOptions={{ color: "orange", dashArray: "5, 5" }} />
      {points.length >= 3 && (
        <Polygon positions={points} pathOptions={{ color: "orange", fillOpacity: 0.2, stroke: false }} />
      )}
    </>
  );
}

// PIP Algorithm (Ray Casting)
const isPointInPolygon = (point: [number, number], vs: [number, number][]) => {
  // point: [lat, lon], vs: [[lat, lon], ...]
  // x = lon, y = lat
  const x = point[1], y = point[0];

  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][1], yi = vs[i][0];
    const xj = vs[j][1], yj = vs[j][0];

    const intersect = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export default function GeoDataPanel({ projectName, index, onJump, containerHeight = 650, scores: externalScores, subtitle, geoFeatures: externalGeoFeatures, startIndex = 0, onDataChange }: Props) {
  const decodedName = useMemo(() => {
    if (!projectName) return null;
    try { return decodeURIComponent(projectName); } catch { return projectName; }
  }, [projectName]);

  const [fc, setFc] = useState<GJ | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Use external geofeatures if provided (for multi-project display), otherwise use fetched data
  const hasExternalGeoFeatures = externalGeoFeatures && externalGeoFeatures.length > 0;

  // Internal scores state (fallback if externalScores not provided)
  const [internalScores, setInternalScores] = useState<ScoreRow[]>([]);

  // Derived active scores - prioritize external props for real-time updates
  const activeScores = useMemo(() => {
    return (externalScores && externalScores.length > 0) ? externalScores : internalScores;
  }, [externalScores, internalScores]);

  // GIS Layer toggles (matching curvature analysis colors)
  const [showFootpath, setShowFootpath] = useState(false);  // Blue
  const [showCycling, setShowCycling] = useState(false);     // Green
  const [showShared, setShowShared] = useState(false);       // Orange
  const [showRoadcrossing, setShowRoadcrossing] = useState(false);  // Red

  // Delete Mode State
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [segmentToDelete, setSegmentToDelete] = useState<number | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Polygon Selection State
  const [isPolygonMode, setIsPolygonMode] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [segmentsToDelete, setSegmentsToDelete] = useState<number[]>([]); // For batch delete

  // Clear polygon points and close dialog when toggling polygon mode
  useEffect(() => {
    setPolygonPoints([]);
    setDeleteConfirmationOpen(false);
    setSegmentsToDelete([]);
  }, [isPolygonMode]);

  // GIS Layer data
  type GISLayerFeature = {
    coordinates: [number, number][];
    properties: { width?: number };
  };
  type GISLayers = {
    footpath: GISLayerFeature[];
    cycling: GISLayerFeature[];
    shared: GISLayerFeature[];
    roadcrossing: GISLayerFeature[];
  };
  const [gisLayers, setGisLayers] = useState<GISLayers | null>(null);

  // 拉取整条 geodata（如果没有 external geofeatures）
  useEffect(() => {
    // Skip if we have external geofeatures provided by parent
    if (hasExternalGeoFeatures) {
      setFc({ type: "FeatureCollection", features: externalGeoFeatures });
      setLoading(false);
      return;
    }

    if (!decodedName) return;
    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/geodata`);
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        const data = (await res.json()) as GJ;
        if (!aborted) setFc(data);
      } catch (e: any) {
        if (!aborted) setErr(e?.message ?? "Failed to load geodata");
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [decodedName, hasExternalGeoFeatures, externalGeoFeatures]);

  // Helper function to fetch scores
  const fetchScores = useCallback(async () => {
    if (!decodedName) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/results`);
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.result_rows)) {
        setInternalScores(data.result_rows);
      }
    } catch (e: any) {
    }
  }, [decodedName]);

  // Fetch Overall Risk Levels for color coding on component mount (fallback if no external scores)
  useEffect(() => {
    if (!decodedName) return;
    // Only fetch if we don't have external scores
    if (!externalScores || externalScores.length === 0) {
      fetchScores();
    }
  }, [decodedName, fetchScores, externalScores]);

  // Listen for score update events (triggered after Calculate Score button is clicked)
  // If we have external scores (from parent), don't fetch from API - let parent updates drive the scores
  // Only fetch from API if we're using the fallback mechanism (no external scores)
  useEffect(() => {
    const handleScoresUpdated = () => {
      // Only refetch from API if we don't have external scores
      if (!externalScores || externalScores.length === 0) {
        fetchScores();
      }
    };

    window.addEventListener("psat:scores:updated", handleScoresUpdated);
    return () => window.removeEventListener("psat:scores:updated", handleScoresUpdated);
  }, [fetchScores, externalScores]);

  // 取每条 LineString 的首点（转 4326），并保留原 feature
  // For multi-project display, localIdx is the index within geoFeatures,
  // and globalIdx is the index within the aggregated scores array
  const points = useMemo(() => {
    if (!fc) return [] as { localIdx: number; globalIdx: number; latlng: [number, number]; f: Feature<LineString, any> }[];
    const arr: { localIdx: number; globalIdx: number; latlng: [number, number]; f: Feature<LineString, any> }[] = [];
    fc.features.forEach((f, i) => {
      const g = f.geometry;
      if (g?.type === "LineString" && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
        arr.push({ localIdx: i, globalIdx: startIndex + i, latlng: to4326(g.coordinates[0]), f });
      }
    });
    return arr;
  }, [fc, startIndex]);

  const allLatLngs = useMemo(() => points.map(p => p.latlng), [points]);

  // 当前高亮点 - use globalIdx to match the index prop (global index)
  const current = useMemo(() => points.find(p => p.globalIdx === index) ?? null, [points, index]);

  // 初始中心（无数据时默认新加坡中心点）
  const initialCenter = useRef<[number, number]>([1.3521, 103.8198]);

  // Fetch GIS layers when any toggle is turned on and we have a current point
  // Skip GIS layers when using external geofeatures from multiple projects
  useEffect(() => {
    // Don't fetch GIS layers for multi-project display
    // if (hasExternalGeoFeatures) {
    //   setGisLayers(null);
    //   return;
    // }

    if (!decodedName || !current) return;

    const anyLayerEnabled = showFootpath || showCycling || showShared || showRoadcrossing;
    if (!anyLayerEnabled) {
      setGisLayers(null);
      return;
    }

    let aborted = false;
    (async () => {
      try {
        // current.latlng is [lat, lon] format from to4326()
        const [lat, lon] = current.latlng;

        // Fetch GIS layers near the current coding point
        const res = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/gis/layers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            point: [lon, lat],  // API expects [lon, lat]
            radius: 200,  // 200m radius around coding area (increased for better visibility)
            layers: ['cycling', 'shared', 'footpath', 'roadcrossing']
          })
        });

        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        const data = await res.json();

        if (!aborted && data.ok) {
          setGisLayers(data.layers);
        }
      } catch (e: any) {
      }
    })();

    return () => { aborted = true; };
  }, [decodedName, current, showFootpath, showCycling, showShared, showRoadcrossing, hasExternalGeoFeatures]);

  // Layer colors matching curvature analysis
  const layerColors = {
    footpath: "#1E90FF",    // Blue - rgb(30, 144, 255)
    cycling: "#B84A39",     // Darker Terracotta Red
    shared: "#9333EA",      // Purple - rgb(147, 51, 234)
    roadcrossing: "#00B400" // Green - rgb(0, 180, 0)
  };

  // Get segment color based on the crash type with the highest score
  const getSegmentColor = (segmentIndex: number): string => {
    if (!activeScores || segmentIndex >= activeScores.length) {
      return "#2563EB"; // Default blue if no scores
    }

    const segmentScores = activeScores[segmentIndex];
    if (!segmentScores) {
      return "#2563EB"; // Default blue if no score data for this segment
    }

    const crashTypes = ["BB", "BP", "SB", "VB"];

    let maxRiskLevel = 0; // 0: Low, 1: Med, 2: High, 3: Extreme

    // Find the crash type with the highest risk level
    crashTypes.forEach((crashType) => {
      const score = segmentScores[crashType] || 0;
      let riskLevel = 0;

      if (['BB', 'BP', 'SB'].includes(crashType)) {
        if (score > 20) riskLevel = 3;       // Extreme
        else if (score > 10) riskLevel = 2;  // High
        else if (score >= 5) riskLevel = 1;  // Medium
        else riskLevel = 0;                  // Low
      } else {
        // VB
        if (score > 60) riskLevel = 3;       // Extreme
        else if (score > 25) riskLevel = 2;  // High
        else if (score >= 10) riskLevel = 1; // Medium
        else riskLevel = 0;                  // Low
      }

      if (riskLevel > maxRiskLevel) {
        maxRiskLevel = riskLevel;
      }
    });

    switch (maxRiskLevel) {
      case 3: return RISK_BAND_COLORS.EXTREME;
      case 2: return RISK_BAND_COLORS.HIGH;
      case 1: return RISK_BAND_COLORS.MEDIUM;
      default: return RISK_BAND_COLORS.LOW;
    }
  };

  const handleDeleteSegment = useCallback(async () => {
    if (segmentToDelete === null || !decodedName) return;

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/segments/${segmentToDelete}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(await res.text().catch(() => res.statusText));
      }

      toaster.create({
        title: "Point Deleted",
        description: `Segment #${segmentToDelete + 1} deleted successfully.`,
        type: "success",
      });

      // Clear selection and close dialog
      setSegmentToDelete(null);
      setDeleteConfirmationOpen(false);
      setIsDeleteMode(false);

      // Trigger data refresh if callback provided
      if (onDataChange) {
        onDataChange();
      } else {
        // Fallback: reload page? Or maybe just re-fetch Geodata? 
        // Re-fetching geodata isn't enough as indices shift globally.
        // Ideally parent should handle this.
        window.location.reload();
      }

    } catch (e: any) {
      toaster.create({
        title: "Delete Failed",
        description: e?.message ?? "Failed to delete segment",
        type: "error",
      });
    }
  }, [segmentToDelete, decodedName, onDataChange]);

  // Handle adding points to polygon
  const handlePolygonPoint = useCallback((latlng: [number, number]) => {
    setPolygonPoints(prev => {
      // Double click logic is hard with simple click handler, using a Close button instead usually better
      // But let's check if clicked near first point to close?
      // Or just let user click a "Finish" button.
      // Let's rely on a "Finish Selection" button in the header instead of complex map interaction.
      return [...prev, latlng];
    });
  }, []);

  // Finish Polygon Selection: Find points inside and confirm
  const finishPolygonSelection = useCallback(() => {
    if (polygonPoints.length < 3) {
      toaster.create({ title: "Invalid Polygon", description: "Need at least 3 points.", type: "warning" });
      return;
    }

    // Find all points inside
    const indicesInside: number[] = [];
    points.forEach(p => {
      if (isPointInPolygon(p.latlng, polygonPoints)) {
        indicesInside.push(p.globalIdx);
      }
    });

    if (indicesInside.length === 0) {
      toaster.create({ title: "No Points Selected", description: "No points found inside the polygon.", type: "info" });
      setPolygonPoints([]);
      setIsPolygonMode(false);
      return;
    }

    setSegmentsToDelete(indicesInside);
    setDeleteConfirmationOpen(true);
  }, [polygonPoints, points]);

  // Handle Batch Deletion
  const handleBatchDelete = useCallback(async () => {
    if (segmentsToDelete.length === 0 || !decodedName) return;

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/segments/delete-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indices: segmentsToDelete })
      });

      if (!res.ok) {
        throw new Error(await res.text().catch(() => res.statusText));
      }

      toaster.create({
        title: "Batch Delete Successful",
        description: `Deleted ${segmentsToDelete.length} segments.`,
        type: "success",
      });

      // Reset states
      setSegmentsToDelete([]);
      setPolygonPoints([]);
      setDeleteConfirmationOpen(false);
      setIsPolygonMode(false);
      setIsDeleteMode(false); // also turn off single delete mode if on

      // Refresh
      if (onDataChange) {
        onDataChange();
      } else {
        window.location.reload();
      }

    } catch (e: any) {
      toaster.create({
        title: "Delete Failed",
        description: e?.message ?? "Failed to delete segments",
        type: "error",
      });
    }
  }, [segmentsToDelete, decodedName, onDataChange]);


  return (
    <Card.Root display="flex" flexDirection="column" h={`${containerHeight}px`}>
      <CardHeader py="2" px="4">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap="2">
            <Heading size="sm">Map Preview</Heading>
            {subtitle && (
              <Text fontSize="sm" fontWeight="medium" color="gray.600" _dark={{ color: "gray.400" }}>
                - {subtitle}
              </Text>
            )}
            {/* Delete Mode Toggle */}
            <IconButton
              aria-label="Toggle Delete Mode"
              variant={isDeleteMode ? "solid" : "ghost"}
              size="xs"
              colorPalette={isDeleteMode ? "red" : "gray"}
              onClick={() => {
                setIsDeleteMode(!isDeleteMode);
                setIsPolygonMode(false); // Exclusive modes
                setPolygonPoints([]);
              }}
              title={isDeleteMode ? "Cancel Delete Mode" : "Enable Point Deletion"}
            >
              <FaMousePointer />
            </IconButton>

            {/* Polygon Mode Toggle */}
            <IconButton
              aria-label="Toggle Polygon Selection"
              variant={isPolygonMode ? "solid" : "ghost"}
              size="xs"
              colorPalette={isPolygonMode ? "orange" : "gray"}
              onClick={() => {
                setIsPolygonMode(prev => !prev);
                setIsDeleteMode(false); // Exclusive modes
                setDeleteConfirmationOpen(false);
              }}
              title={isPolygonMode ? "Cancel Polygon Mode" : "Polygon Selection Deletion"}
            >
              <FaDrawPolygon />
            </IconButton>

            {isPolygonMode && (
              <Button
                size="xs"
                variant="outline"
                colorPalette="orange"
                disabled={polygonPoints.length < 3}
                onClick={finishPolygonSelection}
              >
                Delete Selected ({polygonPoints.length} pts)
              </Button>
            )}

          </Flex>

          {/* GIS Layer Toggles */}
          <HStack gap="4">
            <Flex align="center" gap="2">
              <Text fontSize="sm" fontWeight="medium" color={showFootpath ? "blue.600" : "gray.500"}>
                Footpath
              </Text>
              <Switch
                colorPalette="blue"
                size="sm"
                checked={showFootpath}
                onCheckedChange={(e) => setShowFootpath(e.checked)}
              />
            </Flex>

            <Flex align="center" gap="2">
              <Text fontSize="sm" fontWeight="medium" color={showCycling ? "orange.600" : "gray.500"}>
                Cycling Path
              </Text>
              <Switch
                colorPalette="orange"
                size="sm"
                checked={showCycling}
                onCheckedChange={(e) => setShowCycling(e.checked)}
              />
            </Flex>

            <Flex align="center" gap="2">
              <Text fontSize="sm" fontWeight="medium" color={showShared ? "purple.600" : "gray.500"}>
                Shared Path
              </Text>
              <Switch
                colorPalette="purple"
                size="sm"
                checked={showShared}
                onCheckedChange={(e) => setShowShared(e.checked)}
              />
            </Flex>

            <Flex align="center" gap="2">
              <Text fontSize="sm" fontWeight="medium" color={showRoadcrossing ? "green.600" : "gray.500"}>
                Road Crossing
              </Text>
              <Switch
                colorPalette="green"
                size="sm"
                checked={showRoadcrossing}
                onCheckedChange={(e) => setShowRoadcrossing(e.checked)}
              />
            </Flex>
          </HStack>
        </Flex>
      </CardHeader>

      <CardBody flex="1" minH={0} p={0}>
        {loading && <Text color="gray.500">Loading map…</Text>}
        {err && <Text color="red.600">Failed: {err}</Text>}

        {!loading && !err && (
          <Box border="1px solid" borderColor="gray.200" borderRadius="md" overflow="hidden" h="100%">
            <MapContainer
              center={initialCenter.current}
              zoom={13}
              maxZoom={22}
              style={{ width: "100%", height: "100%" }}
              scrollWheelZoom
            >
              {/* CartoDB Light basemap - same as Curvature Analysis */}
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; OpenStreetMap contributors & CARTO'
                maxZoom={22}
              />

              {/* 数据范围自适应 */}
              {allLatLngs.length > 0 && <FitBounds points={allLatLngs} />}

              {/* GIS Layers - Render below the segment points */}
              {gisLayers && showFootpath && gisLayers.footpath && (
                gisLayers.footpath.map((feature, i) => (
                  <Polyline
                    key={`footpath-${i}`}
                    positions={feature.coordinates.map(([lon, lat]) => [lat, lon])}
                    pathOptions={{
                      color: layerColors.footpath,
                      weight: 3,
                      opacity: 0.8
                    }}
                  />
                ))
              )}

              {gisLayers && showCycling && gisLayers.cycling && (
                gisLayers.cycling.map((feature, i) => (
                  <Polyline
                    key={`cycling-${i}`}
                    positions={feature.coordinates.map(([lon, lat]) => [lat, lon])}
                    pathOptions={{
                      color: layerColors.cycling,
                      weight: 3,
                      opacity: 0.8
                    }}
                  />
                ))
              )}

              {gisLayers && showShared && gisLayers.shared && (
                gisLayers.shared.map((feature, i) => (
                  <Polyline
                    key={`shared-${i}`}
                    positions={feature.coordinates.map(([lon, lat]) => [lat, lon])}
                    pathOptions={{
                      color: layerColors.shared,
                      weight: 3,
                      opacity: 0.8
                    }}
                  />
                ))
              )}

              {gisLayers && showRoadcrossing && gisLayers.roadcrossing && (
                gisLayers.roadcrossing.map((feature, i) => (
                  <Polyline
                    key={`roadcrossing-${i}`}
                    positions={feature.coordinates.map(([lon, lat]) => [lat, lon])}
                    pathOptions={{
                      color: layerColors.roadcrossing,
                      weight: 3,
                      opacity: 0.8
                    }}
                  />
                ))
              )}

              {/* 所有起点 */}
              {points.map(({ globalIdx, latlng, f }) => {
                const isActive = globalIdx === index;
                const baseColor = getSegmentColor(globalIdx);
                const color = isActive ? "#FF6B6B" : baseColor; // Use red highlight for active, otherwise use score-based color
                const radius = isActive ? 8 : 5;
                // Handle both new and old column names for backward compatibility
                const scoreValue = activeScores[globalIdx]?.["Overall Risk Level"] ?? activeScores[globalIdx]?.["CycleRAP score"];
                const label = `#${globalIdx + 1} ${f.properties?.["Image Reference"] ?? ""} - Score: ${scoreValue?.toFixed(2) ?? "N/A"}`;
                // Include score in key to force re-render when score changes
                const keyWithScore = `${globalIdx}-${scoreValue?.toFixed(2) ?? "loading"}`;

                return (
                  <CircleMarker
                    key={keyWithScore}
                    center={latlng}
                    radius={radius}
                    pathOptions={{ color, weight: isActive ? 3 : 1, opacity: 0.9, fillOpacity: 0.8 }}
                    eventHandlers={{
                      click: () => {
                        if (isDeleteMode) {
                          setSegmentToDelete(globalIdx);
                          setDeleteConfirmationOpen(true);
                        } else {
                          onJump?.(globalIdx);
                        }
                      },
                      mouseover: (e) => {
                        if (isDeleteMode) {
                          e.target.setStyle({ color: "red", weight: 4 });
                          const target = e.originalEvent.target as HTMLElement;
                          if (target) target.style.cursor = "pointer";
                        }
                      },
                      mouseout: (e) => {
                        if (isDeleteMode) {
                          e.target.setStyle({ color: color, weight: isActive ? 3 : 1 });
                        }
                      }
                    }}   // ← 跳转到全局索引
                  >
                    <Tooltip>{isDeleteMode ? "Click to Delete" : label}</Tooltip>
                  </CircleMarker>
                );
              })}

              <PolygonDrawingTool active={isPolygonMode} points={polygonPoints} onAddPoint={handlePolygonPoint} />

            </MapContainer>
          </Box>
        )}

        {!loading && !err && points.length === 0 && (
          <Text color="gray.500" mt="2">No geodata to show.</Text>
        )}
      </CardBody>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root open={deleteConfirmationOpen} onOpenChange={(e) => setDeleteConfirmationOpen(e.open)}>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Confirm Deletion</Dialog.Title>
                <Dialog.CloseTrigger />
              </Dialog.Header>
              <Dialog.Body>
                {segmentsToDelete.length > 0
                  ? `Are you sure you want to delete ${segmentsToDelete.length} selected segments?`
                  : `Are you sure you want to delete segment #${segmentToDelete !== null ? segmentToDelete + 1 : "?"}?`
                }
                <br />
                This action cannot be undone.
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" ref={cancelRef} onClick={() => setDeleteConfirmationOpen(false)}>
                  Cancel
                </Button>
                <Button colorPalette="red" onClick={segmentsToDelete.length > 0 ? handleBatchDelete : handleDeleteSegment}>
                  Delete {segmentsToDelete.length > 0 ? `(${segmentsToDelete.length})` : ""}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

    </Card.Root >
  );
}
