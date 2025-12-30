import { useState, useEffect, useMemo, useRef } from "react";
import { Box, Text, Tabs, Button, Flex, HStack, createListCollection, Combobox, Portal } from "@chakra-ui/react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { Switch } from "../../../components/ui/switch";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import proj4 from "proj4";
import type { Feature, LineString, Position } from "geojson";
import { fetchProjectAttributes, fetchProjectGeoJSON, fetchAttributeMappings, calculateScore, type AttributeRow } from "../../../api";
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

interface AttributeAnalysisMapViewProps {
  selectedProjects: string[];
  selectedAttributes: (string | null)[];
  onChartDataUpdate?: (data: { categoryDistributionData: { category: string; count: number; color: string }[]; primaryFocusAttribute: string | null }) => void;
}


type ProjectData = {
  projectName: string;
  geoFeatures: Feature<LineString, any>[];
  attributes: AttributeRow[];
  scores: Record<string, any>[]; // Raw crash type scores (BB, SB, VB, BP)
  color: string;
};

export default function AttributeAnalysisMapView({ selectedProjects, selectedAttributes, onChartDataUpdate }: AttributeAnalysisMapViewProps) {
  const [activeTab, setActiveTab] = useState<string>("map");
  const [projectsData, setProjectsData] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [panToBounds, setPanToBounds] = useState<L.LatLngBounds | null>(null);
  const [attrMappings, setAttrMappings] = useState<Record<string, Record<string, string>>>({});

  // Category toggle states - now tracks toggles per filter attribute
  // Structure: { "attributeName": { "categoryValue": true/false } }
  const [categoryToggles, setCategoryToggles] = useState<Record<string, Record<string, boolean>>>({});

  // Track if we should auto-fit bounds (only on initial project load, not on category changes)
  const [shouldAutoFit, setShouldAutoFit] = useState(false);

  // Track which attribute to show categories for (defaults to first)
  const [categoryFilterAttributeIndex, setCategoryFilterAttributeIndex] = useState(0);

  // Track which attribute is the primary focus for coloring
  const [primaryFocusAttribute, setPrimaryFocusAttribute] = useState<string | null>(null);

  // Update primaryFocusAttribute when selected attributes change
  useEffect(() => {
    const activeAttrs = selectedAttributes.filter(attr => attr !== null);
    if (activeAttrs.length > 0) {
      // If current primary focus is not in active attributes or not "Project", reset to first active attribute
      if (!primaryFocusAttribute || (primaryFocusAttribute !== "Project" && !activeAttrs.includes(primaryFocusAttribute))) {
        setPrimaryFocusAttribute(activeAttrs[0]);
      }
    } else if (primaryFocusAttribute !== "Project") {
      // Only clear if not set to "Project"
      setPrimaryFocusAttribute(null);
    }
  }, [selectedAttributes]);

  // Get all active filters (non-null attributes)
  const activeFilters = useMemo(() => {
    return selectedAttributes.filter(attr => attr !== null);
  }, [selectedAttributes]);

  // Load attribute mappings on mount
  useEffect(() => {
    fetchAttributeMappings()
      .then(setAttrMappings)
      .catch(e => console.error("Failed to load attribute mappings:", e));
  }, []);

  // Get color for a specific crash type score based on thresholds
  const getScoreColor = (score: number): string => {
    if (score <= 5) return RISK_BAND_COLORS.LOW;
    if (score <= 10) return RISK_BAND_COLORS.MEDIUM;
    if (score <= 20) return RISK_BAND_COLORS.HIGH;
    return RISK_BAND_COLORS.EXTREME;
  };

  // Initialize default toggles for all active filters when they change
  useEffect(() => {
    setCategoryToggles(prev => {
      const updated = { ...prev };
      // Initialize toggles for new active filters if they don't exist
      for (const filterAttr of activeFilters) {
        if (!updated[filterAttr]) {
          updated[filterAttr] = {};
        }
      }
      return updated;
    });
  }, [activeFilters]);

  // Get the attribute to show categories for
  const categoryFilterAttribute = activeFilters[categoryFilterAttributeIndex];

  // Helper function to convert numeric attribute value to text using mappings
  const getAttrText = (attrName: string, attrValue: any): string => {
    // Handle safety score band values (VB Band, BB Band, SB Band, BP Band)
    // These map to exactly 4 categories based on score thresholds:
    // Low: 0-5, Medium: 5-10, High: 10-20, Extreme: 20+
    if (["VB Band", "BB Band", "SB Band", "BP Band"].includes(attrName)) {
      const numValue = Number(attrValue);
      if (isNaN(numValue)) {
        return "Low"; // Default to Low if invalid
      }

      // Map backend bands to frontend categories: Low, Medium, High, Extreme
      // Note: Band 5 may still exist in old data, map it to Extreme
      const riskCategoryMap: Record<number, string> = {
        1: "Low",      // Band 1: score 0-5
        2: "Medium",   // Band 2: score 5-10
        3: "High",     // Band 3: score 10-20
        4: "Extreme",  // Band 4: score 20+
        5: "Extreme",  // Band 5 (legacy): score 20+ - treat same as Band 4
      };

      return riskCategoryMap[numValue] || "Low"; // Default to Low if unknown
    }

    // Special handling for CycleRAP Score - calculated from actual score, not a band index
    if (attrName === "CycleRAP Score") {
      // This shouldn't happen as CycleRAP Score is calculated in the filter logic,
      // but handle it gracefully just in case
      const scoreValue = Number(attrValue);
      if (isNaN(scoreValue)) return "Low";
      if (scoreValue <= 5) return "Low";
      if (scoreValue <= 10) return "Medium";
      if (scoreValue <= 20) return "High";
      return "Extreme";
    }

    // If we have a mapping for this attribute and the value is a number
    if (attrMappings[attrName] && typeof attrValue === "number") {
      return attrMappings[attrName][String(attrValue)] || String(attrValue);
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
            console.warn(`Failed to load scores for ${projectName}, continuing without scores`);
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
  }, [selectedProjects, projectColors]);

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
        "Multi-Use Path": "#16A34A",
        "Off-Road Bicycle Path": "#10B981",
        "On-road Bicycle Lane": "#CA8A04",
        "Road Shoulder": "#F59E0B",
        "Mixed Traffic Road Lane": "#DC2626",
      },

      // Area type (neutral colors)
      "Area type": {
        "Urban": "#2563EB",
        "Suburban": "#3B82F6",
        "Rural": "#10B981",
        "Industrial": "#6B7280",
      },
    };

    // Get color for primaryFocusAttribute - handle both direct string values and object mappings
    const attributeColors = categoryColors[primaryFocusAttribute];
    if (typeof attributeColors === "object" && attributeColors !== null) {
      return attributeColors as Record<string, string>;
    }

    // For safety score bands (Low, Medium, High, Extreme), return the direct color mapping
    const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band", "CycleRAP Score"].includes(primaryFocusAttribute || "");
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

  // Helper function to get color for a specific attribute and category value
  const getCategoryColor = (attribute: string, category: string): string => {
    // For Safety Score attributes (VB Band, BB Band, SB Band, BP Band, CycleRAP Score), use the category value directly for color lookup
    const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band", "CycleRAP Score"].includes(attribute);

    const categoryColors: Record<string, string | Record<string, string>> = {
      // Safety Score Band colors (CycleRAP Risk Bands) - these apply to all safety score attributes
      "Not Selected": "#9CA3AF",
      "Low": "#87C424",
      "Medium": "#FFCC1A",
      "High": "#FF5B1A",
      "Extreme": "#CD1AFF",
      // Facility configuration
      "Adjacent Sidewalk 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Road Lane 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Vehicle Parking 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Severe Hazard 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent object or level change 0-1m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Road Lane 1-3m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Vehicle Parking 1-3m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent Severe Hazard 1-3m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Adjacent object or level change 1-3m": { "Present": "#DC2626", "Not Present": "#16A34A" },
      // Facility clear width
      "Fixed Obstacle on Facility": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Non-Fixed Obstacle on Facility": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Width Restriction": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Light Segregation": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Facility access": { "Adequate": "#16A34A", "Inadequate": "#DC2626" },
      // Facility surface conditions
      "Loose or slippery surface": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Major Surface Deformation or Drain Opening": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Tram or Train Rails": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Delineation": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Street Lighting": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Grade": { "< 5 Degrees": "#16A34A", "=/> 5 Degrees": "#DC2626" },
      "Curvature": { "No Sharp Turn Present": "#16A34A", "Sharp Turn Present": "#DC2626" },
      "Facility Width per Direction": { "Wide": "#16A34A", "Narrow": "#FFCC1A", "Very Narrow": "#DC2626" },
      // Flow & Speed
      "Peak pedestrian flow along or across facility": { "None": "#6B7280", "Low": "#16A34A", "Moderate to high": "#DC2626" },
      "Peak bicycle/LV traffic flow": { "Low": "#16A34A", "Moderate to high": "#DC2626" },
      "Observed proportion of cargo bikes and mopeds": { "Low": "#16A34A", "Moderate to high": "#DC2626" },
      "Heavy vehicle flow": { "Low": "#16A34A", "Moderate to high": "#DC2626" },
      "Bicycle/LV speed – average": { "< 20km/h": "#16A34A", "=/> 20km/h": "#DC2626" },
      "Bicycle/LV speed differential": { "< 10km/h": "#16A34A", "=/> 10km/h": "#DC2626" },
      // Intersection
      "Intersection or Road Crossing": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Crossing Facility": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Pedestrian Crossing": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Intersecting Bicycle Facility": { "Present": "#16A34A", "Not Present": "#DC2626" },
      "Property Access": { "Present": "#DC2626", "Not Present": "#16A34A" },
      "Intersection Approach": { "Separate/NA": "#16A34A", "Shared": "#DC2626" },
      "Number of lanes – adjacent road": { "1 per Direction/NA": "#16A34A", "> 1 per Direction": "#DC2626" },
      "Number of lanes – intersecting road": { "1 per Direction/NA": "#16A34A", "> 1 per Direction": "#DC2626" },
      "Flow Direction": { "One Way": "#2563EB", "Two Way": "#9333EA" },
      "Facility Type": {
        "Sidewalk": "#2563EB",
        "Multi-Use Path": "#16A34A",
        "Off-Road Bicycle Path": "#10B981",
        "On-road Bicycle Lane": "#CA8A04",
        "Road Shoulder": "#F59E0B",
        "Mixed Traffic Road Lane": "#DC2626",
      },
      "Area type": {
        "Urban": "#2563EB",
        "Suburban": "#3B82F6",
        "Rural": "#10B981",
        "Industrial": "#6B7280",
      },
    };

    // For safety score attributes, look up the category value directly (it will be Low, Medium, High, Extreme, Not Selected)
    if (isSafetyScore) {
      const color = categoryColors[category] as string || "#6B7280";
      return color;
    }

    // For other attributes, look up by attribute name
    const attributeColors = categoryColors[attribute];
    if (typeof attributeColors === "object" && attributeColors !== null) {
      const color = (attributeColors as Record<string, string>)[category] || "#6B7280";
      return color;
    }
    if (typeof attributeColors === "string") {
      return attributeColors;
    }
    return "#6B7280"; // Default gray
  };

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
            // Check if segment matches all active filters AND category toggles
            let matchesAllFilters = true;

            // First, check all active filters (top tabs)
            for (const filterAttr of activeFilters) {
              let attrValueText = "";

              // Special handling for "Project" filter
              if (filterAttr === "Project") {
                attrValueText = projectData.projectName;
              } else if (filterAttr === "CycleRAP Score") {
                // Special handling for CycleRAP Score - calculate it from scores
                if (projectData.scores && projectData.scores.length > i) {
                  const segmentScores = projectData.scores[i];
                  const scores = [segmentScores.VB, segmentScores.BB, segmentScores.SB, segmentScores.BP].filter(s => s !== undefined);
                  const scoreValue = scores.length > 0 ? Math.max(...scores) : 0;

                  if (scoreValue <= 5) attrValueText = "Low";
                  else if (scoreValue <= 10) attrValueText = "Medium";
                  else if (scoreValue <= 20) attrValueText = "High";
                  else attrValueText = "Extreme";
                } else {
                  attrValueText = "Low"; // Default if no scores
                }
              } else {
                const attrValue = attributes[filterAttr];
                attrValueText = getAttrText(filterAttr, attrValue);
              }

              // Skip if this filter attribute has no value
              if (!attrValueText || attrValueText === "Not Selected") {
                matchesAllFilters = false;
                break;
              }

              // Check if this filter attribute's category toggle is enabled
              // Use ?? true to default to true when toggle is not set (all categories visible by default)
              const filterToggles = categoryToggles[filterAttr];
              if (filterToggles && Object.keys(filterToggles).length > 0) {
                // If toggles exist for this attribute, check if the current value is enabled
                const isToggled = filterToggles[attrValueText] ?? true;
                if (!isToggled) {
                  matchesAllFilters = false;
                  break;
                }
              }
            }

            if (!matchesAllFilters) {
              return; // Skip segment - doesn't match active filters or their toggles
            }

            // Also check the category filter attribute's toggles (even if not in activeFilters)
            // This allows filtering by the selected tab's categories
            if (categoryFilterAttribute && categoryFilterAttribute !== "Project") {
              let categoryValueText = "";

              if (categoryFilterAttribute === "CycleRAP Score") {
                if (projectData.scores && projectData.scores.length > i) {
                  const segmentScores = projectData.scores[i];
                  const scores = [segmentScores.VB, segmentScores.BB, segmentScores.SB, segmentScores.BP].filter(s => s !== undefined);
                  const scoreValue = scores.length > 0 ? Math.max(...scores) : 0;

                  if (scoreValue <= 5) categoryValueText = "Low";
                  else if (scoreValue <= 10) categoryValueText = "Medium";
                  else if (scoreValue <= 20) categoryValueText = "High";
                  else categoryValueText = "Extreme";
                }
              } else {
                const attrValue = attributes[categoryFilterAttribute];
                categoryValueText = getAttrText(categoryFilterAttribute, attrValue);
              }

              // Apply category toggles
              const categoryTogglesForAttr = categoryToggles[categoryFilterAttribute];
              if (categoryTogglesForAttr && Object.keys(categoryTogglesForAttr).length > 0 && categoryValueText) {
                const isToggled = categoryTogglesForAttr[categoryValueText];
                if (isToggled === false) {
                  return; // Skip segment - this category is toggled off
                }
              }
            }

            // Determine color based on primary focus attribute or project
            let pointColor = projectData.color; // Default to project color
            let attrValueText = "";

            if (primaryFocusAttribute === "Project") {
              // Use project color
              pointColor = projectData.color;
              attrValueText = projectData.projectName;
            } else if (primaryFocusAttribute) {
              // Check if it's a safety band attribute or CycleRAP Score
              const isSafetyBand = ["VB Band", "BB Band", "SB Band", "BP Band"].includes(primaryFocusAttribute);
              const isCycleRAPScore = primaryFocusAttribute === "CycleRAP Score";

              if ((isSafetyBand || isCycleRAPScore) && projectData.scores && projectData.scores.length > i) {
                // For safety bands and CycleRAP Score, use the score value
                const segmentScores = projectData.scores[i];

                let scoreValue = 0;
                if (isSafetyBand) {
                  // Map band name to crash type key (e.g., "SB Band" -> "SB")
                  const crashTypeKey = primaryFocusAttribute.replace(" Band", "");
                  scoreValue = segmentScores[crashTypeKey] || 0;
                } else if (isCycleRAPScore) {
                  // For CycleRAP Score, get the maximum score across all crash types
                  const scores = [segmentScores.VB, segmentScores.BB, segmentScores.SB, segmentScores.BP].filter(s => s !== undefined);
                  scoreValue = scores.length > 0 ? Math.max(...scores) : 0;
                }

                // Apply threshold to get color
                pointColor = getScoreColor(scoreValue);

                // Get category label based on the score
                if (scoreValue <= 5) attrValueText = "Low";
                else if (scoreValue <= 10) attrValueText = "Medium";
                else if (scoreValue <= 20) attrValueText = "High";
                else attrValueText = "Extreme";
              } else {
                // Use attribute color for non-safety-band attributes
                const attrValue = attributes[primaryFocusAttribute];
                attrValueText = getAttrText(primaryFocusAttribute, attrValue);
                pointColor = getCategoryColor(primaryFocusAttribute, attrValueText);
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
  }, [projectsData, primaryFocusAttribute, activeFilters, attrMappings, categoryToggles]);

  const allLatLngs = useMemo(() => allPoints.map(p => p.latlng), [allPoints]);

  // Get only the categories that exist in the data for the selected category filter attribute
  // Filters are INDEPENDENT - we show all categories that exist in the full dataset, not filtered by other filters
  const availableCategories = useMemo(() => {
    if (!categoryFilterAttribute) return [];

    // Get unique categories from all segments, independent of other filters
    const categoriesInData = new Set<string>();

    projectsData.forEach((projectData) => {
      // If categoryFilterAttribute is "Project", collect unique project names
      if (categoryFilterAttribute === "Project") {
        categoriesInData.add(projectData.projectName);
        return;
      }

      // Special handling for CycleRAP Score
      if (categoryFilterAttribute === "CycleRAP Score") {
        projectData.geoFeatures.forEach((_, i) => {
          if (projectData.scores && projectData.scores.length > i) {
            const segmentScores = projectData.scores[i];
            const scores = [segmentScores.VB, segmentScores.BB, segmentScores.SB, segmentScores.BP].filter(s => s !== undefined);
            const scoreValue = scores.length > 0 ? Math.max(...scores) : 0;

            let category = "Low";
            if (scoreValue <= 5) category = "Low";
            else if (scoreValue <= 10) category = "Medium";
            else if (scoreValue <= 20) category = "High";
            else category = "Extreme";

            categoriesInData.add(category);
          }
        });
        return;
      }

      // For other attributes (including safety band attributes like BP Band, VB Band, etc.)
      projectData.geoFeatures.forEach((_, i) => {
        const attributes = projectData.attributes[i];
        if (attributes) {
          const attrValue = attributes[categoryFilterAttribute];
          const attrValueText = getAttrText(categoryFilterAttribute, attrValue);
          if (attrValueText) {
            categoriesInData.add(attrValueText);
          }
        }
      });
    });

    // Sort categories with special handling for safety score bands and facility width
    const categories = Array.from(categoriesInData);
    const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band", "CycleRAP Score"].includes(categoryFilterAttribute || "");

    if (isSafetyScore) {
      // For safety score, sort in the order: Low, Medium, High, Extreme
      const riskOrder = ["Low", "Medium", "High", "Extreme"];
      categories.sort((a, b) => {
        const aIndex = riskOrder.indexOf(a);
        const bIndex = riskOrder.indexOf(b);
        // If both are in riskOrder, use their indices; otherwise put them at the end
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
    } else if (categoryFilterAttribute === "Facility Width per Direction") {
      // For facility width, sort in the order: Very Narrow, Narrow, Wide
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

    return categories;
  }, [categoryFilterAttribute, projectsData, attrMappings]);

  // Initialize category toggles when category filter attribute changes or available categories change
  useEffect(() => {
    if (!categoryFilterAttribute) {
      return;
    }

    // Initialize/update toggles for the current category filter attribute
    setCategoryToggles(prev => {
      const newToggles = { ...prev };

      // If this attribute doesn't have toggles yet, create them
      if (!newToggles[categoryFilterAttribute]) {
        newToggles[categoryFilterAttribute] = {};
      }

      // Update toggles to match available categories
      // Preserve all existing user-set toggles, add new categories with default true
      const updatedAttributeToggles: Record<string, boolean> = {
        ...newToggles[categoryFilterAttribute], // Keep all existing toggles
      };

      // Add any new categories from availableCategories that aren't already toggled
      availableCategories.forEach(category => {
        if (!(category in updatedAttributeToggles)) {
          // Only add if not already set by user
          updatedAttributeToggles[category] = true;
        }
      });

      newToggles[categoryFilterAttribute] = updatedAttributeToggles;

      return newToggles;
    });
  }, [categoryFilterAttribute, availableCategories]);

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

  // Generate CSV content from allPoints
  const generateCSV = (): string => {
    const headers = ["Project", "Segment #", "Image Reference", "Latitude", "Longitude"];
    // Add all active filter attributes to the headers
    headers.push(...activeFilters);

    const rows = allPoints.map(point => {
      const row = [
        point.projectName,
        point.idx.toString(),
        point.f.properties?.["Image Reference"] ?? "-",
        point.latlng[0].toFixed(6),
        point.latlng[1].toFixed(6)
      ];
      // Add values for all active filter attributes
      activeFilters.forEach(attr => {
        const attrValue = point.attributes[attr];
        const attrValueText = getAttrText(attr, attrValue);
        row.push(attrValueText || "-");
      });
      return row;
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
      } else if (["VB Band", "BB Band", "SB Band", "BP Band", "CycleRAP Score"].includes(primaryFocusAttribute)) {
        // For safety score bands and CycleRAP Score, sort in the order: Low, Medium, High, Extreme
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

  // Notify parent when chart data updates
  useEffect(() => {
    if (onChartDataUpdate) {
      onChartDataUpdate({
        categoryDistributionData,
        primaryFocusAttribute,
      });
    }
  }, [categoryDistributionData, primaryFocusAttribute, onChartDataUpdate]);

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      overflow="hidden"
      bg="white"
      _dark={{ bg: "gray.800" }}
    >
      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={(e) => setActiveTab(e.value)}>
        <Flex justify="space-between" align="center" borderBottom="1px solid" borderColor="gray.200" bg="white" _dark={{ bg: "gray.800" }} py="3" px="4">
          <Tabs.List>
            <Tabs.Trigger value="map">Map View</Tabs.Trigger>
            <Tabs.Trigger value="table">Table View</Tabs.Trigger>
          </Tabs.List>
          {allPoints.length > 0 && (
            <Button
              colorPalette="blue"
              size="sm"
              onClick={handleDownloadCSV}
            >
              Download Table
            </Button>
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

              {/* Primary Focus Selector - Show when attributes or projects are selected */}
              {(activeFilters.length > 0 || selectedProjects.length > 0) && (
                <Box mb="3" pb="3" borderBottom="1px solid" borderColor="gray.200">
                  <Text fontSize="sm" fontWeight="semibold" mb="2">
                    Primary Focus:
                  </Text>
                  <Flex gap="2" align="center">
                    <Box flex="1" maxW="300px">
                      <Combobox.Root
                        collection={createListCollection({
                          items: [
                            { label: "Project", value: "Project" },
                            ...activeFilters.map((attr) => ({
                              label: attr,
                              value: attr,
                            })),
                          ],
                        })}
                        value={primaryFocusAttribute ? [primaryFocusAttribute] : []}
                        onValueChange={(e) => setPrimaryFocusAttribute(e.value[0] || null)}
                      >
                        <Combobox.Control>
                          <Combobox.Input
                            placeholder="Select primary attribute for color coding"
                            readOnly
                          />
                          <Combobox.IndicatorGroup>
                            <Combobox.Trigger />
                          </Combobox.IndicatorGroup>
                        </Combobox.Control>
                        <Portal>
                          <Combobox.Positioner>
                            <Combobox.Content>
                              <Combobox.Item
                                item={{ label: "Project", value: "Project" }}
                              >
                                Project
                              </Combobox.Item>
                              {activeFilters.map((attr) => (
                                <Combobox.Item
                                  key={attr}
                                  item={{ label: attr, value: attr }}
                                >
                                  {attr}
                                </Combobox.Item>
                              ))}
                            </Combobox.Content>
                          </Combobox.Positioner>
                        </Portal>
                      </Combobox.Root>
                    </Box>
                    {primaryFocusAttribute && (
                      <Text fontSize="xs" color="gray.500">
                        Map is color-coded by: <Text as="span" fontWeight="semibold">{primaryFocusAttribute}</Text>
                      </Text>
                    )}
                  </Flex>
                </Box>
              )}

              {/* Category/Project Toggles - Show when filtering by categories or Project */}
              {((primaryFocusAttribute && primaryFocusAttribute !== "Project" && availableCategories.length > 0) || (primaryFocusAttribute === "Project" && selectedProjects.length > 0)) && (
                <Box mb="3" pb="3" borderBottom="1px solid" borderColor="gray.200">
                  <Flex justify="space-between" align="center" mb="3">
                    <Text fontSize="xs" fontWeight="semibold" color="gray.600" _dark={{ color: "gray.300" }}>
                      Filter Categories:
                    </Text>
                    {activeFilters.length > 1 && (
                      <Flex gap="2">
                        {activeFilters.map((_, idx) => (
                          <Button
                            key={idx}
                            size="sm"
                            variant={categoryFilterAttributeIndex === idx ? "solid" : "outline"}
                            colorPalette={categoryFilterAttributeIndex === idx ? "blue" : "gray"}
                            onClick={() => setCategoryFilterAttributeIndex(idx)}
                          >
                            {idx + 1}
                          </Button>
                        ))}
                      </Flex>
                    )}
                  </Flex>
                  <Text fontSize="xs" color="gray.500" mb="2">
                    {activeFilters.length > 1 ? `Showing categories for: ${categoryFilterAttribute}` : categoryFilterAttribute}
                  </Text>
                  <HStack gap="4" flexWrap="wrap">
                    {(categoryFilterAttribute === "Project" ? selectedProjects : availableCategories).map((category) => {
                      // Get the hex color from getCategoryColor or projectColors for projects
                      const hexColor = categoryFilterAttribute === "Project"
                        ? projectColors[category]
                        : getCategoryColor(categoryFilterAttribute, category);

                      // Map hex colors to Chakra color palettes for Switch component styling
                      const colorMap: Record<string, string> = {
                        // Safety Score colors (CycleRAP Risk Bands)
                        "#87C424": "green",      // Low
                        "#FFCC1A": "yellow",     // Medium / Narrow
                        "#FF5B1A": "orange",     // High
                        "#CD1AFF": "purple",     // Extreme
                        "#9CA3AF": "gray",       // Not Selected
                        // Green shades (Safe)
                        "#16A34A": "green",
                        "#10B981": "teal",
                        // Red shades (Danger)
                        "#DC2626": "red",
                        // Yellow/Orange shades
                        "#F59E0B": "orange",
                        "#CA8A04": "yellow",     // Project Yellow
                        "#EA580C": "orange",     // Project Orange
                        // Blue/Purple/Cyan shades
                        "#2563EB": "blue",
                        "#9333EA": "purple",
                        "#0891B2": "cyan",       // Cyan
                        "#DB2777": "pink",       // Pink
                        // Default
                        "#6B7280": "gray",
                      };
                      const colorPalette = colorMap[hexColor] || "gray";
                      const isChecked = categoryToggles[categoryFilterAttribute]?.[category] ?? true;

                      return (
                        <Flex key={category} align="center" gap="2">
                          {categoryFilterAttribute === "Project" && (
                            <Box
                              w="12px"
                              h="12px"
                              borderRadius="full"
                              bg={hexColor}
                            />
                          )}
                          <div style={{ fontSize: "14px", fontWeight: "500", color: hexColor }}>
                            {category}
                          </div>
                          <Switch
                            colorPalette={colorPalette}
                            size="sm"
                            checked={isChecked}
                            onCheckedChange={(e) => {
                              setCategoryToggles(prev => ({
                                ...prev,
                                [categoryFilterAttribute]: {
                                  ...prev[categoryFilterAttribute],
                                  [category]: e.checked
                                }
                              }));
                            }}
                          />
                        </Flex>
                      );
                    })}
                  </HStack>
                </Box>
              )}

              {/* Legend */}
              <Box>
                {primaryFocusAttribute === "Project" ? (
                  <>
                    <Text fontSize="xs" fontWeight="semibold" mb="1" color="gray.600" _dark={{ color: "gray.300" }}>
                      Project Colors:
                    </Text>
                    <Flex gap="3" flexWrap="wrap">
                      {selectedProjects.map((proj) => (
                        <Flex key={proj} align="center" gap="1.5">
                          <Box
                            w="12px"
                            h="12px"
                            borderRadius="full"
                            bg={projectColors[proj]}
                          />
                          <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.200" }}>
                            {proj}
                          </Text>
                        </Flex>
                      ))}
                    </Flex>
                  </>
                ) : primaryFocusAttribute ? (
                  <>
                    <Text fontSize="xs" fontWeight="semibold" mb="1" color="gray.600" _dark={{ color: "gray.300" }}>
                      {primaryFocusAttribute} Categories:
                    </Text>
                    <Flex gap="3" flexWrap="wrap">
                      {/* Get unique attribute values from allPoints */}
                      {(() => {
                        let categories = Array.from(new Set(allPoints.map(p => p.attributeValue)))
                          .filter(val => val); // Remove empty values

                        // Special sorting for safety score attributes and CycleRAP Score
                        const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band", "CycleRAP Score"].includes(primaryFocusAttribute || "");
                        if (isSafetyScore) {
                          const riskOrder = ["Low", "Medium", "High", "Extreme"];
                          categories.sort((a, b) => {
                            const aIndex = riskOrder.indexOf(a);
                            const bIndex = riskOrder.indexOf(b);
                            if (aIndex === -1 && bIndex === -1) return 0;
                            if (aIndex === -1) return 1;
                            if (bIndex === -1) return -1;
                            return aIndex - bIndex;
                          });
                        } else {
                          categories.sort();
                        }

                        return categories.map((category) => {
                          const hexColor = getCategoryColor(primaryFocusAttribute || "", category);
                          return (
                            <Flex key={category} align="center" gap="1.5">
                              <Box
                                w="12px"
                                h="12px"
                                borderRadius="full"
                                style={{ backgroundColor: hexColor }}
                              />
                              <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.200" }}>
                                {category}
                              </Text>
                            </Flex>
                          );
                        });
                      })()}
                    </Flex>
                  </>
                ) : (
                  <>
                    <Text fontSize="xs" fontWeight="semibold" mb="1" color="gray.600" _dark={{ color: "gray.300" }}>
                      Project Colors:
                    </Text>
                    <Flex gap="3" flexWrap="wrap">
                      {selectedProjects.map((proj) => (
                        <Flex key={proj} align="center" gap="1.5">
                          <Box
                            w="12px"
                            h="12px"
                            borderRadius="full"
                            bg={projectColors[proj]}
                          />
                          <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.200" }}>
                            {proj}
                          </Text>
                        </Flex>
                      ))}
                    </Flex>
                  </>
                )}
              </Box>
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
              <MapContainer
                center={initialCenter.current}
                zoom={13}
                maxZoom={22}
                style={{ width: "100%", height: "100%" }}
                scrollWheelZoom
              >
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
                  let label = `${projectName} - #${idx}`;
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
                    >
                      <Tooltip>{label}</Tooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            )}
          </Box>
        </Tabs.Content>

        {/* Table Tab Content */}
        <Tabs.Content value="table">
          <Box p="6" h="650px" overflowY="auto">
            {allPoints.length === 0 ? (
              <Text color="gray.500">No data to display. Please select projects and load them.</Text>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  border: "1px solid #e2e8f0",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "var(--chakra-colors-bg-subtle)" }}>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid var(--chakra-colors-border-subtle)",
                        fontWeight: "600",
                        color: "var(--chakra-colors-fg)",
                      }}
                    >
                      Project
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid var(--chakra-colors-border-subtle)",
                        fontWeight: "600",
                        color: "var(--chakra-colors-fg)",
                      }}
                    >
                      Segment #
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid var(--chakra-colors-border-subtle)",
                        fontWeight: "600",
                        color: "var(--chakra-colors-fg)",
                      }}
                    >
                      Image Reference
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid var(--chakra-colors-border-subtle)",
                        fontWeight: "600",
                        color: "var(--chakra-colors-fg)",
                      }}
                    >
                      Coordinates
                    </th>
                    {activeFilters.map((attr) => (
                      <th
                        key={attr}
                        style={{
                          padding: "12px",
                          textAlign: "left",
                          borderBottom: "2px solid var(--chakra-colors-border-subtle)",
                          fontWeight: "600",
                          color: "var(--chakra-colors-fg)",
                        }}
                      >
                        {attr}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allPoints.map(({ idx, latlng, f, projectName, color, attributes }, globalIdx) => (
                    <tr key={`${projectName}-${idx}-${globalIdx}`}>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0" }}>
                        <Flex align="center" gap="2">
                          <Box
                            w="8px"
                            h="8px"
                            borderRadius="full"
                            bg={color}
                          />
                          <Text fontSize="sm">{projectName}</Text>
                        </Flex>
                      </td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0" }}>
                        {idx}
                      </td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0" }}>
                        {f.properties?.["Image Reference"] ?? "-"}
                      </td>
                      <td style={{ padding: "12px", borderBottom: "1px solid #e2e8f0" }}>
                        <Text fontSize="xs" fontFamily="mono">
                          [{latlng[0].toFixed(6)}, {latlng[1].toFixed(6)}]
                        </Text>
                      </td>
                      {activeFilters.map((attr) => {
                        let attrValueText = "";
                        if (attr === "Project") {
                          attrValueText = projectName;
                        } else {
                          const attrValue = attributes[attr];
                          attrValueText = getAttrText(attr, attrValue);
                        }
                        return (
                          <td key={attr} style={{ padding: "12px", borderBottom: "1px solid #e2e8f0" }}>
                            <Text fontSize="sm">{attrValueText || "-"}</Text>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Box>
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
}
