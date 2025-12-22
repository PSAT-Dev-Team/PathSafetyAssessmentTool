import { useState, useEffect, useMemo, useRef } from "react";
import { Box, Text, Tabs, Button, Flex, HStack, createListCollection, Combobox, Portal } from "@chakra-ui/react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { Switch } from "../../../components/ui/switch";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import proj4 from "proj4";
import type { Feature, LineString, Position } from "geojson";
import { fetchProjectAttributes, fetchProjectGeoJSON, fetchAttributeMappings, type AttributeRow } from "../../../api";

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

  // Get the first selected attribute for visualization/coloring
  const selectedAttribute = selectedAttributes.find(attr => attr !== null);

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

  // Get the attribute to show categories for
  const categoryFilterAttribute = activeFilters[categoryFilterAttributeIndex];


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
          // Fetch both geodata and attributes in parallel using API functions
          const [geoJson, attrResponse] = await Promise.all([
            fetchProjectGeoJSON(projectName),
            fetchProjectAttributes(projectName)
          ]);

          return {
            projectName,
            geoFeatures: geoJson.features as Feature<LineString, any>[],
            attributes: attrResponse.rows,
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

  // Generate colors for attribute categories
  const attributeCategoryColors = useMemo(() => {
    if (!selectedAttribute) return {};

    const categoryColors: Record<string, string> = {
      // Default colors for common categories
      "Present": "#16A34A", // Green
      "Not Present": "#DC2626", // Red
      "Adequate": "#16A34A", // Green
      "Inadequate": "#DC2626", // Red
      "Wide": "#16A34A", // Green
      "Narrow": "#CA8A04", // Yellow
      "Very Narrow": "#DC2626", // Red
      "One Way": "#2563EB", // Blue
      "Two Way": "#9333EA", // Purple
      // Safety Score Band colors (CycleRAP Risk Bands)
      "Not Selected": "#9CA3AF", // Gray
      "Low": "#87C424", // Green (CycleRAP Low)
      "Medium": "#FFCC1A", // Yellow (CycleRAP Medium)
      "High": "#FF5B1A", // Orange (CycleRAP High)
      "Extreme": "#CD1AFF", // Purple (CycleRAP Extreme)
      "Moderate to high": "#DC2626", // Red
      "None": "#6B7280", // Gray
      "Shared": "#DC2626", // Red
      "Separate/NA": "#16A34A", // Green
      "Sharp Turn Present": "#DC2626", // Red
      "No Sharp Turn Present": "#16A34A", // Green
      "< 5 Degrees": "#16A34A", // Green
      "=/> 5 Degrees": "#DC2626", // Red
      "< 20km/h": "#16A34A", // Green
      "=/> 20km/h": "#DC2626", // Red
      "< 10km/h": "#16A34A", // Green
      "=/> 10km/h": "#DC2626", // Red
      "1 per Direction/NA": "#16A34A", // Green
      "> 1 per Direction": "#DC2626", // Red
      // Facility Types
      "Sidewalk": "#2563EB",
      "Multi-Use Path": "#16A34A",
      "Off-Road Bicycle Path": "#10B981",
      "On-road Bicycle Lane": "#CA8A04",
      "Road Shoulder": "#F59E0B",
      "Mixed Traffic Road Lane": "#DC2626",
    };

    return categoryColors;
  }, [selectedAttribute]);

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

    // Helper function to convert numeric attribute value to text using mappings
    const getAttrText = (attrName: string, attrValue: any): string => {
      // Handle safety score band values (VB Band, BB Band, SB Band, BP Band)
      if (["VB Band", "BB Band", "SB Band", "BP Band"].includes(attrName)) {
        const safetyScoreBands: Record<number, string> = {
          0: "Not Selected",
          1: "Low",
          2: "Medium",
          3: "High",
          4: "Extreme",
        };
        if (typeof attrValue === "number") {
          return safetyScoreBands[attrValue] || String(attrValue);
        }
      }

      // If we have a mapping for this attribute and the value is a number
      if (attrMappings[attrName] && typeof attrValue === "number") {
        return attrMappings[attrName][String(attrValue)] || String(attrValue);
      }
      return String(attrValue);
    };

    projectsData.forEach((projectData) => {
      projectData.geoFeatures.forEach((feature, i) => {
        const g = feature.geometry;
        if (g?.type === "LineString" && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
          // Get the corresponding attributes for this feature (by index)
          const attributes = projectData.attributes[i];

          if (attributes) {
            // Check if segment matches all active filters
            // Segments must have non-empty values for ALL selected filter attributes
            if (activeFilters.length > 0) {
              let matchesAllFilters = true;

              for (const filterAttr of activeFilters) {
                let attrValueText = "";

                // Special handling for "Project" filter
                if (filterAttr === "Project") {
                  attrValueText = projectData.projectName;
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
                const filterToggles = categoryToggles[filterAttr];
                if (filterToggles && Object.keys(filterToggles).length > 0) {
                  // For "Project", default to enabled if not explicitly set
                  if (filterAttr === "Project") {
                    if (filterToggles[attrValueText] === false) {
                      matchesAllFilters = false;
                      break;
                    }
                  } else {
                    // For other attributes, default to disabled if not explicitly set
                    if (!filterToggles[attrValueText]) {
                      matchesAllFilters = false;
                      break;
                    }
                  }
                }
              }

              if (!matchesAllFilters) {
                return; // Skip segment - doesn't match all filters or category toggles
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
              // Use attribute color
              const attrValue = attributes[primaryFocusAttribute];
              attrValueText = getAttrText(primaryFocusAttribute, attrValue);
              pointColor = attributeCategoryColors[attrValueText] || "#6B7280"; // Gray as fallback
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
  }, [projectsData, primaryFocusAttribute, activeFilters, attrMappings, attributeCategoryColors, categoryToggles]);

  const allLatLngs = useMemo(() => allPoints.map(p => p.latlng), [allPoints]);

  // Helper function to convert numeric attribute value to text using mappings
  const getAttrText = (attrName: string, attrValue: any): string => {
    // Handle safety score band values (VB Band, BB Band, SB Band, BP Band)
    if (["VB Band", "BB Band", "SB Band", "BP Band"].includes(attrName)) {
      const safetyScoreBands: Record<number, string> = {
        0: "Not Selected",
        1: "Low",
        2: "Medium",
        3: "High",
        4: "Extreme",
        5: "Extreme",
      };
      if (typeof attrValue === "number") {
        return safetyScoreBands[attrValue] || "Not Selected";
      }
    }

    // If we have a mapping for this attribute and the value is a number
    if (attrMappings[attrName] && typeof attrValue === "number") {
      return attrMappings[attrName][String(attrValue)] || String(attrValue);
    }
    return String(attrValue);
  };

  // Get only the categories that exist in the FILTERED data for the selected category filter attribute
  const availableCategories = useMemo(() => {
    if (!categoryFilterAttribute) return [];

    // Get unique categories from segments that match all other active filters
    const categoriesInFilteredData = new Set<string>();

    // Get the other filters (all except the current category filter attribute)
    const otherFilters = activeFilters.filter(f => f !== categoryFilterAttribute);

    projectsData.forEach((projectData) => {
      // If categoryFilterAttribute is "Project", collect unique project names
      if (categoryFilterAttribute === "Project") {
        categoriesInFilteredData.add(projectData.projectName);
        return;
      }

      projectData.geoFeatures.forEach((_, i) => {
        const attributes = projectData.attributes[i];
        if (attributes) {
          // Check if this segment matches all OTHER filters (not the category filter itself)
          let matchesOtherFilters = true;
          for (const filterAttr of otherFilters) {
            let attrValueText = "";
            if (filterAttr === "Project") {
              attrValueText = projectData.projectName;
            } else {
              const attrValue = attributes[filterAttr];
              attrValueText = getAttrText(filterAttr, attrValue);
            }
            if (!attrValueText || attrValueText === "Not Selected") {
              matchesOtherFilters = false;
              break;
            }
          }

          // If matches all other filters, add its category for the category filter attribute
          if (matchesOtherFilters) {
            const attrValue = attributes[categoryFilterAttribute];
            const attrValueText = getAttrText(categoryFilterAttribute, attrValue);
            if (attrValueText && attrValueText !== "Not Selected") {
              categoriesInFilteredData.add(attrValueText);
            }
          }
        }
      });
    });

    // Sort categories with special handling for safety score bands
    const categories = Array.from(categoriesInFilteredData);
    const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band"].includes(categoryFilterAttribute || "");

    if (isSafetyScore) {
      // For safety score, sort in the order: Low, Medium, High, Extreme, Not Selected
      const riskOrder = ["Low", "Medium", "High", "Extreme", "Not Selected"];
      categories.sort((a, b) => {
        const aIndex = riskOrder.indexOf(a);
        const bIndex = riskOrder.indexOf(b);
        return (aIndex === -1 ? riskOrder.length : aIndex) - (bIndex === -1 ? riskOrder.length : bIndex);
      });
    } else {
      categories.sort();
    }

    return categories;
  }, [categoryFilterAttribute, activeFilters, projectsData, attrMappings]);

  // Initialize category toggles when category filter attribute changes
  useEffect(() => {
    if (!categoryFilterAttribute) {
      return;
    }

    // Initialize toggles for the current category filter attribute if not already set
    setCategoryToggles(prev => {
      if (prev[categoryFilterAttribute]) {
        // Already initialized, keep existing state
        return prev;
      }

      // Create new toggles for this attribute with all categories enabled by default
      const newToggles = { ...prev };
      newToggles[categoryFilterAttribute] = {};
      availableCategories.forEach(category => {
        newToggles[categoryFilterAttribute][category] = true;
      });
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
      return Object.entries(categoryCounts)
        .map(([category, count]) => ({
          category,
          count,
          color: attributeCategoryColors[category] || "#6B7280",
        }))
        .sort((a, b) => b.count - a.count); // Sort by count descending
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

              {/* Category Toggles - Only show when an attribute (not Project) is selected */}
              {primaryFocusAttribute && primaryFocusAttribute !== "Project" && availableCategories.length > 0 && (
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
                    {availableCategories.map((category) => {
                      const color = attributeCategoryColors[category] || "gray";
                      const colorMap: Record<string, string> = {
                        "#16A34A": "green",
                        "#DC2626": "red",
                        "#CA8A04": "yellow",
                        "#2563EB": "blue",
                        "#9333EA": "purple",
                        "#6B7280": "gray",
                        "#10B981": "teal",
                        "#F59E0B": "orange",
                        "#87C424": "green",
                        "#FFCC1A": "yellow",
                        "#FF5B1A": "orange",
                        "#CD1AFF": "purple",
                        "#9CA3AF": "gray",
                      };
                      const colorPalette = colorMap[color] || "gray";
                      const isSafetyScore = ["VB Band", "BB Band", "SB Band", "BP Band"].includes(categoryFilterAttribute || "");

                      return (
                        <Flex key={category} align="center" gap="2">
                          {isSafetyScore && (
                            <Box
                              width="12px"
                              height="12px"
                              borderRadius="2px"
                              bg={color}
                              flexShrink={0}
                            />
                          )}
                          <Text
                            fontSize="sm"
                            fontWeight="medium"
                            color={categoryToggles[categoryFilterAttribute]?.[category] ? `${colorPalette}.600` : "gray.500"}
                          >
                            {category}
                          </Text>
                          <Switch
                            colorPalette={colorPalette}
                            size="sm"
                            checked={categoryToggles[categoryFilterAttribute]?.[category] || false}
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

              {/* Project Filter Toggles - Show when "Project" is in active filters OR is the Primary Focus */}
              {(activeFilters.includes("Project") || primaryFocusAttribute === "Project") && selectedProjects.length > 0 && (
                <Box mb="3" pb="3" borderBottom="1px solid" borderColor="gray.200">
                  <Text fontSize="xs" fontWeight="semibold" color="gray.600" _dark={{ color: "gray.300" }} mb="3">
                    Filter Projects:
                  </Text>
                  <HStack gap="4" flexWrap="wrap">
                    {selectedProjects.map((project) => {
                      const colorPalette = "blue";
                      return (
                        <Flex key={project} align="center" gap="2">
                          <Box
                            w="12px"
                            h="12px"
                            borderRadius="full"
                            bg={projectColors[project]}
                          />
                          <Text
                            fontSize="sm"
                            fontWeight="medium"
                            color={categoryToggles["Project"]?.[project] ? "blue.600" : "gray.500"}
                          >
                            {project}
                          </Text>
                          <Switch
                            colorPalette={colorPalette}
                            size="sm"
                            checked={categoryToggles["Project"]?.[project] !== false}
                            onCheckedChange={(e) => {
                              setCategoryToggles(prev => ({
                                ...prev,
                                "Project": {
                                  ...prev["Project"],
                                  [project]: e.checked
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
                      {Array.from(new Set(allPoints.map(p => p.attributeValue)))
                        .filter(val => val) // Remove empty values
                        .sort()
                        .map((category) => (
                          <Flex key={category} align="center" gap="1.5">
                            <Box
                              w="12px"
                              h="12px"
                              borderRadius="full"
                              bg={attributeCategoryColors[category] || "#6B7280"}
                            />
                            <Text fontSize="xs" color="gray.700" _dark={{ color: "gray.200" }}>
                              {category}
                            </Text>
                          </Flex>
                        ))}
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
                zoom={12}
                style={{ width: "100%", height: "100%" }}
                scrollWheelZoom
                preferCanvas
              >
                {/* Tile Layer */}
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; OpenStreetMap contributors & CARTO'
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
