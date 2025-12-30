import { Card, CardHeader, CardBody, Heading, Text, Box, Flex, HStack } from "@chakra-ui/react";
import { Switch } from "../../../components/ui/switch";
import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { RISK_BAND_COLORS } from "../../../components/visualization/scoreband/colorConstants";

import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
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
};

type GJ = FeatureCollection<LineString, any>;

type ScoreRow = {
  "CycleRAP score": number;
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

export default function GeoDataPanel({ projectName, index, onJump, containerHeight = 650, scores: externalScores }: Props) {
  const decodedName = useMemo(() => {
    if (!projectName) return null;
    try { return decodeURIComponent(projectName); } catch { return projectName; }
  }, [projectName]);

  const [fc, setFc] = useState<GJ | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // CycleRAP scores for color coding - use external scores if provided, otherwise fetch from API
  const [scores, setScores] = useState<ScoreRow[]>([]);

  // GIS Layer toggles (matching curvature analysis colors)
  const [showFootpath, setShowFootpath] = useState(false);  // Blue
  const [showCycling, setShowCycling] = useState(false);     // Green
  const [showShared, setShowShared] = useState(false);       // Orange

  // GIS Layer data
  type GISLayerFeature = {
    coordinates: [number, number][];
    properties: { width?: number };
  };
  type GISLayers = {
    footpath: GISLayerFeature[];
    cycling: GISLayerFeature[];
    shared: GISLayerFeature[];
  };
  const [gisLayers, setGisLayers] = useState<GISLayers | null>(null);

  // 拉取整条 geodata（不改其它文件）
  useEffect(() => {
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
  }, [decodedName]);

  // Helper function to fetch scores
  const fetchScores = useCallback(async () => {
    if (!decodedName) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/results`);
      if (!res.ok) {
        console.warn("Could not fetch CycleRAP scores");
        return;
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.result_rows)) {
        setScores(data.result_rows);
        console.log("Scores loaded:", data.result_rows.length, "segments");
      }
    } catch (e: any) {
      console.warn("Failed to load CycleRAP scores:", e?.message);
    }
  }, [decodedName]);

  // Use external scores if provided (real-time updates), otherwise fetch from API
  useEffect(() => {
    if (externalScores && externalScores.length > 0) {
      console.log("GeoDataPanel: Updating scores from external source, count:", externalScores.length, "scores:", externalScores);
      setScores(externalScores);
    }
  }, [externalScores]);

  // Debug: log when internal scores state changes
  useEffect(() => {
    console.log("GeoDataPanel: Internal scores state updated, count:", scores.length);
  }, [scores]);

  // Fetch CycleRAP scores for color coding on component mount (fallback if no external scores)
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
      console.log("Scores updated event received");
      // Only refetch from API if we don't have external scores
      if (!externalScores || externalScores.length === 0) {
        console.log("No external scores available, refetching from API...");
        fetchScores();
      } else {
        console.log("External scores available, not refetching from API");
      }
    };

    window.addEventListener("psat:scores:updated", handleScoresUpdated);
    return () => window.removeEventListener("psat:scores:updated", handleScoresUpdated);
  }, [fetchScores, externalScores]);

  // 取每条 LineString 的首点（转 4326），并保留原 feature
  const points = useMemo(() => {
    if (!fc) return [] as { idx: number; latlng: [number, number]; f: Feature<LineString, any> }[];
    const arr: { idx: number; latlng: [number, number]; f: Feature<LineString, any> }[] = [];
    fc.features.forEach((f, i) => {
      const g = f.geometry;
      if (g?.type === "LineString" && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
        arr.push({ idx: i, latlng: to4326(g.coordinates[0]), f });
      }
    });
    return arr;
  }, [fc]);

  const allLatLngs = useMemo(() => points.map(p => p.latlng), [points]);

  // 当前高亮点
  const current = useMemo(() => points.find(p => p.idx === index) ?? null, [points, index]);

  // 初始中心（无数据时默认新加坡中心点）
  const initialCenter = useRef<[number, number]>([1.3521, 103.8198]);

  // Fetch GIS layers when any toggle is turned on and we have a current point
  useEffect(() => {
    if (!decodedName || !current) return;

    const anyLayerEnabled = showFootpath || showCycling || showShared;
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
        console.log('Fetching GIS layers for point:', [lon, lat]);
        const res = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/gis/layers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            point: [lon, lat],  // API expects [lon, lat]
            radius: 200,  // 200m radius around coding area (increased for better visibility)
            layers: ['cycling', 'shared', 'footpath']
          })
        });

        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        const data = await res.json();

        if (!aborted && data.ok) {
          console.log('GIS layers loaded:', data.layers);
          console.log('Footpath features:', data.layers.footpath?.length);
          console.log('Cycling features:', data.layers.cycling?.length);
          console.log('Shared features:', data.layers.shared?.length);
          setGisLayers(data.layers);
        }
      } catch (e: any) {
        console.error('Failed to load GIS layers:', e);
      }
    })();

    return () => { aborted = true; };
  }, [decodedName, current, showFootpath, showCycling, showShared]);

  // Layer colors matching curvature analysis
  const layerColors = {
    footpath: "#1E90FF",    // Blue - rgb(30, 144, 255)
    cycling: "#00B400",     // Green - rgb(0, 180, 0)
    shared: "#E68C00"       // Orange - rgb(230, 140, 0)
  };

  // Get segment color based on the crash type with the highest score
  const getSegmentColor = (segmentIndex: number): string => {
    if (!scores || segmentIndex >= scores.length) {
      return "#2563EB"; // Default blue if no scores
    }

    const segmentScores = scores[segmentIndex];
    if (!segmentScores) {
      return "#2563EB"; // Default blue if no score data for this segment
    }

    const crashTypes = ["BB", "BP", "SB", "VB"];

    let highestScore = 0;
    let highestScoreColor: string = RISK_BAND_COLORS.LOW;

    // Find the crash type with the highest score
    crashTypes.forEach((crashType) => {
      const score = segmentScores[crashType] || 0;

      if (score > highestScore) {
        highestScore = score;

        // Determine color based on the score
        if (score <= 5) highestScoreColor = RISK_BAND_COLORS.LOW;
        else if (score <= 10) highestScoreColor = RISK_BAND_COLORS.MEDIUM;
        else if (score <= 20) highestScoreColor = RISK_BAND_COLORS.HIGH;
        else highestScoreColor = RISK_BAND_COLORS.EXTREME;
      }
    });

    return highestScoreColor;
  };

  return (
    <Card.Root display="flex" flexDirection="column" h={`${containerHeight}px`}>
      <CardHeader py="2" px="4">
        <Flex justify="space-between" align="center">
          <Heading size="sm">Map Preview</Heading>

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
              <Text fontSize="sm" fontWeight="medium" color={showCycling ? "green.600" : "gray.500"}>
                Cycling Path
              </Text>
              <Switch
                colorPalette="green"
                size="sm"
                checked={showCycling}
                onCheckedChange={(e) => setShowCycling(e.checked)}
              />
            </Flex>

            <Flex align="center" gap="2">
              <Text fontSize="sm" fontWeight="medium" color={showShared ? "orange.600" : "gray.500"}>
                Shared Path
              </Text>
              <Switch
                colorPalette="orange"
                size="sm"
                checked={showShared}
                onCheckedChange={(e) => setShowShared(e.checked)}
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
                console.log('Rendering footpath layers:', gisLayers.footpath.length),
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
                console.log('Rendering cycling layers:', gisLayers.cycling.length),
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
                console.log('Rendering shared layers:', gisLayers.shared.length),
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

              {/* 所有起点 */}
              {points.map(({ idx, latlng, f }) => {
                const isActive = idx === index;
                const baseColor = getSegmentColor(idx);
                const color = isActive ? "#FF6B6B" : baseColor; // Use red highlight for active, otherwise use score-based color
                const radius = isActive ? 8 : 5;
                const scoreValue = scores[idx]?.["CycleRAP score"];
                const label = `#${idx} ${f.properties?.["Image Reference"] ?? ""} - Score: ${scoreValue?.toFixed(2) ?? "N/A"}`;
                // Include score in key to force re-render when score changes
                const keyWithScore = `${idx}-${scoreValue?.toFixed(2) ?? "loading"}`;

                return (
                  <CircleMarker
                    key={keyWithScore}
                    center={latlng}
                    radius={radius}
                    pathOptions={{ color, weight: isActive ? 3 : 1, opacity: 0.9, fillOpacity: 0.8 }}
                    eventHandlers={{ click: () => onJump?.(idx) }}   // ← 点击跳页
                  >
                    <Tooltip>{label}</Tooltip>
                  </CircleMarker>
                );
              })}

            </MapContainer>
          </Box>
        )}

        {!loading && !err && points.length === 0 && (
          <Text color="gray.500" mt="2">No geodata to show.</Text>
        )}
      </CardBody>
    </Card.Root>
  );
}
