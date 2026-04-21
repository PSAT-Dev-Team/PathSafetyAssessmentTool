import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { FaDrawPolygon, FaMousePointer, FaTrash } from "react-icons/fa";
import ThemeAwareTileLayer from "../../components/common/ThemeAwareTileLayer";
import { MapCursorController } from "../../components/common/MapCursorController";
import { queryRoadsInPolygon, type RoadInPolygon } from "../../api";
import "leaflet/dist/leaflet.css";
import L, { divIcon } from "leaflet";

// ── Draggable marker for polygon vertices ──────────────────────────
interface DraggableVertexProps {
  position: [number, number];
  index: number;
  icon: L.DivIcon;
  onDrag: (index: number, latlng: L.LatLng) => void;
  onDragEnd: (index: number, latlng: L.LatLng) => void;
}

function DraggableVertex({ position, index, icon, onDrag, onDragEnd }: DraggableVertexProps) {
  const eventHandlers = useMemo(
    () => ({
      drag: (e: L.LeafletEvent) => {
        const pos = (e.target as L.Marker).getLatLng();
        onDrag(index, pos);
      },
      dragend: (e: L.LeafletEvent) => {
        const pos = (e.target as L.Marker).getLatLng();
        onDragEnd(index, pos);
      },
      click: (e: L.LeafletEvent) => L.DomEvent.stopPropagation(e as any),
    }),
    [index, onDrag, onDragEnd]
  );

  return (
    <Marker
      position={position}
      draggable
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
}

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

// ── Polygon overlay ────────────────────────────────────────────────
function PolygonOverlay({
  points,
  polygonRef,
  polylineRef,
  icon,
  onDrag,
  onDragEnd,
}: {
  points: [number, number][];
  polygonRef: React.RefObject<L.Polygon | null>;
  polylineRef: React.RefObject<L.Polyline | null>;
  icon: L.DivIcon;
  onDrag: (i: number, ll: L.LatLng) => void;
  onDragEnd: (i: number, ll: L.LatLng) => void;
}) {
  if (points.length === 0) return null;
  return (
    <>
      {points.map((pt, i) => (
        <DraggableVertex
          key={`v-${i}`}
          position={pt}
          index={i}
          icon={icon}
          onDrag={onDrag}
          onDragEnd={onDragEnd}
        />
      ))}
      <LeafletPolyline
        ref={polylineRef}
        positions={points}
        pathOptions={{ color: "red", dashArray: "5, 5" }}
      />
      {points.length >= 3 && (
        <LeafletPolygon
          ref={polygonRef}
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
}

export default function SelectRoadsMap({ onSelectionChange }: SelectRoadsMapProps) {
  // Polygon state
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const polygonRef = useRef<L.Polygon>(null);
  const polylineRef = useRef<L.Polyline>(null);
  const pointsRef = useRef(polygonPoints);
  useEffect(() => { pointsRef.current = polygonPoints; }, [polygonPoints]);

  // Road results
  const [roads, setRoads] = useState<SelectedRoad[]>([]);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  // Vertex icon
  const vertexIcon = useMemo(
    () =>
      divIcon({
        className: "polygon-vertex",
        html: `<div style="
          background:red; width:10px; height:10px; border-radius:50%;
          border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.4); cursor:grab;
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    []
  );

  // ─ Handlers ─────────────────────────────────────────────────────
  const addPoint = useCallback((latlng: L.LatLng) => {
    setPolygonPoints((prev) => [...prev, [latlng.lat, latlng.lng]]);
  }, []);

  const handleDrag = useCallback((index: number, latlng: L.LatLng) => {
    const pts = [...pointsRef.current];
    pts[index] = [latlng.lat, latlng.lng];
    if (polygonRef.current) polygonRef.current.setLatLngs(pts.map((p) => L.latLng(p[0], p[1])));
    if (polylineRef.current) polylineRef.current.setLatLngs(pts.map((p) => L.latLng(p[0], p[1])));
  }, []);

  const handleDragEnd = useCallback((index: number, latlng: L.LatLng) => {
    setPolygonPoints((prev) => {
      const pts = [...prev];
      pts[index] = [latlng.lat, latlng.lng];
      return pts;
    });
  }, []);

  const clearPolygon = useCallback(() => {
    setPolygonPoints([]);
    setRoads([]);
    setQueryError(null);
    setIsFallback(false);
    onSelectionChange([]);
  }, [onSelectionChange]);

  // ─ Query backend when polygon has ≥3 points ─────────────────────
  useEffect(() => {
    if (polygonPoints.length < 3) {
      setRoads([]);
      onSelectionChange([]);
      return;
    }

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
  }, [polygonPoints]); // intentionally omitting onSelectionChange to avoid loop

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
          <PolygonOverlay
            points={polygonPoints}
            polygonRef={polygonRef}
            polylineRef={polylineRef}
            icon={vertexIcon}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
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
