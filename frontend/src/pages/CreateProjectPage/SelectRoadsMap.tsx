import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Button,
  Text,
  Flex,
  HStack,
  Badge,
} from "@chakra-ui/react";
import {
  MapContainer,
  Polyline as LeafletPolyline,
  Polygon as LeafletPolygon,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { FaDrawPolygon, FaMapMarkedAlt, FaRoad, FaTrash } from "react-icons/fa";
import ThemeAwareTileLayer from "../../components/common/ThemeAwareTileLayer";
import { MapCursorController } from "../../components/common/MapCursorController";
import {
  queryPlanningAreasInBounds,
  queryRoadsInBounds,
  queryRoadsInPolygon,
  type PlanningAreaInBounds,
  type RoadInBounds,
} from "../../api";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ── Map click handler ──────────────────────────────────────────────
function MapClickHandler({
  active,
  onPoint,
}: {
  active: boolean;
  onPoint: (latlng: L.LatLng) => void;
}) {
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  useMapEvents({
    click(e) {
      if (activeRef.current) onPoint(e.latlng);
    },
  });
  return null;
}

function MapViewportWatcher({
  onViewportChange,
}: {
  onViewportChange: (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number; zoom: number }) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const b = map.getBounds();
    onViewportChange({
      minLat: b.getSouth(),
      minLng: b.getWest(),
      maxLat: b.getNorth(),
      maxLng: b.getEast(),
      zoom: map.getZoom(),
    });
  }, [map, onViewportChange]);

  useMapEvents({
    moveend(e) {
      const m = e.target;
      const b = m.getBounds();
      onViewportChange({
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
        zoom: m.getZoom(),
      });
    },
    zoomend(e) {
      const m = e.target;
      const b = m.getBounds();
      onViewportChange({
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
        zoom: m.getZoom(),
      });
    },
  });

  return null;
}

// ── Polygon overlay ────────────────────────────────────────────────
function PolygonOverlay({
  points,
}: {
  points: [number, number][];
}) {
  if (points.length === 0) return null;
  return (
    <>
      <LeafletPolyline
        positions={points}
        pathOptions={{ color: "red", dashArray: "5, 5" }}
      />
      {points.length >= 3 && (
        <LeafletPolygon
          positions={points}
          pathOptions={{ color: "red", fillOpacity: 0.15 }}
        />
      )}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────
export interface SelectedRoad {
  name: string;
  points: number;
  exists: boolean;
  selected: boolean;
}

interface SelectRoadsMapProps {
  onSelectionChange: (roads: SelectedRoad[]) => void;
  onPolygonChange: (polygon: [number, number][]) => void;
}

export default function SelectRoadsMap({ onSelectionChange, onPolygonChange }: SelectRoadsMapProps) {
  // Polygon state
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // Road results
  const [roads, setRoads] = useState<SelectedRoad[]>([]);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [showRoadOverlay, setShowRoadOverlay] = useState(false);
  const [viewportState, setViewportState] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number; zoom: number } | null>(null);
  const [overlayRoads, setOverlayRoads] = useState<RoadInBounds[]>([]);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [highlightRoadName, setHighlightRoadName] = useState<string | null>(null);
  const [showPlanningAreaOverlay, setShowPlanningAreaOverlay] = useState(false);
  const [overlayPlanningAreas, setOverlayPlanningAreas] = useState<PlanningAreaInBounds[]>([]);
  const [planningAreaLoading, setPlanningAreaLoading] = useState(false);
  const [highlightPlanningAreaKey, setHighlightPlanningAreaKey] = useState<string | null>(null);

  // ─ Handlers ─────────────────────────────────────────────────────
  const addPoint = useCallback((latlng: L.LatLng) => {
    setPolygonPoints((prev) => [...prev, [latlng.lat, latlng.lng]]);
  }, []);

  const clearPolygon = useCallback(() => {
    setPolygonPoints([]);
    setRoads([]);
    setQueryError(null);
    setIsFallback(false);
    setHighlightPlanningAreaKey(null);
    onSelectionChange([]);
    onPolygonChange([]);
  }, [onPolygonChange, onSelectionChange]);

  const selectPlanningArea = useCallback((area: PlanningAreaInBounds) => {
    setIsDrawing(false);
    setQueryError(null);
    setIsFallback(false);
    setHighlightPlanningAreaKey(`${area.name}-${area.partIndex}`);
    setPolygonPoints(area.coords);
  }, []);

  useEffect(() => {
    if (!showRoadOverlay || !viewportState || viewportState.zoom < 13) {
      setOverlayRoads([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setOverlayLoading(true);
      try {
        const result = await queryRoadsInBounds(
          {
            minLat: viewportState.minLat,
            minLng: viewportState.minLng,
            maxLat: viewportState.maxLat,
            maxLng: viewportState.maxLng,
          },
          2500
        );
        if (!cancelled) {
          setOverlayRoads(result);
        }
      } catch (e) {
        if (!cancelled) {
          setOverlayRoads([]);
        }
      } finally {
        if (!cancelled) {
          setOverlayLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [showRoadOverlay, viewportState]);

  useEffect(() => {
    if (!showPlanningAreaOverlay || !viewportState || viewportState.zoom < 10) {
      setOverlayPlanningAreas([]);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setPlanningAreaLoading(true);
      try {
        const result = await queryPlanningAreasInBounds(
          {
            minLat: viewportState.minLat,
            minLng: viewportState.minLng,
            maxLat: viewportState.maxLat,
            maxLng: viewportState.maxLng,
          },
          300
        );
        if (!cancelled) {
          setOverlayPlanningAreas(result);
        }
      } catch (e) {
        if (!cancelled) {
          setOverlayPlanningAreas([]);
        }
      } finally {
        if (!cancelled) {
          setPlanningAreaLoading(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [showPlanningAreaOverlay, viewportState]);

  // ─ Query backend when polygon has ≥3 points ─────────────────────
  useEffect(() => {
    if (polygonPoints.length < 3) {
      setRoads([]);
      onSelectionChange([]);
      onPolygonChange([]);
      return;
    }

    onPolygonChange(polygonPoints);

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setQuerying(true);
      setQueryError(null);
      try {
        const { roads: result, fallback } = await queryRoadsInPolygon(polygonPoints);
        if (cancelled) return;
        setIsFallback(fallback);
        const mapped: SelectedRoad[] = result.map((r) => ({
          ...r,
          selected: !fallback, // don't pre-select planning area fallback results
        }));
        setRoads(mapped);
        onSelectionChange(mapped);
      } catch (e: any) {
        if (!cancelled) setQueryError(e?.message ?? "Query failed");
      } finally {
        if (!cancelled) setQuerying(false);
      }
    }, 400); // debounce

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [onPolygonChange, onSelectionChange, polygonPoints]);

  // ─ Selection helpers ────────────────────────────────────────────
  const toggleRoad = useCallback(
    (name: string) => {
      setRoads((prev) => {
        const next = prev.map((r) =>
          r.name === name ? { ...r, selected: !r.selected } : r
        );
        onSelectionChange(next);
        return next;
      });
    },
    [onSelectionChange]
  );

  const selectAll = useCallback(() => {
    setRoads((prev) => {
      const next = prev.map((r) => ({ ...r, selected: true }));
      onSelectionChange(next);
      return next;
    });
  }, [onSelectionChange]);

  const deselectAll = useCallback(() => {
    setRoads((prev) => {
      const next = prev.map((r) => ({ ...r, selected: false }));
      onSelectionChange(next);
      return next;
    });
  }, [onSelectionChange]);

  const allSelected = roads.length > 0 && roads.every((r) => r.selected);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <Box>
      {/* Toolbar */}
      <Flex mb={2} gap={2} alignItems="center">
        <Button
          size="sm"
          variant={isDrawing ? "solid" : "outline"}
          colorPalette={isDrawing ? "red" : "gray"}
          onClick={() => setIsDrawing(!isDrawing)}
        >
          <FaDrawPolygon />
          <Text ml={1}>{isDrawing ? "Drawing…" : "Draw Polygon"}</Text>
        </Button>

        {polygonPoints.length > 0 && (
          <Button size="sm" variant="outline" colorPalette="red" onClick={clearPolygon}>
            <FaTrash />
            <Text ml={1}>Clear</Text>
          </Button>
        )}

        {isDrawing && (
          <Text fontSize="xs" color="gray.500">
            Click on the map to place vertices. Draw at least 3 points.
          </Text>
        )}

        <Button
          size="sm"
          variant={showRoadOverlay ? "solid" : "outline"}
          colorPalette={showRoadOverlay ? "blue" : "gray"}
          onClick={() => setShowRoadOverlay((v) => !v)}
        >
          <FaRoad />
          <Text ml={1}>{showRoadOverlay ? "Hide Roads" : "Show Roads"}</Text>
        </Button>

        {showRoadOverlay && overlayLoading && (
          <Text fontSize="xs" color="gray.500">Loading roads…</Text>
        )}

        <Button
          size="sm"
          variant={showPlanningAreaOverlay ? "solid" : "outline"}
          colorPalette={showPlanningAreaOverlay ? "teal" : "gray"}
          onClick={() => setShowPlanningAreaOverlay((v) => !v)}
        >
          <FaMapMarkedAlt />
          <Text ml={1}>{showPlanningAreaOverlay ? "Hide Planning Areas" : "Show Planning Areas"}</Text>
        </Button>

        {showPlanningAreaOverlay && planningAreaLoading && (
          <Text fontSize="xs" color="gray.500">Loading planning areas…</Text>
        )}
      </Flex>

      {/* Map */}
      <Box borderRadius="md" overflow="hidden" border="1px solid" borderColor="gray.200">
        <MapContainer
          center={[1.3521, 103.8198]}
          zoom={12}
          style={{ height: "350px", width: "100%" }}
          scrollWheelZoom
        >
          <ThemeAwareTileLayer />
          <MapCursorController mode={isDrawing ? "add" : "default"} />
          <MapClickHandler active={isDrawing} onPoint={addPoint} />
          <MapViewportWatcher onViewportChange={setViewportState} />
          {showPlanningAreaOverlay && overlayPlanningAreas.map((area) => {
            const areaKey = `${area.name}-${area.partIndex}`;
            const isHighlighted = highlightPlanningAreaKey === areaKey;
            return (
              <LeafletPolygon
                key={areaKey}
                positions={area.coords}
                pathOptions={{
                  color: isHighlighted ? "#0F766E" : "#0D9488",
                  weight: isHighlighted ? 3 : 1.5,
                  opacity: 0.9,
                  fillColor: isHighlighted ? "#14B8A6" : "#5EEAD4",
                  fillOpacity: isHighlighted ? 0.28 : 0.12,
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e as any);
                    selectPlanningArea(area);
                  },
                }}
              >
                <Popup>
                  <Text fontSize="sm" fontWeight="semibold">{area.name}</Text>
                </Popup>
              </LeafletPolygon>
            );
          })}
          {showRoadOverlay && overlayRoads.map((road, idx) => (
            <LeafletPolyline
              key={`${road.name}-${idx}`}
              positions={road.coords}
              pathOptions={{
                color: highlightRoadName === road.name ? "#1D4ED8" : (road.exists ? "#16A34A" : "#6B7280"),
                weight: highlightRoadName === road.name ? 4 : 2,
                opacity: 0.75,
              }}
              eventHandlers={{
                click: () => {
                  setHighlightRoadName(road.name);
                  const hit = roads.find((r) => r.name === road.name);
                  if (hit && !hit.selected) {
                    toggleRoad(road.name);
                  }
                },
              }}
            >
              <Popup>
                <Text fontSize="xs" fontWeight="bold">{road.name}</Text>
                <Text fontSize="xs" color={road.exists ? "green.600" : "orange.600"}>
                  {road.exists ? "Available" : "Not Downloaded"}
                </Text>
              </Popup>
            </LeafletPolyline>
          ))}
          <PolygonOverlay
            points={polygonPoints}
          />
        </MapContainer>
      </Box>

      {/* Road list */}
      {querying && (
        <Text fontSize="sm" color="gray.500" mt={2}>
          Searching for roads…
        </Text>
      )}

      {queryError && (
        <Text fontSize="sm" color="red.500" mt={2}>
          {queryError}
        </Text>
      )}

      {!querying && polygonPoints.length >= 3 && roads.length === 0 && !queryError && (
        <Text fontSize="sm" color="gray.500" mt={2}>
          No roads found in selected area.
        </Text>
      )}

      {showPlanningAreaOverlay && !planningAreaLoading && viewportState && viewportState.zoom < 10 && (
        <Text fontSize="sm" color="gray.500" mt={2}>
          Zoom in to level 10 or above to view planning areas.
        </Text>
      )}

      {roads.length > 0 && !isFallback && (
        <Box mt={3}>
          <Flex justifyContent="space-between" alignItems="center" mb={2}>
            <Text fontSize="sm" fontWeight="bold">
              Roads Found ({roads.filter((r) => r.selected).length}/{roads.length} selected)
            </Text>
            <HStack gap={2}>
              <Button size="xs" variant="ghost" onClick={allSelected ? deselectAll : selectAll}>
                {allSelected ? "Deselect All" : "Select All"}
              </Button>
            </HStack>
          </Flex>

          <Box
            maxH="200px"
            overflowY="auto"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="md"
          >
            {roads.map((road) => (
              <Flex
                key={road.name}
                px={3}
                py={2}
                alignItems="center"
                justifyContent="space-between"
                cursor="pointer"
                _hover={{ bg: "gray.50" }}
                onClick={() => toggleRoad(road.name)}
                borderBottom="1px solid"
                borderColor="gray.100"
              >
                <HStack gap={2}>
                  <input
                    type="checkbox"
                    checked={road.selected}
                    onChange={() => toggleRoad(road.name)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Text fontSize="sm">{road.name}</Text>
                </HStack>
                <HStack gap={2}>
                  <Text fontSize="xs" color="gray.500">
                    {road.points} pts
                  </Text>
                  {road.exists ? (
                    <Badge colorPalette="green" size="sm">Available</Badge>
                  ) : (
                    <Badge colorPalette="orange" size="sm">Not Downloaded</Badge>
                  )}
                </HStack>
              </Flex>
            ))}
          </Box>
        </Box>
      )}

      {roads.length > 0 && isFallback && (
        <Box mt={3}>
          <Text fontSize="sm" fontWeight="bold" color="orange.600" mb={1}>
            No road image data in this area
          </Text>
          <Text fontSize="xs" color="gray.500" mb={2}>
            The following planning areas overlap your selection, but no image folders have been downloaded for them. Project creation is not possible until images are available.
          </Text>
          <Box
            maxH="200px"
            overflowY="auto"
            border="1px solid"
            borderColor="orange.200"
            borderRadius="md"
          >
            {roads.map((area) => (
              <Flex
                key={area.name}
                px={3}
                py={2}
                alignItems="center"
                borderBottom="1px solid"
                borderColor="gray.100"
              >
                <Text fontSize="sm" color="gray.600">{area.name}</Text>
              </Flex>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
