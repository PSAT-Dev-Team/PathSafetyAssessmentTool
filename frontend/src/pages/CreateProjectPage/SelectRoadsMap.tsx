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
  Marker,
  Polyline as LeafletPolyline,
  Polygon as LeafletPolygon,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { FaDrawPolygon, FaFileImport, FaMapMarkedAlt, FaRoad, FaTrash } from "react-icons/fa";
import ThemeAwareTileLayer from "../../components/common/ThemeAwareTileLayer";
import { MapCursorController } from "../../components/common/MapCursorController";
import {
  previewUploadedShapefiles,
  queryPlanningAreasInBounds,
  queryRoadsInBounds,
  queryRoadsInPolygon,
  type PlanningAreaInBounds,
  type RoadInBounds,
} from "../../api";
import { toaster } from "../../components/ui/toaster";
import type { Feature, FeatureCollection, GeoJsonProperties, MultiPolygon, Polygon } from "geojson";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const polygonVertexIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#dc2626;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

type PolygonSource = "manual" | "planning-area" | "uploaded-shapefile" | null;

interface UploadedBoundaryFeature {
  key: string;
  label: string;
  coords: [number, number][];
}

const SHAPEFILE_ACCEPT = ".zip,.shp,.shx,.dbf,.prj,.cpg,.sbn,.sbx";
const FEATURE_LABEL_KEYS = [
  "name",
  "Name",
  "NAME",
  "label",
  "Label",
  "LABEL",
  "pln_area_n",
  "PLN_AREA_N",
  "subzone_n",
  "SUBZONE_N",
  "region_n",
  "REGION_N",
  "id",
  "ID",
  "OBJECTID",
  "FID",
];

function cloneCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => [lat, lng]);
}

function getUploadedBoundaryLabel(properties: GeoJsonProperties | null | undefined, featureIndex: number): string {
  if (properties) {
    for (const key of FEATURE_LABEL_KEYS) {
      const value = properties[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
  }

  return `Uploaded Feature ${featureIndex + 1}`;
}

function toLeafletCoords(ring: number[][]): [number, number][] {
  return ring
    .filter((coord) => coord.length >= 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
    .map(([lng, lat]) => [lat, lng]);
}

function extractUploadedBoundaryFeatures(collection: FeatureCollection): UploadedBoundaryFeature[] {
  const boundaries: UploadedBoundaryFeature[] = [];

  collection.features.forEach((feature: Feature, featureIndex) => {
    const baseLabel = getUploadedBoundaryLabel(feature.properties, featureIndex);
    const geometry = feature.geometry;

    if (!geometry) {
      return;
    }

    const appendBoundary = (ring: number[][], partIndex: number, totalParts: number) => {
      const coords = toLeafletCoords(ring);
      if (coords.length < 3) {
        return;
      }

      boundaries.push({
        key: `${featureIndex}-${partIndex}`,
        label: totalParts > 1 ? `${baseLabel} (part ${partIndex + 1})` : baseLabel,
        coords,
      });
    };

    if (geometry.type === "Polygon") {
      const polygon = geometry as Polygon;
      if (polygon.coordinates[0]) {
        appendBoundary(polygon.coordinates[0] as number[][], 0, 1);
      }
      return;
    }

    if (geometry.type === "MultiPolygon") {
      const multiPolygon = geometry as MultiPolygon;
      multiPolygon.coordinates.forEach((polygonCoords, partIndex) => {
        if (polygonCoords[0]) {
          appendBoundary(polygonCoords[0] as number[][], partIndex, multiPolygon.coordinates.length);
        }
      });
    }
  });

  return boundaries;
}

function mergeRoadSelection(
  previousRoads: SelectedRoad[],
  nextRoads: Array<Omit<SelectedRoad, "selected">>,
  fallback: boolean
): SelectedRoad[] {
  const previousSelection = new Map(
    previousRoads.map((road) => [road.name, road.selected])
  );

  return nextRoads.map((road) => ({
    ...road,
    selected: previousSelection.get(road.name) ?? !fallback,
  }));
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

function MapBoundsFitter({
  points,
}: {
  points: [number, number][] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) {
      return;
    }

    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  }, [map, points]);

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
  refreshKey?: number;
}

export default function SelectRoadsMap({ onSelectionChange, onPolygonChange, refreshKey = 0 }: SelectRoadsMapProps) {
  // Polygon state
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [polygonSource, setPolygonSource] = useState<PolygonSource>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [uploadedBoundaries, setUploadedBoundaries] = useState<UploadedBoundaryFeature[]>([]);
  const [uploadedBoundaryName, setUploadedBoundaryName] = useState<string | null>(null);
  const [uploadedBoundaryLoading, setUploadedBoundaryLoading] = useState(false);
  const [uploadedBoundaryError, setUploadedBoundaryError] = useState<string | null>(null);
  const [highlightUploadedBoundaryKey, setHighlightUploadedBoundaryKey] = useState<string | null>(null);
  const [mapFocusPoints, setMapFocusPoints] = useState<[number, number][] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const roadsRef = useRef<SelectedRoad[]>([]);
  const polygonSourceRef = useRef<PolygonSource>(null);

  useEffect(() => {
    roadsRef.current = roads;
  }, [roads]);

  useEffect(() => {
    polygonSourceRef.current = polygonSource;
  }, [polygonSource]);

  // ─ Handlers ─────────────────────────────────────────────────────
  const addPoint = useCallback((latlng: L.LatLng) => {
    setHighlightPlanningAreaKey(null);
    setHighlightUploadedBoundaryKey(null);
    setPolygonSource("manual");
    setPolygonPoints((prev) =>
      polygonSourceRef.current === "planning-area"
        ? [[latlng.lat, latlng.lng]]
        : [...prev, [latlng.lat, latlng.lng]]
    );
  }, []);

  const movePoint = useCallback((index: number, latlng: L.LatLng) => {
    setHighlightUploadedBoundaryKey(null);
    setPolygonSource("manual");
    setPolygonPoints((prev) =>
      prev.map((point, pointIndex) =>
        pointIndex === index ? [latlng.lat, latlng.lng] : point
      )
    );
  }, []);

  const clearPolygon = useCallback(() => {
    setPolygonPoints([]);
    setPolygonSource(null);
    setRoads([]);
    setQueryError(null);
    setIsFallback(false);
    setHighlightPlanningAreaKey(null);
    setHighlightUploadedBoundaryKey(null);
    onSelectionChange([]);
    onPolygonChange([]);
  }, [onPolygonChange, onSelectionChange]);

  const selectPlanningArea = useCallback((area: PlanningAreaInBounds) => {
    setIsDrawing(false);
    setPolygonSource("planning-area");
    setQueryError(null);
    setIsFallback(false);
    setHighlightPlanningAreaKey(`${area.name}-${area.partIndex}`);
    setHighlightUploadedBoundaryKey(null);
    setPolygonPoints(area.coords);
    setMapFocusPoints(cloneCoords(area.coords));
  }, []);

  const selectUploadedBoundary = useCallback((boundary: UploadedBoundaryFeature) => {
    setIsDrawing(false);
    setPolygonSource("uploaded-shapefile");
    setQueryError(null);
    setIsFallback(false);
    setHighlightPlanningAreaKey(null);
    setHighlightUploadedBoundaryKey(boundary.key);
    setPolygonPoints(boundary.coords);
    setMapFocusPoints(cloneCoords(boundary.coords));
  }, []);

  const clearUploadedBoundaries = useCallback(() => {
    if (polygonSourceRef.current === "uploaded-shapefile") {
      clearPolygon();
    }
    setUploadedBoundaries([]);
    setUploadedBoundaryName(null);
    setUploadedBoundaryError(null);
    setHighlightUploadedBoundaryKey(null);
  }, [clearPolygon]);

  const handleBoundaryFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const sourceFile = files.find((file) => file.name.toLowerCase().endsWith(".shp") || file.name.toLowerCase().endsWith(".zip"));
    if (!sourceFile) {
      const message = "Upload a .zip shapefile or a .shp file with its companion files (.dbf, .shx, .prj).";
      setUploadedBoundaryError(message);
      toaster.create({ title: "Boundary import failed", description: message, type: "warning" });
      return;
    }

    setUploadedBoundaryLoading(true);
    setUploadedBoundaryError(null);

    try {
      clearPolygon();
      const geojson = await previewUploadedShapefiles(files);
      const boundaries = extractUploadedBoundaryFeatures(geojson);
      if (boundaries.length === 0) {
        throw new Error("No polygon features were found in the uploaded shapefile.");
      }

      setUploadedBoundaryName(sourceFile.name);
      setUploadedBoundaries(boundaries);
      setHighlightUploadedBoundaryKey(null);
      setMapFocusPoints(cloneCoords(boundaries.flatMap((boundary) => boundary.coords)));

      if (boundaries.length === 1) {
        selectUploadedBoundary(boundaries[0]);
        toaster.create({
          title: "Boundary imported",
          description: `${sourceFile.name} was imported and its only polygon was selected automatically.`,
          type: "success",
        });
      } else {
        toaster.create({
          title: "Boundary imported",
          description: `${sourceFile.name} was imported. Click one of the polygons on the map to use it.`,
          type: "success",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import boundary shapefile.";
      setUploadedBoundaries([]);
      setUploadedBoundaryName(null);
      setUploadedBoundaryError(message);
      toaster.create({ title: "Boundary import failed", description: message, type: "error" });
    } finally {
      setUploadedBoundaryLoading(false);
    }
  }, [clearPolygon, selectUploadedBoundary]);

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
      roadsRef.current = [];
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
        const mapped = mergeRoadSelection(roadsRef.current, result, fallback);
        setRoads(mapped);
        roadsRef.current = mapped;
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
  }, [onPolygonChange, onSelectionChange, polygonPoints, refreshKey]);

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

  const deselectUnavailable = useCallback(() => {
    setRoads((prev) => {
      const next = prev.map((road) =>
        road.selected && !road.exists ? { ...road, selected: false } : road
      );
      onSelectionChange(next);
      return next;
    });
  }, [onSelectionChange]);

  const allSelected = roads.length > 0 && roads.every((r) => r.selected);
  const selectedUnavailableCount = roads.filter((road) => road.selected && !road.exists).length;
  const toolbarStatus = isDrawing
    ? "Click on the map to place vertices. Draw at least 3 points."
    : polygonSource === "manual" && polygonPoints.length > 0
      ? "Drag the red vertices to fine-tune a manually drawn polygon."
    : showRoadOverlay && overlayLoading
      ? "Loading roads..."
      : showPlanningAreaOverlay && planningAreaLoading
        ? "Loading planning areas..."
        : null;

  let roadStatus: { text: string; color: string } | null = null;
  if (querying) {
    roadStatus = { text: "Searching for roads...", color: "gray.500" };
  } else if (queryError) {
    roadStatus = { text: queryError, color: "red.500" };
  } else if (polygonPoints.length >= 3 && roads.length === 0) {
    roadStatus = { text: "No roads found in selected area.", color: "gray.500" };
  } else if (showPlanningAreaOverlay && !planningAreaLoading && viewportState && viewportState.zoom < 10) {
    roadStatus = { text: "Zoom in to level 10 or above to view planning areas.", color: "gray.500" };
  }

  const uploadedBoundaryStatus = uploadedBoundaryLoading
    ? { text: "Importing shapefile boundary...", color: "blue.500" }
    : uploadedBoundaryError
      ? { text: uploadedBoundaryError, color: "red.500" }
      : uploadedBoundaries.length > 0
        ? {
            text: polygonSource === "uploaded-shapefile"
              ? `Using uploaded boundary from ${uploadedBoundaryName ?? "shapefile"}.`
              : `Imported ${uploadedBoundaryName ?? "shapefile"}. Click a polygon on the map to use it.`,
            color: "blue.600",
          }
        : null;

  // ── Render ──────────────────────────────────────────────────────
  return (
    <Box>
      {/* Toolbar */}
      <Flex mb={2} gap={2} alignItems="center" wrap="wrap">
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

        <Button
          size="sm"
          variant={showRoadOverlay ? "solid" : "outline"}
          colorPalette={showRoadOverlay ? "blue" : "gray"}
          onClick={() => setShowRoadOverlay((v) => !v)}
        >
          <FaRoad />
          <Text ml={1}>{showRoadOverlay ? "Hide Roads" : "Show Roads"}</Text>
        </Button>

        <Button
          size="sm"
          variant={showPlanningAreaOverlay ? "solid" : "outline"}
          colorPalette={showPlanningAreaOverlay ? "teal" : "gray"}
          onClick={() => setShowPlanningAreaOverlay((v) => !v)}
        >
          <FaMapMarkedAlt />
          <Text ml={1}>{showPlanningAreaOverlay ? "Hide Planning Areas" : "Show Planning Areas"}</Text>
        </Button>

        <Button
          size="sm"
          variant={uploadedBoundaries.length > 0 ? "solid" : "outline"}
          colorPalette={uploadedBoundaries.length > 0 ? "orange" : "gray"}
          loading={uploadedBoundaryLoading}
          onClick={() => fileInputRef.current?.click()}
        >
          <FaFileImport />
          <Text ml={1}>{uploadedBoundaries.length > 0 ? "Replace Shapefile" : "Import Shapefile"}</Text>
        </Button>

        {uploadedBoundaries.length > 0 && (
          <Button size="sm" variant="outline" colorPalette="orange" onClick={clearUploadedBoundaries}>
            <FaTrash />
            <Text ml={1}>Clear Imported</Text>
          </Button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={SHAPEFILE_ACCEPT}
          multiple
          onChange={handleBoundaryFileChange}
          style={{ display: "none" }}
        />
      </Flex>

      <Box minH="36px" mb={2}>
        {toolbarStatus && (
          <Text fontSize="xs" color="gray.500">
            {toolbarStatus}
          </Text>
        )}
        {uploadedBoundaryStatus && (
          <Text fontSize="xs" color={uploadedBoundaryStatus.color} mt={toolbarStatus ? 1 : 0}>
            {uploadedBoundaryStatus.text}
          </Text>
        )}
      </Box>

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
          <MapBoundsFitter points={mapFocusPoints} />
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
          {uploadedBoundaries.map((boundary) => {
            const isHighlighted = highlightUploadedBoundaryKey === boundary.key;
            return (
              <LeafletPolygon
                key={boundary.key}
                positions={boundary.coords}
                pathOptions={{
                  color: isHighlighted ? "#C2410C" : "#EA580C",
                  weight: isHighlighted ? 3 : 1.5,
                  opacity: 0.95,
                  fillColor: isHighlighted ? "#FB923C" : "#FDBA74",
                  fillOpacity: isHighlighted ? 0.28 : 0.14,
                }}
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e as any);
                    selectUploadedBoundary(boundary);
                  },
                }}
              >
                <Popup>
                  <Text fontSize="sm" fontWeight="semibold">{boundary.label}</Text>
                  <Text fontSize="xs" color="orange.700">Imported boundary</Text>
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
          {polygonSource === "manual" && polygonPoints.map((point, index) => (
            <Marker
              key={`polygon-point-${index}-${point[0]}-${point[1]}`}
              position={point}
              icon={polygonVertexIcon}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const latlng = (event.target as L.Marker).getLatLng();
                  movePoint(index, latlng);
                },
              }}
            />
          ))}
        </MapContainer>
      </Box>

      <Box minH="24px" mt={2}>
        {roadStatus && (
          <Text fontSize="sm" color={roadStatus.color}>
            {roadStatus.text}
          </Text>
        )}
      </Box>

      {roads.length > 0 && !isFallback && (
        <Box mt={3}>
          <Flex justifyContent="space-between" alignItems="center" mb={2}>
            <Text fontSize="sm" fontWeight="bold">
              Roads Found ({roads.filter((r) => r.selected).length}/{roads.length} selected)
            </Text>
            <HStack gap={2}>
              {selectedUnavailableCount > 0 && (
                <Button size="xs" variant="ghost" colorPalette="orange" onClick={deselectUnavailable}>
                  Deselect Unavailable
                </Button>
              )}
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
