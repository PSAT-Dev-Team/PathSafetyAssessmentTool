import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Text, Tabs, Button, Flex, HStack, createListCollection, Combobox, Portal, Input, IconButton, Dialog } from "@chakra-ui/react";
import { toaster } from "../../../components/ui/toaster";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents, Polygon as LeafletPolygon, Polyline as LeafletPolyline, Marker } from "react-leaflet";
import { FaDrawPolygon, FaMousePointer, FaPlus, FaTrash } from "react-icons/fa";
import { Slider } from "../../../components/ui/slider";
import { NUMERIC_FILTER_ATTRIBUTES, ATTRIBUTE_OPTIONS, ATTRIBUTE_LABELS, CYCLERAP_ATTRIBUTE_CONFIGS, getCategoryColor, SUBCATEGORY_MAP, MULTI_VALUE_ATTRS, SUBCATEGORY_CHILD_ATTRS } from "./AttributesDropdown";
import { AddSegmentsDialog } from "./AddSegmentsDialog";
import { Menu } from "@chakra-ui/react";
import { MapCursorController } from "../../../components/common/MapCursorController";

import "leaflet/dist/leaflet.css";
import L, { divIcon } from "leaflet";
import proj4 from "proj4";
import type { Feature, LineString, Position } from "geojson";
import { fetchProjectAttributes, fetchProjectGeoJSON, fetchAttributeMappings, calculateScore, downloadFilteredImages, deleteSegment, deleteSegmentsBatch, type AttributeRow } from "../../../api";
import { RISK_BAND_COLORS } from "../../../components/visualization/scoreband/colorConstants";

// --- EPSG:3414 (SVY21 / Singapore TM) definition -> EPSG:4326 ---
proj4.defs(
  "EPSG:3414",
  "+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs"
);



const to4326 = (p: Position): [number, number] => {
  const [lon, lat] = proj4("EPSG:3414", "EPSG:4326", p as [number, number]) as [number, number];
  return [lat, lon];
};

// Component to pan to specific bounds
function PanToBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [bounds, map]);
  return null;
}

// Component to auto-fit bounds based on points - only on initial load
function FitBounds({ points, shouldFit }: { points: [number, number][]; shouldFit: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length || !shouldFit) return;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [points, map, shouldFit]);
  return null;
}

// Helper: Point in Polygon Algorithm (Ray Casting)
function isPointInPolygon(point: [number, number], vs: [number, number][]) {
  // point: [lat, lon], vs: [[lat, lon], ...]
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

interface PolygonDrawingToolProps {
  isPolygonMode: boolean;
  isPolygonAddMode: boolean;
  onPolygonPoint: (latlng: L.LatLng) => void;
  onPointUpdate: (index: number, latlng: L.LatLng) => void;
  polygonPoints: [number, number][];
}

interface DraggableMarkerProps {
  position: [number, number];
  index: number;
  color: string;
  icon: L.DivIcon;
  onDrag: (index: number, latlng: L.LatLng) => void;
  onDragEnd: (index: number, latlng: L.LatLng) => void;
}

function DraggableMarker({ position, index, color, icon, onDrag, onDragEnd }: DraggableMarkerProps) {
  const eventHandlers = useMemo(
    () => ({
      drag: (e: L.LeafletEvent) => {
        const marker = e.target;
        const pos = marker.getLatLng();
        onDrag(index, pos);
      },
      dragend: (e: L.LeafletEvent) => {
        const marker = e.target;
        const pos = marker.getLatLng();
        onDragEnd(index, pos);
      },
      click: (e: L.LeafletEvent) => {
        L.DomEvent.stopPropagation(e as any);
      },
    }),
    [index, onDrag, onDragEnd]
  );

  return (
    <Marker
      position={position}
      draggable={true}
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
}

function PolygonDrawingTool({ isPolygonMode, isPolygonAddMode, onPolygonPoint, onPointUpdate, polygonPoints }: PolygonDrawingToolProps) {
  const modeRef = useRef(false);
  const polygonRef = useRef<L.Polygon>(null);
  const polylineRef = useRef<L.Polyline>(null);

  // Keep latest points in a ref for access inside drag handler without re-binding
  const pointsRef = useRef(polygonPoints);
  useEffect(() => {
    pointsRef.current = polygonPoints;
  }, [polygonPoints]);

  useEffect(() => {
    modeRef.current = isPolygonMode || isPolygonAddMode;
  }, [isPolygonMode, isPolygonAddMode]);

  useMapEvents({
    click(e) {
      if (modeRef.current) {
        onPolygonPoint(e.latlng);
      }
    },
  });

  const handleDrag = useCallback((index: number, latlng: L.LatLng) => {
    // Imperatively update the polygon/polyline shape during drag for performance
    const currentPoints = pointsRef.current;
    if (!currentPoints) return;

    // Create new array with updated point
    const newPoints = [...currentPoints];
    newPoints[index] = [latlng.lat, latlng.lng];

    // Convert to Leaflet LatLng objects to be safe
    const latLngs = newPoints.map(p => L.latLng(p[0], p[1]));

    // Update Leaflet layers directly
    if (polygonRef.current) {
      polygonRef.current.setLatLngs(latLngs);
    }
    if (polylineRef.current) {
      polylineRef.current.setLatLngs(latLngs);
    }
  }, []);

  const handleDragEnd = useCallback((index: number, latlng: L.LatLng) => {
    // Commit the change to state on drag end
    onPointUpdate(index, latlng);
  }, [onPointUpdate]);

  const color = isPolygonAddMode ? "blue" : "red";

  // Custom icon to mimic CircleMarker but allow dragging
  const createCustomIcon = (color: string) => {
    return divIcon({
      className: "custom-polygon-marker",
      html: `<div style="
        background-color: ${color};
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 0 4px rgba(0,0,0,0.4);
        cursor: grab;
      "></div>`,
      iconSize: [20, 20], // Hit box size
      iconAnchor: [10, 10], // Centered (half of 20)
    });
  };

  const icon = useMemo(() => createCustomIcon(color), [color]);

  if (polygonPoints.length === 0) return null;

  return (
    <>
      {polygonPoints.map((pt, idx) => (
        <DraggableMarker
          key={`poly-point-${idx}`}
          position={pt}
          index={idx}
          color={color}
          icon={icon}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
        />
      ))}
      <LeafletPolyline
        ref={polylineRef}
        positions={polygonPoints}
        pathOptions={{ color: color, dashArray: "5, 5" }}
      />
      {polygonPoints.length >= 3 && (
        <LeafletPolygon
          ref={polygonRef}
          positions={polygonPoints}
          pathOptions={{ color: color, fillOpacity: 0.2 }}
        />
      )}
    </>
  );
}

interface AttributeAnalysisMapViewProps {
  selectedProjects: string[];
  selectedAttributes: string[];
  onChartDataUpdate?: (data: {
    categoryDistributionData: { category: string; count: number; color: string }[];
    primaryFocusAttribute: string | null;
    categoryStatus: { attribute: string; categories: { category: string; isActive: boolean; color: string }[] }[];
  }) => void;
}


type ProjectData = {
  projectName: string;
  geoFeatures: Feature<LineString, any>[];
  attributes: AttributeRow[];
  scores: Record<string, any>[]; // Raw crash type scores (BB, SB, VB, BP)
  color: string;
};

export default function AttributeAnalysisMapView({ selectedProjects, selectedAttributes, onChartDataUpdate }: AttributeAnalysisMapViewProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>("map");
  const [projectsData, setProjectsData] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [panToBounds, setPanToBounds] = useState<L.LatLngBounds | null>(null);
  const [attrMappings, setAttrMappings] = useState<Record<string, Record<string, string>>>({});

  // Category toggle states — tracks per-attribute per-value visibility
  const [categoryToggles, setCategoryToggles] = useState<Record<string, Record<string, boolean>>>(() => {
    try {
      const stored = sessionStorage.getItem("pathAnalysisMap_categoryToggles");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  // Subcategory toggle states — tracks per-child-attr per-value visibility (Layer 3)
  const [subcategoryToggles, setSubcategoryToggles] = useState<Record<string, Record<string, boolean>>>(() => {
    try {
      const stored = sessionStorage.getItem("pathAnalysisMap_subcategoryToggles");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  // Range filter states for numeric attributes
  const [rangeFilters, setRangeFilters] = useState<Record<string, [number, number]>>(() => {
    try {
      const stored = sessionStorage.getItem("pathAnalysisMap_rangeFilters");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  // Track which attribute to show categories for in the sidebar
  const [categoryFilterAttributeIndex, setCategoryFilterAttributeIndex] = useState<number>(() => {
    try {
      const stored = sessionStorage.getItem("pathAnalysisMap_categoryFilterIndex");
      return stored ? Number(stored) : 0;
    } catch { return 0; }
  });

  // Track if we should auto-fit bounds (only on initial project load, not on category changes)
  const [shouldAutoFit, setShouldAutoFit] = useState(false);

  // Track which attribute is the primary focus for coloring
  const [primaryFocusAttribute, setPrimaryFocusAttribute] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("pathAnalysisMap_primaryFocus") || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    sessionStorage.setItem("pathAnalysisMap_categoryToggles", JSON.stringify(categoryToggles));
  }, [categoryToggles]);

  useEffect(() => {
    sessionStorage.setItem("pathAnalysisMap_subcategoryToggles", JSON.stringify(subcategoryToggles));
  }, [subcategoryToggles]);

  useEffect(() => {
    sessionStorage.setItem("pathAnalysisMap_rangeFilters", JSON.stringify(rangeFilters));
  }, [rangeFilters]);

  useEffect(() => {
    sessionStorage.setItem("pathAnalysisMap_categoryFilterIndex", String(categoryFilterAttributeIndex));
  }, [categoryFilterAttributeIndex]);

  useEffect(() => {
    if (primaryFocusAttribute) {
      sessionStorage.setItem("pathAnalysisMap_primaryFocus", primaryFocusAttribute);
    } else {
      sessionStorage.removeItem("pathAnalysisMap_primaryFocus");
    }
  }, [primaryFocusAttribute]);

  // When all filters are reset, revert coloring to by-project
  useEffect(() => {
    if (selectedAttributes.length === 0) {
      setPrimaryFocusAttribute("Project");
    }
  }, [selectedAttributes]);

  // Mode states (Single Point & Polygon)
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isPointAddMode, setIsPointAddMode] = useState(false);
  const [isPolygonMode, setIsPolygonMode] = useState(false);
  const [isPolygonAddMode, setIsPolygonAddMode] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);

  // Selection states
  const [segmentToDelete, setSegmentToDelete] = useState<{ projectName: string; index: number } | null>(null);
  const [segmentsToDelete, setSegmentsToDelete] = useState<{ projectName: string; index: number }[]>([]);
  const [segmentToAdd, setSegmentToAdd] = useState<{ projectName: string; index: number } | null>(null);
  const [segmentsToAdd, setSegmentsToAdd] = useState<{ projectName: string; indices: number[] }[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dialog states
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [isAddSegmentsDialogOpen, setIsAddSegmentsDialogOpen] = useState(false);

  // Table filtering and sorting state
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<Array<{ column: string; direction: 'asc' | 'desc' }>>([]);

  // Handlers for Polygon Tool
  const handlePolygonPoint = (latlng: L.LatLng) => {
    setPolygonPoints((prev) => [...prev, [latlng.lat, latlng.lng]]);
  };

  const handlePointUpdate = useCallback((index: number, latlng: L.LatLng) => {
    setPolygonPoints((prev) => {
      const newPoints = [...prev];
      newPoints[index] = [latlng.lat, latlng.lng];
      return newPoints;
    });
  }, []);

  const finishPolygonSelection = () => {
    console.log("finishPolygonSelection called");
    if (polygonPoints.length < 3) {
      toaster.create({ title: "Invalid Polygon", description: "Please select at least 3 points.", type: "error" });
      return;
    }

    // Identify points inside polygon
    const toDelete: { projectName: string; index: number }[] = [];

    // Iterate through all visible points (allPoints)
    // Note: This operates on the *filtered* view if we use filteredData, or all loaded points if we use allPoints.
    // Usually, users expect to delete what they see. Let's use allPoints to be safe, or filteredData? 
    // Given the visual nature, 'allPoints' corresponds to what's loaded. 
    // But if 'filteredData' is used for display, we should probably stick to visible points?
    // Let's us 'allPoints' but check if they are visible? Or simplified: just check all loaded points.
    // The user draws on the map, so they select geographically. 

    allPoints.forEach((pt) => {
      // pt.latlng is [lat, lon]
      if (isPointInPolygon(pt.latlng, polygonPoints)) {
        toDelete.push({ projectName: pt.projectName, index: pt.idx });
      }
    });

    if (toDelete.length === 0) {
      toaster.create({ title: "No points selected", description: "No points found inside the drawn polygon.", type: "info" });
      setPolygonPoints([]); // Reset
      return;
    }

    setSegmentsToDelete(toDelete);
    setDeleteConfirmationOpen(true);
  };

  const handleBatchDelete = async () => {
    if (segmentsToDelete.length === 0) return;
    setIsDeleting(true);

    try {
      // Group by project
      const byProject: Record<string, number[]> = {};
      segmentsToDelete.forEach(({ projectName, index }) => {
        if (!byProject[projectName]) byProject[projectName] = [];
        byProject[projectName].push(index);
      });

      // Execute batch delete for each project
      await Promise.all(
        Object.entries(byProject).map(async ([project, indices]) => {
          await deleteSegmentsBatch(project, indices);
        })
      );

      toaster.create({ title: "Batch Delete Successful", description: `Deleted ${segmentsToDelete.length} segments.`, type: "success" });

      // Cleanup UI
      setSegmentsToDelete([]);
      setPolygonPoints([]);
      setDeleteConfirmationOpen(false);
      setIsPolygonMode(false); // Optimize: exit mode or stay? Usually exit.

      // Refresh data
      // For simplicity, re-trigger the data fetch by toggling a dependency or calling a refresh function.
      // Since 'selectedProjects' is a dependency of the main useEffect, we can just force a re-run?
      // Or better: clear projectsData and it will reload because selectedProjects hasn't changed? 
      // Actually, if we just setProjectsData([]) it might show empty. 
      // We can create a refresh trigger state.
      setRefreshTrigger(prev => prev + 1);

      // Dispatch event to update charts (AggregatedScoreBandPanel)
      window.dispatchEvent(new Event("psat:scores:updated"));

    } catch (e: any) {
      toaster.create({ title: "Deletion Failed", description: e.message, type: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSegment = async () => {
    if (!segmentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSegment(segmentToDelete.projectName, segmentToDelete.index);
      toaster.create({ title: "Segment Deleted", type: "success" });
      setSegmentToDelete(null);
      setDeleteConfirmationOpen(false);
      setRefreshTrigger(prev => prev + 1);

      // Dispatch event to update charts (AggregatedScoreBandPanel)
      window.dispatchEvent(new Event("psat:scores:updated"));
    } catch (e: any) {
      toaster.create({ title: "Deletion Failed", description: e.message, type: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Active filters = the attributes selected via FilterPanel (passed as prop)
  const activeFilters = useMemo(() => selectedAttributes, [selectedAttributes]);

  // Auto-focus the newest filter when one is added
  const prevFiltersRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = prevFiltersRef.current;
    const added = activeFilters.find(f => !prev.includes(f));
    if (added) {
      const idx = activeFilters.indexOf(added);
      setCategoryFilterAttributeIndex(idx);
      setPrimaryFocusAttribute(added);
    }
    prevFiltersRef.current = activeFilters;
  }, [activeFilters]);

  // Reset sidebar index if out of bounds
  useEffect(() => {
    if (categoryFilterAttributeIndex >= activeFilters.length) {
      setCategoryFilterAttributeIndex(0);
    }
  }, [activeFilters.length, categoryFilterAttributeIndex]);

  // Load attribute mappings on mount
  useEffect(() => {
    fetchAttributeMappings()
      .then(mappings => {
        // Ensure adequacy-mapped attributes are always present (backend may omit them)
        const adequacyMap: Record<string, string> = { "1": "Adequate", "2": "Inadequate" };
        if (!mappings["Line of Sight"]) mappings["Line of Sight"] = adequacyMap;
        if (!mappings["Facility access"]) mappings["Facility access"] = adequacyMap;
        setAttrMappings(mappings);
      })
      .catch(() => {
        // Minimal fallback so at least adequacy attributes work offline
        setAttrMappings({
          "Line of Sight": { "1": "Adequate", "2": "Inadequate" },
          "Facility access": { "1": "Adequate", "2": "Inadequate" },
        });
      });
  }, []);

  // Get color for a specific crash type score based on thresholds
  const getScoreColor = (score: number, type: string = "VB"): string => {
    // BB, BP, SB use stricter thresholds
    if (['BB', 'BP', 'SB'].includes(type)) {
      if (score < 5) return RISK_BAND_COLORS.LOW;
      if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
      if (score <= 20) return RISK_BAND_COLORS.HIGH;
      return RISK_BAND_COLORS.EXTREME;
    }

    // VB and others (default)
    if (score < 10) return RISK_BAND_COLORS.LOW;
    if (score <= 25) return RISK_BAND_COLORS.MEDIUM;
    if (score <= 60) return RISK_BAND_COLORS.HIGH;
    return RISK_BAND_COLORS.EXTREME;
  };

  // Initialize default toggles for all active filters when they change
  useEffect(() => {
    setCategoryToggles(prev => {
      const updated = { ...prev };
      for (const filterAttr of activeFilters) {
        if (!updated[filterAttr]) updated[filterAttr] = {};
      }
      return updated;
    });
  }, [activeFilters]);

  // The attribute whose categories are currently shown in the sidebar
  const categoryFilterAttribute = activeFilters[categoryFilterAttributeIndex];

  // Helper function to get Overall Risk Score for a segment
  // Uses the "Overall Risk Level" field from the backend, which is the sum of BB + BP + SB + VB
  const getOverallRiskScore = (projectDataIndex: number, segmentIndex: number): number => {
    if (projectDataIndex >= projectsData.length || !projectsData[projectDataIndex].scores) {
      return 0;
    }
    const segmentScores = projectsData[projectDataIndex].scores[segmentIndex];
    if (!segmentScores) {
      return 0;
    }
    // Use the "Overall Risk Level" field which is the actual CycleRAP composite score
    const overallRiskLevel = segmentScores["Overall Risk Level"];
    return typeof overallRiskLevel === 'number' ? overallRiskLevel : 0;
  };

  // Define table columns
  const tableColumns = useMemo(() => {
    const cols = [
      { key: "Project", label: "Project" },
      { key: "Segment #", label: "Segment #" },
      { key: "Image Reference", label: "Image Reference" },
      { key: "Coordinates", label: "Coordinates" },
      ...activeFilters.map(attr => ({ key: attr, label: ATTRIBUTE_LABELS[attr] ?? attr })),
      { key: "Overall Risk Score", label: "Overall Risk Score" }
    ];
    return cols;
  }, [activeFilters]);


  // Helper function to convert numeric attribute value to text using mappings
  const getAttrText = (attrName: string, attrValue: any): string => {
    // Subcategory child attrs: null/empty/undefined → "None"
    if (SUBCATEGORY_CHILD_ATTRS.has(attrName)) {
      if (attrValue === null || attrValue === undefined || attrValue === "" || attrValue === "null") {
        return "None";
      }
    }

    // Generic null/empty handling — map to "Not Present" if the attribute supports it
    if (attrValue === null || attrValue === undefined || attrValue === "" || String(attrValue).toLowerCase() === "null") {
      const opts = ATTRIBUTE_OPTIONS[attrName];
      if (opts && opts.includes("Not Present")) return "Not Present";
      return ""; // no valid category — exclude this segment from toggle counts
    }

    // Handle safety score band values (VB Band, BB Band, SB Band, BP Band)
    // These map to exactly 4 categories based on score thresholds:
    // Low: <10, Medium: 10-25, High: 25-60, Extreme: >60
    if (["VB Band", "BB Band", "SB Band", "BP Band"].includes(attrName)) {
      const numValue = Number(attrValue);
      if (isNaN(numValue)) {
        return "Low"; // Default to Low if invalid
      }

      // Map backend bands to frontend categories: Low, Medium, High, Extreme
      // Note: Band 5 may still exist in old data, map it to Extreme
      const riskCategoryMap: Record<number, string> = {
        1: "Low",      // Band 1: score <10
        2: "Medium",   // Band 2: score 10-25
        3: "High",     // Band 3: score 25-60
        4: "Extreme",  // Band 4: score >60
        5: "Extreme",  // Band 5 (legacy): score >60 - treat same as Band 4
      };

      return riskCategoryMap[numValue] || "Low"; // Default to Low if unknown
    }

    // Special handling for Overall Risk Level - calculated from actual score, not a band index
    if (attrName === "Overall Risk Level") {
      // This shouldn't happen as Overall Risk Level is calculated in the filter logic,
      // but handle it gracefully just in case
      const scoreValue = Number(attrValue);
      if (isNaN(scoreValue)) return "Low";
      if (scoreValue < 10) return "Low";
      if (scoreValue <= 25) return "Medium";
      if (scoreValue <= 60) return "High";
      return "Extreme";
    }

    // If we have a mapping for this attribute, apply it (handles both string and number values from CSV)
    if (attrMappings[attrName]) {
      const key = String(attrValue);
      if (attrMappings[attrName][key]) {
        return attrMappings[attrName][key];
      }
      // Try numeric key if string key didn't work
      const numKey = Number(attrValue);
      if (!isNaN(numKey) && attrMappings[attrName][String(numKey)]) {
        return attrMappings[attrName][String(numKey)];
      }
      // Fall through to return raw value
    }

    return String(attrValue);
  };


  // Generate distinct colors for each project
  const projectColors = useMemo(() => {
    const colors = [
      "#2563EB", // Blue
      "#DC2626", // Red
      "#16A34A", // Green
      "#CA8A04", // Yellow
      "#9333EA", // Purple
      "#EA580C", // Orange
      "#0891B2", // Cyan
      "#DB2777", // Pink
    ];
    const colorMap: Record<string, string> = {};
    selectedProjects.forEach((proj, idx) => {
      colorMap[proj] = colors[idx % colors.length];
    });
    return colorMap;
  }, [selectedProjects]);

  // Load geodata and attributes for all selected projects
  useEffect(() => {
    if (selectedProjects.length === 0) {
      setProjectsData([]);
      return;
    }

    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const promises = selectedProjects.map(async (projectName) => {
          // Fetch geodata and attributes (required)
          const [geoJson, attrResponse] = await Promise.all([
            fetchProjectGeoJSON(projectName),
            fetchProjectAttributes(projectName),
          ]);

          // Fetch scores (optional - if fails, continue with empty scores)
          let scores: Record<string, any>[] = [];
          try {
            const scoresResponse = await calculateScore(projectName);
            scores = scoresResponse.result_rows || [];
          } catch (e) {
          }

          return {
            projectName,
            geoFeatures: geoJson.features as Feature<LineString, any>[],
            attributes: attrResponse.rows,
            scores: scores,
            color: projectColors[projectName],
          };
        });

        const results = await Promise.all(promises);
        if (!aborted) {
          setProjectsData(results);
          // Enable auto-fit when new projects are loaded
          setShouldAutoFit(true);
          // Reset after a short delay to allow the fit to happen
          setTimeout(() => setShouldAutoFit(false), 500);
        }
      } catch (e: any) {
        if (!aborted) setErr(e?.message ?? "Failed to load data");
      } finally {
        if (!aborted) setLoading(false);
      }
    })();

    return () => { aborted = true; };
  }, [selectedProjects, projectColors, refreshTrigger]);

  // Generate colors for attribute categories based on safety implications
  const attributeCategoryColors = useMemo(() => {
    if (!primaryFocusAttribute) return {};

    const categoryColors: Record<string, string | Record<string, string>> = {
      // Safety Score Band colors (CycleRAP Risk Bands) - Only 4 categories
      "Low": "#87C424", // Green (CycleRAP Low)
      "Medium": "#FFCC1A", // Yellow (CycleRAP Medium)
      "High": "#FF5B1A", // Orange (CycleRAP High)
      "Extreme": "#CD1AFF", // Purple (CycleRAP Extreme)

      // Facility configuration - attributes where Present = Danger (Red), Not Present = Safe (Green)
      "Adjacent Sidewalk 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Road Lane 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Vehicle Parking 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Severe Hazard 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent object or level change 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Road Lane 1-3m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Vehicle Parking 1-3m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Severe Hazard 1-3m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent object or level change 1-3m": { "Present": "#DC2626", "Not Present": "#16A34A" },

      // Facility clear width - attributes where Present = Danger (Red), Not Present = Safe (Green)
      "Line of Sight": { "Adequate": "#16A34A", "Inadequate": "#DC2626" },
      "Fixed Obstacle on Facility": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Non-Fixed Obstacle on Facility": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Width Restriction": { "Present": "#DC2626", "Not Present": "#16A34A" },

      // Light Segregation - Present = Safe (Green), Not Present = Danger (Red)
      "Light Segregation": { "Present": "#16A34A", "Not Present": "#DC2626" },

      // Facility configuration - Adequate = Safe (Green), Inadequate = Danger (Red)
      "Facility access": { "Adequate": "#16A34A", "Inadequate": "#DC2626" },

      // Facility surface conditions - attributes where Present = Danger (Red), Not Present = Safe (Green)
      "Loose or slippery surface": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Major Surface Deformation or Drain Opening": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Tram or Train Rails": { "Present": "#DC2626", "Not Present": "#16A34A" },

      // Facility surface conditions - Present = Safe (Green), Not Present = Danger (Red)
      "Delineation": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Street Lighting": { "Present": "#16A34A", "Not Present": "#DC2626" },

      // Facility surface conditions - Grade (Safe = Green, Dangerous = Red)
      "Grade": { "< 5 Degrees": "#16A34A", "=/> 5 Degrees": "#DC2626" },

      // Facility surface conditions - Curvature
      "Curvature": { "No Sharp Turn Present": "#16A34A", "Sharp Turn Present": "#DC2626" },

      // Facility clear width - Width
      "Facility Width per Direction": { "Wide": "#16A34A", "Narrow": "#FFCC1A", "Very Narrow": "#DC2626" },

      // Flow & Speed - Flow
      "Peak pedestrian flow along or across facility": { "None": "#6B7280", "Low": "#16A34A", "Moderate to high": "#DC2626" },
      "Peak bicycle/LV traffic flow": { "Low": "#16A34A", "Moderate to high": "#DC2626" },
      "Observed proportion of cargo bikes and mopeds": { "Low": "#16A34A", "Moderate to high": "#DC2626" },
      "Heavy vehicle flow": { "Low": "#16A34A", "Moderate to high": "#DC2626" },

      // Flow & Speed - Speed (Faster = more dangerous)
      "Bicycle/LV speed – average": { "< 20km/h": "#16A34A", "=/> 20km/h": "#DC2626" },
      "Bicycle/LV speed differential": { "< 10km/h": "#16A34A", "=/> 10km/h": "#DC2626" },

      // Intersection - attributes where Present = Safe (Green), Not Present = Danger (Red)
      "Intersection or Road Crossing": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Crossing Facility": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Pedestrian Crossing": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Intersecting Bicycle Facility": { "Present": "#16A34A", "Not Present": "#DC2626" },

      // Intersection - Property Access (Present = Danger, Not Present = Safe)
      "Property Access": { "Present": "#DC2626", "Not Present": "#16A34A" },

      // Intersection approach
      "Intersection Approach": { "Separate/NA": "#16A34A", "Shared": "#DC2626" },

      // Number of lanes (More = dangerous on adjacent road, Equal = safer)
      "Number of lanes – adjacent road": { "1 per Direction/NA": "#16A34A", "> 1 per Direction": "#DC2626" },
      "Number of lanes – intersecting road": { "1 per Direction/NA": "#16A34A", "> 1 per Direction": "#DC2626" },

      // Flow direction
      "Flow Direction": { "One Way": "#2563EB", "Two Way": "#9333EA" },

      // Facility Types
      "Facility Type": {
        "Sidewalk": "#2563EB",
        "Multi-Use Path": "#9333EA", // Purple
        "Off-Road Bicycle Path": "#16A34A", // Green
        "On-road Bicycle Lane": "#CA8A04",
        "Road Shoulder": "#F59E0B",
        "Mixed Traffic Road Lane": "#DC2626",
      },

      // Area type
      "Area type": {
        "Urban":        "#2563EB", // Blue
        "Suburban":     "#0891B2", // Cyan
        "Rural":        "#16A34A", // Green
        "Industrial":   "#EA580C", // Orange
        "Recreational": "#9333EA", // Purple
      },
    };
    const attributeColors = categoryColors[primaryFocusAttribute];
    if (typeof attributeColors === "object" && attributeColors !== null) {
      return attributeColors as Record<string, string>;
    }

    // For safety score bands (Low, Medium, High, Extreme), return the direct color mapping
    const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band", "Overall Risk Level"].includes(primaryFocusAttribute || "");
    if (isSafetyScore) {
      return {
        "Low": categoryColors["Low"] as string,
        "Medium": categoryColors["Medium"] as string,
        "High": categoryColors["High"] as string,
        "Extreme": categoryColors["Extreme"] as string,
      };
    }

    // For simple string-to-color mappings, return empty (handled by legend logic)
    return {} as Record<string, string>;
  }, [primaryFocusAttribute]);

  // Helper function to get column value as string
  function getColumnValue(point: any, columnKey: string): string {
    if (columnKey === "Project") return point.projectName;
    if (columnKey === "Segment #") return (point.idx + 1).toString();
    if (columnKey === "Image Reference") return point.f.properties?.["Image Reference"] ?? "-";
    if (columnKey === "Coordinates") return `${point.latlng[0].toFixed(6)}, ${point.latlng[1].toFixed(6)}`;
    if (columnKey === "Overall Risk Score") {
      const projectDataIndex = projectsData.findIndex(p => p.projectName === point.projectName);
      const score = getOverallRiskScore(projectDataIndex, point.idx);
      return score.toFixed(2);
    }
    if (columnKey === "Overall Risk Level") {
      const projectDataIndex = projectsData.findIndex(p => p.projectName === point.projectName);
      if (projectDataIndex < 0 || !projectsData[projectDataIndex].scores) {
        return "Low";
      }

      const segmentScores = projectsData[projectDataIndex].scores[point.idx];
      if (!segmentScores) {
        return "Low";
      }

      // Overall Risk Level = maximum category from the individual crash type bands
      // (same logic as Coding Page)
      let maxRiskLevel = 0; // 0: Low, 1: Med, 2: High, 3: Extreme

      // Optimize: If backend sends "Overall Risk Level Band", use it directly (1-4)
      if (segmentScores["Overall Risk Level Band"] !== undefined) {
        // Backend 1=Low (0), 2=Med (1), 3=High (2), 4=Extreme (3)
        maxRiskLevel = (segmentScores["Overall Risk Level Band"] as number) - 1;
      }

      if (maxRiskLevel === 3) return "Extreme";
      else if (maxRiskLevel === 2) return "High";
      else if (maxRiskLevel === 1) return "Medium";
      else return "Low";
    }

    // Dynamic attribute columns
    if (!point.attributes) return "-";
    const attrValue = point.attributes[columnKey];
    const result = getAttrText(columnKey, attrValue) || "-";

    return result;
  }

  // Compute actual min/max from data for each numeric filter attribute
  // Compute actual min/max from data for each numeric filter attribute (for sidebar slider bounds)
  const dataRangeBounds = useMemo(() => {
    const bounds: Record<string, { min: number; max: number }> = {};
    NUMERIC_FILTER_ATTRIBUTES.forEach(attr => {
      let min = Infinity;
      let max = -Infinity;
      projectsData.forEach(pd => {
        pd.attributes.forEach(row => {
          if (!row) return;
          const v = Number(row[attr]);
          if (!isNaN(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        });
      });
      bounds[attr] = {
        min: isFinite(min) ? min : 0,
        max: isFinite(max) ? max : 100,
      };
    });
    return bounds;
  }, [projectsData]);

  // Extract all points from all projects with their metadata
  const allPoints = useMemo(() => {
    const pts: {
      idx: number;
      latlng: [number, number];
      f: Feature<LineString, any>;
      attributes: AttributeRow;
      projectName: string;
      color: string;
      attributeValue: string;
    }[] = [];

    projectsData.forEach((projectData) => {
      projectData.geoFeatures.forEach((feature, i) => {
        const g = feature.geometry;
        if (g?.type === "LineString" && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
          // Get the corresponding attributes for this feature (by index)
          const attributes = projectData.attributes[i];

          if (attributes) {
            // Simple check: Does this segment have all active filter attributes with values?
            let matchesAllFilters = true;
            for (const filterAttr of activeFilters) {
              let attrValueText = "";

              if (filterAttr === "Project") {
                attrValueText = projectData.projectName;
              } else if (filterAttr === "Overall Risk Level") {
                if (projectData.scores && projectData.scores.length > i) {
                  const segmentScores = projectData.scores[i];
                  let maxRiskLevel = 0; // 0: Low, 1: Med, 2: High, 3: Extreme

                  // Optimize: If backend sends "Overall Risk Level Band", use it directly (1-4)
                  if (segmentScores["Overall Risk Level Band"] !== undefined) {
                    // Backend 1=Low (0), 2=Med (1), 3=High (2), 4=Extreme (3)
                    maxRiskLevel = (segmentScores["Overall Risk Level Band"] as number) - 1;
                  }

                  if (maxRiskLevel === 3) attrValueText = "Extreme";
                  else if (maxRiskLevel === 2) attrValueText = "High";
                  else if (maxRiskLevel === 1) attrValueText = "Medium";
                  else attrValueText = "Low";
                } else {
                  // Overall Risk Level selected but no scores available -> Low
                  attrValueText = "Low";
                }
              } else {
                // Generic attribute
                const attrValue = attributes[filterAttr];

                // Numeric range filter (Road AADT, Road operating speed)
                if (NUMERIC_FILTER_ATTRIBUTES.has(filterAttr)) {
                  const numVal = Number(attrValue);
                  const bounds = dataRangeBounds[filterAttr];
                  const [rMin, rMax] = rangeFilters[filterAttr] ?? [bounds?.min ?? 0, bounds?.max ?? 100];
                  if (isNaN(numVal) || numVal < rMin || numVal > rMax) {
                    matchesAllFilters = false;
                    break;
                  }
                  continue;
                }

                attrValueText = getAttrText(filterAttr, attrValue);
              }

              if (!attrValueText || attrValueText === "Not Selected") {
                matchesAllFilters = false;
                break;
              }

              // Check category toggles
              if (categoryToggles[filterAttr]) {
                if (categoryToggles[filterAttr][attrValueText] === false) {
                  matchesAllFilters = false;
                  break;
                }
              }

              // Check subcategory toggles (Layer 3)
              const subcatConfig = SUBCATEGORY_MAP[filterAttr];
              if (subcatConfig) {
                const childOptions = subcatConfig.parentCategories[attrValueText];
                if (childOptions && subcategoryToggles[subcatConfig.childAttr]) {
                  const childValue = getAttrText(subcatConfig.childAttr, attributes[subcatConfig.childAttr]);
                  if (childValue) {
                    if (MULTI_VALUE_ATTRS.has(subcatConfig.childAttr) && childValue.includes(", ")) {
                      const parts = childValue.split(", ").map((s: string) => s.trim());
                      const anyEnabled = parts.some((part: string) => subcategoryToggles[subcatConfig.childAttr][part] !== false);
                      if (!anyEnabled) {
                        matchesAllFilters = false;
                        break;
                      }
                    } else if (subcategoryToggles[subcatConfig.childAttr][childValue] === false) {
                      matchesAllFilters = false;
                      break;
                    }
                  }
                }
              }
            }

            if (!matchesAllFilters) {
              return;
            }

            // Determine color based on primary focus attribute or project
            let pointColor = projectData.color; // Default to project color
            let attrValueText = "";

            if (primaryFocusAttribute === "Project") {
              // Use project color
              pointColor = projectData.color;
              attrValueText = projectData.projectName;
            } else if (primaryFocusAttribute) {
              // Check if it's a safety band attribute or Overall Risk Level
              const isSafetyBand = ["VB Band", "BB Band", "SB Band", "BP Band"].includes(primaryFocusAttribute);
              const isCycleRAPScore = primaryFocusAttribute === "Overall Risk Level";

              if ((isSafetyBand || isCycleRAPScore) && projectData.scores && projectData.scores.length > i) {
                // For safety bands and Overall Risk Level, use the score value
                const segmentScores = projectData.scores[i];

                let scoreValue = 0;
                if (isSafetyBand) {
                  // Map band name to crash type key (e.g., "SB Band" -> "SB")
                  let crashTypeKey = primaryFocusAttribute.replace(" Band", "");
                  scoreValue = segmentScores[crashTypeKey] || 0;

                  // Apply threshold to get color
                  pointColor = getScoreColor(scoreValue, crashTypeKey);

                  // Get text label
                  if (['BB', 'BP', 'SB'].includes(crashTypeKey)) {
                    if (scoreValue < 5) attrValueText = "Low";
                    else if (scoreValue <= 10) attrValueText = "Medium";
                    else if (scoreValue <= 20) attrValueText = "High";
                    else attrValueText = "Extreme";
                  } else {
                    if (scoreValue < 10) attrValueText = "Low";
                    else if (scoreValue <= 25) attrValueText = "Medium";
                    else if (scoreValue <= 60) attrValueText = "High";
                    else attrValueText = "Extreme";
                  }
                } else if (isCycleRAPScore) {
                  // For Overall Risk Level, calculate based on the highest risk category
                  let maxRiskLevel = 0; // 0: Low, 1: Med, 2: High, 3: Extreme

                  if (segmentScores["Overall Risk Level Band"] !== undefined) {
                    maxRiskLevel = (segmentScores["Overall Risk Level Band"] as number) - 1;
                  } else {
                    // Fallback
                    const crashTypes = ["BB", "BP", "SB", "VB"];
                    crashTypes.forEach((type) => {
                      const s = segmentScores[type] || 0;
                      let r = 0;
                      if (['BB', 'BP', 'SB'].includes(type)) {
                        if (s > 20) r = 3; else if (s > 10) r = 2; else if (s >= 5) r = 1; else r = 0;
                      } else {
                        if (s > 60) r = 3; else if (s > 25) r = 2; else if (s >= 10) r = 1; else r = 0;
                      }
                      if (r > maxRiskLevel) maxRiskLevel = r;
                    });
                  }

                  // Set color and text based on max risk level
                  switch (maxRiskLevel) {
                    case 3:
                      pointColor = RISK_BAND_COLORS.EXTREME;
                      attrValueText = "Extreme";
                      break;
                    case 2:
                      pointColor = RISK_BAND_COLORS.HIGH;
                      attrValueText = "High";
                      break;
                    case 1:
                      pointColor = RISK_BAND_COLORS.MEDIUM;
                      attrValueText = "Medium";
                      break;
                    default:
                      pointColor = RISK_BAND_COLORS.LOW;
                      attrValueText = "Low";
                      break;
                  }
                }
              } else {
                // Use attribute color for non-safety-band attributes
                const attrValue = attributes[primaryFocusAttribute];
                attrValueText = getAttrText(primaryFocusAttribute, attrValue);
                // Multi-value attributes: use first value for color coding
                if (MULTI_VALUE_ATTRS.has(primaryFocusAttribute) && attrValueText.includes(", ")) {
                  pointColor = getCategoryColor(primaryFocusAttribute, attrValueText.split(", ")[0].trim());
                } else {
                  pointColor = getCategoryColor(primaryFocusAttribute, attrValueText);
                }
              }
            }

            pts.push({
              idx: i,
              latlng: to4326(g.coordinates[0]),
              f: feature,
              attributes,
              projectName: projectData.projectName,
              color: pointColor,
              attributeValue: attrValueText,
            });
          }
        }
      });
    });

    return pts;
  }, [projectsData, primaryFocusAttribute, activeFilters, attrMappings, categoryToggles, subcategoryToggles, rangeFilters, dataRangeBounds]);

  const allLatLngs = useMemo(() => allPoints.map(p => p.latlng), [allPoints]);

  // Filter data with global search and per-column filters
  const filteredData = useMemo(() => {
    let result = allPoints;

    // Apply global search (OR across all columns)
    if (globalSearch.trim()) {
      const searchLower = globalSearch.toLowerCase().trim();
      result = result.filter(point => {
        return tableColumns.some(col => {
          const value = getColumnValue(point, col.key).toLowerCase();
          return value.includes(searchLower);
        });
      });
    }

    // Apply per-column filters (AND logic)
    Object.entries(columnFilters).forEach(([columnKey, filterValue]) => {
      if (filterValue.trim()) {
        const filterLower = filterValue.toLowerCase().trim();

        result = result.filter(point => {
          const value = getColumnValue(point, columnKey).toLowerCase();

          let matches = false;

          // Special handling for Facility Width per Direction - strict prefix match
          // This prevents "Very Narrow" from showing up when filtering for "Narrow" (starts with 'n')
          if (columnKey === "Facility Width per Direction") {
            matches = value.startsWith(filterLower);
          }
          // Special handling for Present/Not Present attributes
          else if (value === "present" || value === "not present") {
            // For Present/Not Present: use first-character matching
            if (!filterLower) {
              matches = true; // Empty filter shows all
            } else if (filterLower[0] === 'p') {
              matches = value === "present"; // 'p' matches only "present"
            } else if (filterLower[0] === 'n') {
              matches = value === "not present"; // 'n' matches only "not present"
            } else {
              matches = false; // Other characters don't match
            }
          } else {
            // For other attributes, use word-boundary matching
            if (value === filterLower) {
              matches = true; // Exact match
            } else if (value.startsWith(filterLower)) {
              matches = true; // Prefix match
            } else if (value.includes(` ${filterLower}`) || value.includes(`-${filterLower}`)) {
              matches = true; // Word boundary match
            }
          }

          return matches;
        });
      }
    });

    return result;
  }, [allPoints, globalSearch, columnFilters, tableColumns, projectsData, activeFilters, attrMappings]);

  // Sort data with multi-column sorting
  const sortedData = useMemo(() => {
    if (sortConfig.length === 0) return filteredData;

    return [...filteredData].sort((a, b) => {
      // Iterate through sort config in priority order
      for (const { column, direction } of sortConfig) {
        const aVal = getColumnValue(a, column);
        const bVal = getColumnValue(b, column);

        // Numeric comparison for Segment # and Overall Risk Score
        if (column === "Segment #" || column === "Overall Risk Score") {
          const aNum = parseFloat(aVal);
          const bNum = parseFloat(bVal);
          const numCompare = aNum - bNum;
          if (numCompare !== 0) {
            return direction === 'asc' ? numCompare : -numCompare;
          }
        }
        // Semantic comparison for Risk Levels (Low < Medium < High < Extreme)
        else if (column === "Overall Risk Level" || ["VB Band", "BB Band", "SB Band", "BP Band"].includes(column)) {
          const riskOrder = ["Low", "Medium", "High", "Extreme"];
          const aIndex = riskOrder.indexOf(aVal);
          const bIndex = riskOrder.indexOf(bVal);

          // If value not found (e.g. "-"), treat as lowest or handle separately
          // Here we treat unknown values as smaller than "Low"
          const aRank = aIndex === -1 ? -1 : aIndex;
          const bRank = bIndex === -1 ? -1 : bIndex;

          const rankCompare = aRank - bRank;
          if (rankCompare !== 0) {
            return direction === 'asc' ? rankCompare : -rankCompare;
          }
        }
        // Semantic comparison for Facility Width (Very Narrow < Narrow < Wide)
        else if (column === "Facility Width per Direction") {
          const widthOrder = ["Very Narrow", "Narrow", "Wide"];
          const aIndex = widthOrder.indexOf(aVal);
          const bIndex = widthOrder.indexOf(bVal);

          const aRank = aIndex === -1 ? -1 : aIndex;
          const bRank = bIndex === -1 ? -1 : bIndex;

          const rankCompare = aRank - bRank;
          if (rankCompare !== 0) {
            return direction === 'asc' ? rankCompare : -rankCompare;
          }
        }
        else {
          // String comparison for other columns
          const strCompare = aVal.localeCompare(bVal);
          if (strCompare !== 0) {
            return direction === 'asc' ? strCompare : -strCompare;
          }
        }
        // If equal, continue to next sort criterion
      }
      return 0; // All sort criteria equal
    });
  }, [filteredData, sortConfig]);

  // Get categories available in loaded data for the current sidebar attribute
  const availableCategories = useMemo(() => {
    if (!categoryFilterAttribute) return [];
    const categoriesInData = new Set<string>();

    projectsData.forEach((projectData) => {
      if (categoryFilterAttribute === "Project") {
        categoriesInData.add(projectData.projectName);
        return;
      }
      if (categoryFilterAttribute === "Overall Risk Level") {
        projectData.geoFeatures.forEach((_, i) => {
          if (projectData.scores && projectData.scores.length > i) {
            const segmentScores = projectData.scores[i];
            const bands = [
              segmentScores["VB Band"] ?? 1,
              segmentScores["BB Band"] ?? 1,
              segmentScores["SB Band"] ?? 1,
              segmentScores["BP Band"] ?? 1
            ];
            const maxBand = Math.max(...bands);
            let category = "Low";
            if (maxBand <= 1) category = "Low";
            else if (maxBand <= 2) category = "Medium";
            else if (maxBand <= 3) category = "High";
            else category = "Extreme";
            categoriesInData.add(category);
          }
        });
        return;
      }
      projectData.geoFeatures.forEach((_, i) => {
        const attributes = projectData.attributes[i];
        if (attributes) {
          const attrValue = attributes[categoryFilterAttribute];
          const attrValueText = getAttrText(categoryFilterAttribute, attrValue);
          if (attrValueText) {
            // Multi-value attributes: split "Bollards, Fence" into individual categories
            if (MULTI_VALUE_ATTRS.has(categoryFilterAttribute) && attrValueText.includes(", ")) {
              attrValueText.split(", ").forEach((part: string) => categoriesInData.add(part.trim()));
            } else {
              categoriesInData.add(attrValueText);
            }
          }
        }
      });
    });

    const categories = Array.from(categoriesInData);
    const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band", "Overall Risk Level"].includes(categoryFilterAttribute);
    if (isSafetyScore) {
      const riskOrder = ["Low", "Medium", "High", "Extreme"];
      categories.sort((a, b) => {
        const ai = riskOrder.indexOf(a), bi = riskOrder.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1; if (bi === -1) return -1;
        return ai - bi;
      });
    } else if (categoryFilterAttribute === "Facility Width per Direction") {
      const widthOrder = ["Very Narrow", "Narrow", "Wide"];
      categories.sort((a, b) => {
        const ai = widthOrder.indexOf(a), bi = widthOrder.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1; if (bi === -1) return -1;
        return ai - bi;
      });
    } else {
      categories.sort();
    }
    return categories;
  }, [categoryFilterAttribute, projectsData, attrMappings]);

  // Initialise / update category toggles when the sidebar attribute or its available categories change
  useEffect(() => {
    if (!categoryFilterAttribute) return;
    setCategoryToggles(prev => {
      const newToggles = { ...prev };
      if (!newToggles[categoryFilterAttribute]) newToggles[categoryFilterAttribute] = {};
      const updatedAttributeToggles: Record<string, boolean> = { ...newToggles[categoryFilterAttribute] };
      availableCategories.forEach(category => {
        if (!(category in updatedAttributeToggles)) updatedAttributeToggles[category] = true;
      });
      newToggles[categoryFilterAttribute] = updatedAttributeToggles;
      return newToggles;
    });
  }, [categoryFilterAttribute, availableCategories]);

  // Initialise subcategory toggles when the sidebar attribute has subcategories
  useEffect(() => {
    if (!categoryFilterAttribute) return;
    const subcatConfig = SUBCATEGORY_MAP[categoryFilterAttribute];
    if (!subcatConfig) return;
    setSubcategoryToggles(prev => {
      const childAttr = subcatConfig.childAttr;
      const allChildOptions = Object.values(subcatConfig.parentCategories).flat();
      if (!allChildOptions.length) return prev;
      const existing = prev[childAttr] ?? {};
      let changed = false;
      const updated = { ...existing };
      allChildOptions.forEach(opt => {
        if (!(opt in updated)) { updated[opt] = true; changed = true; }
      });
      if (!changed) return prev;
      return { ...prev, [childAttr]: updated };
    });
  }, [categoryFilterAttribute]);

  // Handle column header click for sorting
  const handleHeaderClick = (columnKey: string) => {
    setSortConfig(prevConfig => {
      // Find if this column is already in sort config
      const existingIndex = prevConfig.findIndex(s => s.column === columnKey);

      if (existingIndex === 0) {
        // If it's the primary sort, toggle direction
        const currentDirection = prevConfig[0].direction;
        return [
          { column: columnKey, direction: currentDirection === 'asc' ? 'desc' : 'asc' },
          ...prevConfig.slice(1) // Keep other sort criteria
        ];
      } else if (existingIndex > 0) {
        // If it's a secondary sort, move it to primary and set to 'asc'
        const updated = [...prevConfig];
        updated.splice(existingIndex, 1);
        return [{ column: columnKey, direction: 'asc' }, ...updated];
      } else {
        // Not in config, add as primary sort
        return [{ column: columnKey, direction: 'asc' }, ...prevConfig];
      }
    });
  };

  // Default center (Singapore)
  const initialCenter = useRef<[number, number]>([1.3521, 103.8198]);

  // Calculate bounds for each project based on actual geodata
  const projectBounds = useMemo(() => {
    const boundsMap: Record<string, L.LatLngBounds> = {};

    projectsData.forEach((projectData) => {
      const projectPoints: [number, number][] = [];

      projectData.geoFeatures.forEach((feature) => {
        const g = feature.geometry;
        if (g?.type === "LineString" && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
          projectPoints.push(to4326(g.coordinates[0]));
        }
      });

      if (projectPoints.length > 0) {
        boundsMap[projectData.projectName] = L.latLngBounds(
          projectPoints.map(([lat, lng]) => L.latLng(lat, lng))
        );
      }
    });

    return boundsMap;
  }, [projectsData]);

  const handleProjectClick = (projectName: string) => {
    const bounds = projectBounds[projectName];
    if (bounds) {
      setPanToBounds(bounds);
      // Reset after a short delay to allow re-clicking the same project
      setTimeout(() => setPanToBounds(null), 100);
    }
  };

  // CSV helper: escape CSV values with proper quoting
  const escapeCSV = (value: string): string => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  // Generate CSV content from sorted and filtered data
  const generateCSV = (): string => {
    const headers = tableColumns.map(col => col.label);

    const rows = sortedData.map(point => {
      return tableColumns.map(col => {
        return getColumnValue(point, col.key);
      });
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(escapeCSV).join(","))
      .join("\n");

    return csvContent;
  };

  // Download CSV file
  const handleDownloadCSV = (): void => {
    const csvContent = generateCSV();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project_analysis-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download Filtered Images
  const handleDownloadImages = async () => {
    try {
      // 1. Collect images from sortedData (filtered)
      const projectImages: Record<string, string[]> = {};

      sortedData.forEach(point => {
        const projectName = point.projectName;
        const imageRef = point.f.properties?.["Image Reference"];

        // Skip if no image reference or placeholder
        if (projectName && imageRef && imageRef !== "-" && imageRef !== "None" && imageRef !== "") {
          if (!projectImages[projectName]) {
            projectImages[projectName] = [];
          }
          projectImages[projectName].push(imageRef);
        }
      });

      // Check if we have any images
      const totalImages = Object.values(projectImages).reduce((acc, list) => acc + list.length, 0);
      if (totalImages === 0) {
        alert("No images found in the current filtered selection.");
        return;
      }

      // 2. Call API
      // Show loading indicator usually, but for now just await
      // You might want to set loading=true if you have a global loading state or local one
      const blob = await downloadFilteredImages({ projects: projectImages });

      // 3. Trigger Download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `filtered_images_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (e: any) {
      console.error("Failed to download images", e);
      alert(`Failed to download images: ${e.message}`);
    }
  };

  // Calculate category distribution data for the chart
  const categoryDistributionData = useMemo(() => {
    if (!primaryFocusAttribute) return [];

    // Count occurrences of each category
    const categoryCounts: Record<string, number> = {};

    if (primaryFocusAttribute === "Project") {
      // For Project focus, count segments per project
      allPoints.forEach((point) => {
        const project = point.projectName;
        if (project) {
          categoryCounts[project] = (categoryCounts[project] || 0) + 1;
        }
      });

      // Convert to array format for the chart with project colors
      return Object.entries(categoryCounts)
        .map(([project, count]) => ({
          category: project,
          count,
          color: projectColors[project] || "#6B7280",
        }))
        .sort((a, b) => b.count - a.count); // Sort by count descending
    } else {
      // For attribute focus, count segments per category value
      allPoints.forEach((point) => {
        const category = point.attributeValue;
        if (category) {
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        }
      });

      // Convert to array format for the chart
      const chartData = Object.entries(categoryCounts)
        .map(([category, count]) => ({
          category,
          count,
          color: attributeCategoryColors[category] || "#6B7280",
        }));

      // Apply semantic ordering for specific attributes
      if (primaryFocusAttribute === "Facility Width per Direction") {
        const widthOrder = ["Very Narrow", "Narrow", "Wide"];
        return chartData.sort((a, b) => {
          const aIndex = widthOrder.indexOf(a.category);
          const bIndex = widthOrder.indexOf(b.category);
          if (aIndex === -1 && bIndex === -1) return 0;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      } else if (["VB Band", "BB Band", "SB Band", "BP Band", "Overall Risk Level"].includes(primaryFocusAttribute)) {
        // For safety score bands and Overall Risk Level, sort in the order: Low, Medium, High, Extreme
        const riskOrder = ["Low", "Medium", "High", "Extreme"];
        return chartData.sort((a, b) => {
          const aIndex = riskOrder.indexOf(a.category);
          const bIndex = riskOrder.indexOf(b.category);
          if (aIndex === -1 && bIndex === -1) return 0;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      } else {
        // Default: sort by count descending
        return chartData.sort((a, b) => b.count - a.count);
      }
    }
  }, [allPoints, primaryFocusAttribute, attributeCategoryColors, projectColors]);

  // Calculate status of all selected filter attributes (Active/Inactive categories)
  const categoryStatus = useMemo(() => {
    const attributesToCheck = [...selectedAttributes];
    if (primaryFocusAttribute === "Project" && !attributesToCheck.includes("Project")) {
      attributesToCheck.push("Project");
    }

    return attributesToCheck.map(attr => {
      // 1. Get available categories for this attribute
      const categoriesSet = new Set<string>();

      if (attr === "Project") {
        selectedProjects.forEach(p => categoriesSet.add(p));
      } else {
        // Iterate through all data to find unique values for this attribute
        projectsData.forEach(projectData => {
          // Skip projects not selected
          if (!selectedProjects.includes(projectData.projectName)) return;

          if (!projectData.attributes) return;

          const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band", "Overall Risk Level"].includes(attr);

          if (attr === "Overall Risk Level") {
            projectData.geoFeatures.forEach((_, i) => {
              if (projectData.scores && projectData.scores.length > i) {
                const segmentScores = projectData.scores[i];
                const bands = [
                  segmentScores["VB Band"] ?? 1,
                  segmentScores["BB Band"] ?? 1,
                  segmentScores["SB Band"] ?? 1,
                  segmentScores["BP Band"] ?? 1
                ];
                const maxBand = Math.max(...bands);
                let category = "Low"; // Default
                if (maxBand <= 1) category = "Low";
                else if (maxBand <= 2) category = "Medium";
                else if (maxBand <= 3) category = "High";
                else category = "Extreme";
                categoriesSet.add(category);
              }
            });
          } else if (isSafetyScore) {
            // For specific bands
            const crashTypeKey = attr.replace(" Band", "");
            projectData.geoFeatures.forEach((_, i) => {
              if (projectData.scores && projectData.scores.length > i) {
                const segmentScores = projectData.scores[i];
                const scoreValue = segmentScores?.[crashTypeKey] !== undefined ? segmentScores[crashTypeKey] : 0;
                let attrValueText = "Low";
                if (['BB', 'BP', 'SB'].includes(crashTypeKey)) {
                  if (scoreValue < 5) attrValueText = "Low";
                  else if (scoreValue <= 10) attrValueText = "Medium";
                  else if (scoreValue <= 20) attrValueText = "High";
                  else attrValueText = "Extreme";
                } else {
                  if (scoreValue < 10) attrValueText = "Low";
                  else if (scoreValue <= 25) attrValueText = "Medium";
                  else if (scoreValue <= 60) attrValueText = "High";
                  else attrValueText = "Extreme";
                }
                categoriesSet.add(attrValueText);
              }
            });
          } else {
            // Standard attributes
            projectData.geoFeatures.forEach((_, i) => {
              const attributes = projectData.attributes[i];
              if (attributes) {
                const attrValue = attributes[attr];
                if (attrValue !== undefined && attrValue !== null) {
                  const text = getAttrText(attr, attrValue);
                  if (text) {
                    if (MULTI_VALUE_ATTRS.has(attr) && text.includes(", ")) {
                      text.split(", ").forEach((part: string) => categoriesSet.add(part.trim()));
                    } else {
                      categoriesSet.add(text);
                    }
                  }
                }
              }
            });
          }
        });
      }

      // 2. Sort categories
      const categories = Array.from(categoriesSet);
      if (["VB Band", "BB Band", "SB Band", "BP Band", "Overall Risk Level"].includes(attr)) {
        const riskOrder = ["Low", "Medium", "High", "Extreme"];
        categories.sort((a, b) => {
          const aIndex = riskOrder.indexOf(a);
          const bIndex = riskOrder.indexOf(b);
          if (aIndex === -1 && bIndex === -1) return 0;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      } else if (attr === "Facility Width per Direction") {
        const widthOrder = ["Very Narrow", "Narrow", "Wide"];
        categories.sort((a, b) => {
          const aIndex = widthOrder.indexOf(a);
          const bIndex = widthOrder.indexOf(b);
          if (aIndex === -1 && bIndex === -1) return 0;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });
      } else {
        categories.sort();
      }

      // 3. Map to status objects
      const currentToggles = categoryToggles[attr] || {};
      const categoryStatusItems = categories.map(cat => {
        const isActive = currentToggles[cat] !== false;
        let color = "#6B7280";
        if (attr === "Project") {
          color = projectColors[cat] || color;
        } else {
          color = getCategoryColor(attr, cat);
        }
        return { category: cat, isActive, color };
      });

      return {
        attribute: attr,
        categories: categoryStatusItems
      };
    });
  }, [selectedAttributes, primaryFocusAttribute, selectedProjects, projectsData, categoryToggles, projectColors]);

  // Notify parent when chart data updates
  useEffect(() => {
    if (onChartDataUpdate) {
      onChartDataUpdate({
        categoryDistributionData,
        primaryFocusAttribute,
        categoryStatus,
      });
    }
  }, [categoryDistributionData, primaryFocusAttribute, categoryStatus, onChartDataUpdate]);

  // Clear polygon points and close dialog when toggling polygon mode
  useEffect(() => {
    // Both modes share the same points state, so clear if both are inactive
    if (!isPolygonMode && !isPolygonAddMode) {
      setPolygonPoints([]);
      setDeleteConfirmationOpen(false);
      setSegmentsToDelete([]);
    }
  }, [isPolygonMode, isPolygonAddMode]);

  // Clear single selections when toggling point modes
  useEffect(() => {
    if (!isDeleteMode && !isPointAddMode) {
      setSegmentToDelete(null);
      setSegmentToAdd(null);
    }
  }, [isDeleteMode, isPointAddMode]);

  // Handler for finishing "Add Segments" selection
  const finishAddSegmentsSelection = () => {
    if (polygonPoints.length < 3) {
      toaster.create({ title: "Invalid Polygon", description: "Need at least 3 points.", type: "warning" });
      return;
    }

    // Collect all points inside the polygon, grouped by project
    const selectedMap = new Map<string, number[]>();

    allPoints.forEach(p => {
      if (isPointInPolygon(p.latlng, polygonPoints)) {
        if (!selectedMap.has(p.projectName)) {
          selectedMap.set(p.projectName, []);
        }
        selectedMap.get(p.projectName)?.push(p.idx);
      }
    });

    if (selectedMap.size === 0) {
      toaster.create({ title: "No Segments", description: "No segments selected inside the polygon.", type: "warning" });
      return;
    }

    // Convert map to array for dialog
    const sources = Array.from(selectedMap.entries()).map(([projectName, indices]) => ({
      projectName,
      indices
    }));

    setSegmentsToAdd(sources);
    setIsAddSegmentsDialogOpen(true);
  };

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      bg="white"
      _dark={{ bg: "gray.800" }}
    >
      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={(e) => setActiveTab(e.value)}>
        <Flex justify="space-between" align="center" borderBottom="1px solid" borderColor="gray.200" bg="white" _dark={{ bg: "gray.800" }} py="3" px="4">
          <HStack gap="4">
            <Tabs.List>
              <Tabs.Trigger value="map">Map View</Tabs.Trigger>
              <Tabs.Trigger value="table">Table View</Tabs.Trigger>
            </Tabs.List>

            {allPoints.length > 0 && (
              <>
                <HStack gap="0" mr="2">
                  <Menu.Root positioning={{ placement: "bottom-end", strategy: "fixed" }}>
                    <Menu.Trigger asChild>
                      <IconButton
                        aria-label="Single Point Tools"
                        size="sm"
                        variant={(isDeleteMode || isPointAddMode) ? "solid" : "outline"}
                        colorPalette={(isDeleteMode || isPointAddMode) ? (isDeleteMode ? "red" : "blue") : "gray"}
                        onClick={(e) => {
                          if (isDeleteMode || isPointAddMode) {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDeleteMode(false);
                            setIsPointAddMode(false);
                            setIsPolygonMode(false);
                            setIsPolygonAddMode(false);
                            setPolygonPoints([]);
                          }
                        }}
                        borderTopRightRadius={0}
                        borderBottomRightRadius={0}
                      >
                        {isDeleteMode ? <FaTrash /> : isPointAddMode ? <FaPlus /> : <FaMousePointer />}
                      </IconButton>
                    </Menu.Trigger>
                    <Menu.Positioner>
                      <Menu.Content zIndex={2000}>
                        <Menu.Item
                          value="delete"
                          onClick={() => {
                            setIsDeleteMode(true);
                            setIsPointAddMode(false);
                            setIsPolygonMode(false);
                            setIsPolygonAddMode(false);
                            setPolygonPoints([]);
                          }}
                        >
                          <FaMousePointer /> Single Point Delete
                        </Menu.Item>
                        <Menu.Item
                          value="add"
                          onClick={() => {
                            setIsDeleteMode(false);
                            setIsPointAddMode(true);
                            setIsPolygonMode(false);
                            setIsPolygonAddMode(false);
                            setPolygonPoints([]);
                          }}
                        >
                          <FaPlus /> Single Point Copy
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Positioner>
                  </Menu.Root>
                  <Menu.Root positioning={{ placement: "bottom-start", strategy: "fixed" }}>
                    <Menu.Trigger asChild>
                      <IconButton
                        aria-label="Polygon Tools"
                        size="sm"
                        variant={(isPolygonMode || isPolygonAddMode) ? "solid" : "outline"}
                        colorPalette={(isPolygonMode || isPolygonAddMode) ? (isPolygonMode ? "red" : "blue") : "gray"}
                        borderTopLeftRadius={0}
                        borderBottomLeftRadius={0}
                        borderLeft="none"
                        onClick={(e) => {
                          if (isPolygonMode || isPolygonAddMode) {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsPolygonMode(false);
                            setIsPolygonAddMode(false);
                            setIsDeleteMode(false);
                            setIsPointAddMode(false);
                            setPolygonPoints([]);
                          }
                        }}
                      >
                        {isPolygonMode ? <FaTrash /> : isPolygonAddMode ? <FaPlus /> : <FaDrawPolygon />}
                      </IconButton>
                    </Menu.Trigger>
                    <Menu.Positioner>
                      <Menu.Content zIndex={2000}>
                        <Menu.Item
                          value="delete"
                          onClick={() => {
                            setIsPolygonMode(true);
                            setIsPolygonAddMode(false);
                            setIsDeleteMode(false);
                            setIsPointAddMode(false);
                            setPolygonPoints([]);
                            setDeleteConfirmationOpen(false);
                          }}
                        >
                          <FaTrash /> Delete Segments
                        </Menu.Item>
                        <Menu.Item
                          value="add"
                          onClick={() => {
                            setIsPolygonMode(false);
                            setIsPolygonAddMode(true);
                            setIsDeleteMode(false);
                            setIsPointAddMode(false);
                            setPolygonPoints([]);
                            setDeleteConfirmationOpen(false);
                          }}
                        >
                          <FaPlus /> Copy/Add Segments
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Positioner>
                  </Menu.Root>
                </HStack>

                {polygonPoints.length >= 3 && isPolygonMode && (
                  <Button
                    size="sm"
                    colorPalette="red"
                    onClick={finishPolygonSelection}
                  >
                    Delete Selected ({
                      // Preview count
                      allPoints.filter(pt => isPointInPolygon(pt.latlng, polygonPoints)).length
                    } segments)
                  </Button>
                )}

                {polygonPoints.length >= 3 && isPolygonAddMode && (
                  <Button
                    size="sm"
                    colorPalette="blue"
                    onClick={finishAddSegmentsSelection}
                  >
                    Copy Selected ({
                      allPoints.filter(pt => isPointInPolygon(pt.latlng, polygonPoints)).length
                    } segments)
                  </Button>
                )}
              </>
            )}
          </HStack>

          {allPoints.length > 0 && (
            <HStack gap="2">
              <Button
                colorPalette="blue"
                size="sm"
                onClick={handleDownloadCSV}
              >
                Download Table
              </Button>
              <Button
                colorPalette="teal"
                size="sm"
                variant="outline"
                onClick={handleDownloadImages}
              >
                Download Images
              </Button>
            </HStack>
          )}
        </Flex>

        {/* Map Tab Content */}
        <Tabs.Content value="map">
          {/* Project Navigation Buttons and Legend */}
          {selectedProjects.length > 0 && (
            <Box p="4" borderBottom="1px solid" borderColor="gray.200">
              <Text fontSize="sm" fontWeight="semibold" mb="2">
                Jump to Project:
              </Text>
              <Flex gap="2" flexWrap="wrap" mb="3">
                {selectedProjects.map((proj) => (
                  <Button
                    key={proj}
                    size="sm"
                    colorPalette="blue"
                    variant="outline"
                    onClick={() => handleProjectClick(proj)}
                  >
                    {proj}
                  </Button>
                ))}
              </Flex>

            </Box>
          )}

          {/* Filter attribute selector + per-category toggles */}
          {selectedProjects.length > 0 && selectedAttributes.length > 0 && (
            <Box borderBottom="1px solid" borderColor="gray.200">
              {/* Tabs: one per active filter — matches FilterPanel tab style */}
              <Tabs.Root
                value={String(categoryFilterAttributeIndex)}
                onValueChange={e => {
                  const idx = Number(e.value);
                  setCategoryFilterAttributeIndex(idx);
                  setPrimaryFocusAttribute(activeFilters[idx]);
                }}
                variant="line"
              >
                <Box overflowX="auto">
                  <Tabs.List px="4" minW="max-content">
                    {selectedAttributes.map((attr, idx) => (
                      <Tabs.Trigger key={attr} value={String(idx)} fontSize="sm" whiteSpace="nowrap">
                        {idx + 1}. {(ATTRIBUTE_LABELS[attr] ?? attr).slice(0, 22)}
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                </Box>

                {selectedAttributes.map((attr, idx) => (
                  <Tabs.Content key={attr} value={String(idx)} p="4">
                    {/* Per-category toggles for the selected attribute */}
                    {categoryFilterAttribute && (
                      <>
                        {/* Header row: label + reset button */}
                  <Flex align="center" justify="space-between" mb="2">
                    <Text fontSize="xs" fontWeight="semibold" color="gray.500" _dark={{ color: "gray.400" }}>
                      {ATTRIBUTE_LABELS[categoryFilterAttribute] ?? categoryFilterAttribute}
                    </Text>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorPalette="gray"
                      onClick={() => {
                        const opts = ATTRIBUTE_OPTIONS[categoryFilterAttribute] ?? availableCategories;
                        setCategoryToggles(prev => ({
                          ...prev,
                          [categoryFilterAttribute]: Object.fromEntries(opts.map(c => [c, true])),
                        }));
                        const subcatConfig = SUBCATEGORY_MAP[categoryFilterAttribute];
                        if (subcatConfig) {
                          const allChildOpts = Object.values(subcatConfig.parentCategories).flat();
                          setSubcategoryToggles(prev => ({
                            ...prev,
                            [subcatConfig.childAttr]: Object.fromEntries(allChildOpts.map(c => [c, true])),
                          }));
                        }
                      }}
                    >
                      Reset
                    </Button>
                  </Flex>
                  {NUMERIC_FILTER_ATTRIBUTES.has(categoryFilterAttribute) ? (
                    /* Numeric range filter: slider inputs */
                    <Box>
                      <Text fontSize="xs" color="gray.500" mb="2">
                        Range filter for {ATTRIBUTE_LABELS[categoryFilterAttribute] ?? categoryFilterAttribute}:
                      </Text>
                      {(() => {
                        const bounds = dataRangeBounds[categoryFilterAttribute];
                        const [rMin, rMax] = rangeFilters[categoryFilterAttribute] ?? [bounds?.min ?? 0, bounds?.max ?? 100];
                        return (
                          <Box px="2">
                            <Slider
                              min={bounds?.min ?? 0}
                              max={bounds?.max ?? 100}
                              step={1}
                              value={[rMin, rMax]}
                              onValueChange={({ value }) => {
                                setRangeFilters(prev => ({
                                  ...prev,
                                  [categoryFilterAttribute]: [value[0], value[1]] as [number, number],
                                }));
                              }}
                            />
                            <Flex justify="space-between" mt="1">
                              <Text fontSize="xs" color="gray.500">{rMin}</Text>
                              <Text fontSize="xs" color="gray.500">{rMax}</Text>
                            </Flex>
                          </Box>
                        );
                      })()}
                    </Box>
                ) : (
                  /* Layer 2 chips each followed immediately by their Layer 3 children */
                  <Flex direction="column" gap="2">
                    {(ATTRIBUTE_OPTIONS[categoryFilterAttribute] ?? availableCategories).map(category => {
                      const isOn = categoryToggles[categoryFilterAttribute]?.[category] ?? true;
                      const hexColor = getCategoryColor(categoryFilterAttribute, category);
                      const subcatConfig = SUBCATEGORY_MAP[categoryFilterAttribute];
                      const childAttr = subcatConfig?.childAttr;
                      const subcats = subcatConfig?.parentCategories[category];
                      const hasSubcats = isOn && subcats?.length;
                      return (
                        <Box key={category}>
                          {/* Layer 2 chip */}
                          <Flex
                            as="button"
                            align="center"
                            gap="2"
                            px="3"
                            py="1.5"
                            borderWidth="1px"
                            borderRadius="md"
                            cursor="pointer"
                            userSelect="none"
                            transition="all 0.15s"
                            style={isOn
                              ? { backgroundColor: hexColor + "22", borderColor: hexColor }
                              : { backgroundColor: "transparent", borderColor: "#E2E8F0" }
                            }
                            onClick={() => {
                              setCategoryToggles(prev => ({
                                ...prev,
                                [categoryFilterAttribute]: {
                                  ...prev[categoryFilterAttribute],
                                  [category]: !isOn,
                                },
                              }));
                            }}
                          >
                            <Text
                              fontSize="sm"
                              fontWeight={isOn ? "semibold" : "normal"}
                              color={isOn ? "gray.800" : "gray.400"}
                              _dark={{ color: isOn ? "gray.100" : "gray.500" }}
                              userSelect="none"
                            >
                              {category}
                            </Text>
                            <Box
                              w="30px"
                              h="17px"
                              borderRadius="full"
                              position="relative"
                              flexShrink={0}
                              transition="background 0.15s"
                              style={{ backgroundColor: isOn ? hexColor : "#CBD5E0" }}
                            >
                              <Box
                                position="absolute"
                                w="13px"
                                h="13px"
                                borderRadius="full"
                                bg="white"
                                top="2px"
                                transition="left 0.15s"
                                style={{ left: isOn ? "15px" : "2px" }}
                              />
                            </Box>
                          </Flex>

                          {/* Layer 3 chips — only visible when parent is ON */}
                          {hasSubcats && childAttr && (
                            <Box
                              mt="1.5"
                              ml="3"
                              pl="3"
                              borderLeft="2px solid"
                              style={{ borderColor: hexColor + "66" }}
                            >
                              <Flex gap="1.5" flexWrap="wrap">
                                {subcats!.map(sub => {
                                  const subOn = subcategoryToggles[childAttr]?.[sub] ?? true;
                                  const subColor = getCategoryColor(childAttr, sub);
                                  return (
                                    <Flex
                                      key={sub}
                                      as="button"
                                      align="center"
                                      gap="1.5"
                                      px="2.5"
                                      py="1"
                                      borderWidth="1px"
                                      borderRadius="md"
                                      cursor="pointer"
                                      userSelect="none"
                                      transition="all 0.15s"
                                      style={subOn
                                        ? { backgroundColor: subColor + "22", borderColor: subColor }
                                        : { backgroundColor: "transparent", borderColor: "#E2E8F0" }
                                      }
                                      onClick={() => {
                                        setSubcategoryToggles(prev => ({
                                          ...prev,
                                          [childAttr]: {
                                            ...prev[childAttr],
                                            [sub]: !subOn,
                                          },
                                        }));
                                      }}
                                    >
                                      <Text
                                        fontSize="xs"
                                        fontWeight={subOn ? "semibold" : "normal"}
                                        color={subOn ? "gray.700" : "gray.400"}
                                        _dark={{ color: subOn ? "gray.200" : "gray.500" }}
                                        userSelect="none"
                                      >
                                        {sub}
                                      </Text>
                                      <Box
                                        w="24px"
                                        h="14px"
                                        borderRadius="full"
                                        position="relative"
                                        flexShrink={0}
                                        transition="background 0.15s"
                                        style={{ backgroundColor: subOn ? subColor : "#CBD5E0" }}
                                      >
                                        <Box
                                          position="absolute"
                                          w="10px"
                                          h="10px"
                                          borderRadius="full"
                                          bg="white"
                                          top="2px"
                                          transition="left 0.15s"
                                          style={{ left: subOn ? "12px" : "2px" }}
                                        />
                                      </Box>
                                    </Flex>
                                  );
                                })}
                              </Flex>
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Flex>
                  )}
                </>
              )}
                  </Tabs.Content>
                ))}
              </Tabs.Root>
            </Box>
          )}

          <Box h="650px">
            {loading && (
              <Box p="6">
                <Text color="gray.500">Loading map…</Text>
              </Box>
            )}
            {err && (
              <Box p="6">
                <Text color="red.600">Failed: {err}</Text>
              </Box>
            )}

            {!loading && !err && (
              <>
                <MapContainer
                  center={initialCenter.current}
                  zoom={13}
                  maxZoom={22}
                  style={{ width: "100%", height: "100%" }}
                  scrollWheelZoom
                >
                  <MapCursorController
                    mode={(isDeleteMode || isPolygonMode) ? 'delete' : (isPointAddMode || isPolygonAddMode) ? 'add' : 'default'}
                  />
                  {/* Render Polygon Tool */}
                  <PolygonDrawingTool
                    isPolygonMode={isPolygonMode}
                    isPolygonAddMode={isPolygonAddMode}
                    onPolygonPoint={handlePolygonPoint}
                    onPointUpdate={handlePointUpdate}
                    polygonPoints={polygonPoints}
                  />

                  {/* Tile Layer */}
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; OpenStreetMap contributors & CARTO'
                    maxZoom={22}
                  />

                  {/* Auto-fit bounds if data is available and shouldAutoFit is true */}
                  {allLatLngs.length > 0 && <FitBounds points={allLatLngs} shouldFit={shouldAutoFit} />}

                  {/* Pan to specific project bounds when button clicked */}
                  {panToBounds && <PanToBounds bounds={panToBounds} />}

                  {/* Render all points as markers */}
                  {allPoints.map(({ idx, latlng, f, projectName, color, attributeValue }, globalIdx) => {
                    const radius = 5;
                    let label = `${projectName} - #${idx + 1}`;
                    if (f.properties?.["Image Reference"]) {
                      label += ` ${f.properties["Image Reference"]}`;
                    }
                    if (primaryFocusAttribute && attributeValue) {
                      label += ` | ${primaryFocusAttribute}: ${attributeValue}`;
                    }

                    return (
                      <CircleMarker
                        key={`${projectName}-${idx}-${globalIdx}`}
                        center={latlng}
                        radius={radius}
                        pathOptions={{ color, weight: 1, opacity: 0.9, fillOpacity: 0.8 }}
                        eventHandlers={{
                          click: (e) => {
                            // If in polygon mode, add this point to the polygon and stop propagation
                            if (isPolygonMode || isPolygonAddMode) {
                              L.DomEvent.stopPropagation(e as any);
                              handlePolygonPoint(L.latLng(latlng[0], latlng[1]));
                              return;
                            }

                            // Check delete modes first
                            if (isDeleteMode) {
                              setSegmentToDelete({ projectName: projectName, index: idx });
                              setDeleteConfirmationOpen(true);
                              return;
                            }
                            if (isPointAddMode) {
                              setSegmentToAdd({ projectName: projectName, index: idx });
                              setIsAddSegmentsDialogOpen(true);
                              return;
                            }

                            // Navigate to coding page for this project and segment
                            const segmentIdx = idx + 1; // 1-based index for UI
                            navigate(`/coding/${encodeURIComponent(projectName)}?segment=${segmentIdx}`, {
                              state: { returnToAnalysis: true }
                            });
                          }
                        }}
                      >
                        <Tooltip>{label}</Tooltip>
                      </CircleMarker>
                    );
                  })}
                </MapContainer>
              </>
            )}
          </Box>
        </Tabs.Content>

        {/* Table Tab Content */}
        <Tabs.Content value="table">
          <Box>
            {allPoints.length === 0 ? (
              <Box p="6">
                <Text color="gray.500">No data to display. Please select projects and load them.</Text>
              </Box>
            ) : (
              <>
                {/* Above-table controls */}
                <Box p="4" borderBottom="1px solid" borderColor="gray.200" bg="gray.50" _dark={{ bg: "gray.700" }}>
                  {/* Global Search */}
                  <Flex gap="4" mb="3" align="flex-start">
                    <Box flex="1" maxW="400px">
                      <Text fontSize="sm" fontWeight="semibold" mb="1">Global Search:</Text>
                      <Input
                        placeholder="Search across all columns..."
                        value={globalSearch}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGlobalSearch(e.target.value)}
                        size="sm"
                      />
                    </Box>
                    <Button
                      size="sm"
                      variant="outline"
                      mt="6"
                      onClick={() => {
                        setGlobalSearch("");
                        setColumnFilters({});
                        setSortConfig([]);
                      }}
                    >
                      Clear All
                    </Button>
                  </Flex>

                  {/* Sort Controls */}
                  {sortConfig.length > 0 && (
                    <Box>
                      <Text fontSize="sm" fontWeight="semibold" mb="2">Active Sort Order:</Text>
                      <Flex gap="2" flexWrap="wrap">
                        {sortConfig.map((sort, index) => (
                          <Flex key={sort.column} align="center" gap="2" px="3" py="1" bg="blue.50" borderRadius="md" _dark={{ bg: "blue.900" }}>
                            <Text fontSize="sm" fontWeight="500">
                              {index + 1}. {sort.column} {sort.direction === 'asc' ? '↑' : '↓'}
                            </Text>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setSortConfig(prev => prev.filter((_, i) => i !== index));
                              }}
                            >
                              ✕
                            </Button>
                          </Flex>
                        ))}
                      </Flex>
                    </Box>
                  )}

                  {/* Filtered count display */}
                  <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }} mt="3">
                    Showing {sortedData.length} of {allPoints.length} segments
                  </Text>
                </Box>

                {/* Table */}
                <Box overflowX="auto" overflowY="auto" maxH="650px">
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <thead>
                      <tr style={{ backgroundColor: "var(--chakra-colors-bg-subtle)" }}>
                        {tableColumns.map(col => {
                          const sortIndex = sortConfig.findIndex(s => s.column === col.key);
                          const sortDirection = sortIndex >= 0 ? sortConfig[sortIndex].direction : null;

                          return (
                            <th
                              key={col.key}
                              style={{
                                padding: "8px 12px",
                                textAlign: "left",
                                borderBottom: "2px solid var(--chakra-colors-border-subtle)",
                                cursor: "pointer",
                                userSelect: "none",
                                position: "sticky",
                                top: 0,
                                zIndex: 1,
                                backgroundColor: "var(--chakra-colors-bg-subtle)",
                              }}
                              onClick={() => handleHeaderClick(col.key)}
                            >
                              <Flex align="center" gap="2" mb="1">
                                <Text fontWeight="600" fontSize="sm">
                                  {col.label}
                                </Text>
                                {sortDirection && (
                                  <Text fontSize="xs" color="blue.600">
                                    {sortDirection === 'asc' ? '↑' : '↓'}
                                    {sortIndex > 0 && <sup>{sortIndex + 1}</sup>}
                                  </Text>
                                )}
                              </Flex>
                              {/* Per-column filter input */}
                              <Input
                                size="xs"
                                placeholder={`Filter ${col.label}...`}
                                value={columnFilters[col.key] || ""}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                  e.stopPropagation();
                                  setColumnFilters(prev => ({
                                    ...prev,
                                    [col.key]: e.target.value
                                  }));
                                }}
                                onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()}
                              />
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedData.length === 0 ? (
                        <tr>
                          <td colSpan={tableColumns.length} style={{ padding: "12px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>
                            <Text color="gray.500" fontSize="sm">No results found</Text>
                          </td>
                        </tr>
                      ) : (
                        sortedData.map(({ idx, latlng, f, projectName, color, attributes }, globalIdx) => (
                          <tr key={`${projectName}-${idx}-${globalIdx}`}>
                            {tableColumns.map(col => {
                              const value = getColumnValue(
                                { idx, latlng, f, projectName, color, attributes },
                                col.key
                              );

                              return (
                                <td key={col.key} style={{ padding: "12px", borderBottom: "1px solid #e2e8f0" }}>
                                  {col.key === "Project" ? (
                                    <Flex align="center" gap="2">
                                      <Box w="8px" h="8px" borderRadius="full" bg={color} />
                                      <Text fontSize="sm">{value}</Text>
                                    </Flex>
                                  ) : col.key === "Coordinates" ? (
                                    <Text fontSize="xs" fontFamily="mono">{value}</Text>
                                  ) : col.key === "Overall Risk Score" ? (
                                    <Text fontSize="sm" fontWeight="600">{value}</Text>
                                  ) : (
                                    <Text fontSize="sm">{value}</Text>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Box>
              </>
            )}
          </Box>
        </Tabs.Content>
      </Tabs.Root>
      <Dialog.Root open={deleteConfirmationOpen} onOpenChange={(e) => setDeleteConfirmationOpen(e.open)}>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Confirm Deletion</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                {segmentToDelete
                  ? `Are you sure you want to delete segment #${segmentToDelete.index + 1} from project "${segmentToDelete.projectName}"?`
                  : `Are you sure you want to delete ${segmentsToDelete.length} segments across ${new Set(segmentsToDelete.map(s => s.projectName)).size} projects?`
                }
                <Text color="red.500" mt="2" fontSize="sm">This action cannot be undone. Associated images will also be deleted.</Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button variant="outline">Cancel</Button>
                </Dialog.ActionTrigger>
                <Button
                  colorPalette="red"
                  onClick={segmentToDelete ? handleDeleteSegment : handleBatchDelete}
                  loading={isDeleting}
                >
                  Delete
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <AddSegmentsDialog
        isOpen={isAddSegmentsDialogOpen}
        onClose={() => {
          setIsAddSegmentsDialogOpen(false);
          setSegmentToAdd(null);
          setSegmentsToAdd([]);
        }}
        sources={
          segmentToAdd
            ? [{ projectName: segmentToAdd.projectName, indices: [segmentToAdd.index] }]
            : segmentsToAdd
        }
        onSuccess={() => {
          // Reset mode
          setIsPolygonAddMode(false);
          setPolygonPoints([]);
          // Show success toast is inside the dialog
        }}
      />
    </Box >
  );
}

