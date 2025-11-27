import { useState, useEffect, useMemo, useRef } from "react";
import { Box, Text, Tabs, Button, Flex, HStack } from "@chakra-ui/react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { Switch } from "../../../components/ui/switch";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import proj4 from "proj4";
import type { Feature, LineString, Position } from "geojson";
import { fetchProjectAttributes, fetchProjectGeoJSON, fetchAttributeMappings, type AttributeRow } from "../../../api";
import AttributeDistributionChart from "./AttributeDistributionChart";

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
  selectedAttribute: string | null;
}

// CycleRAP Attributes with their specific possible values
interface AttributeConfig {
  name: string;
  options: string[];
}

const cyclerapAttributes: AttributeConfig[] = [
  { name: "Facility Type", options: ["Not Selected", "Sidewalk", "Multi-Use Path", "Off-Road Bicycle Path", "On-road Bicycle Lane", "Road Shoulder", "Mixed Traffic Road Lane"] },
  { name: "Facility access", options: ["Not Selected", "Adequate", "Inadequate"] },
  { name: "Loose or slippery surface", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Tram or Train Rails", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Major Surface Deformation or Drain Opening", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Fixed Obstacle on Facility", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Non-Fixed Obstacle on Facility", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Delineation", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Light Segregation", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Facility Width per Direction", options: ["Not Selected", "Very Narrow", "Narrow", "Wide"] },
  { name: "Flow Direction", options: ["Not Selected", "One Way", "Two Way"] },
  { name: "Width Restriction", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent Road Lane 0-1m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent Vehicle Parking 0-1m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent Severe Hazard 0-1m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent object or level change 0-1m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent Sidewalk 0-1m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent Road Lane 1-3m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent Vehicle Parking 1-3m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent Severe Hazard 1-3m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Adjacent object or level change 1-3m", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Grade", options: ["Not Selected", "< 5 Degrees", "=/> 5 Degrees"] },
  { name: "Curvature", options: ["Not Selected", "Sharp Turn Present", "No Sharp Turn Present"] },
  { name: "Street Lighting", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Pedestrian Crossing", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Intersecting Bicycle Facility", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Intersection Approach", options: ["Not Selected", "Shared", "Separate/NA"] },
  { name: "Intersection or Road Crossing", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Crossing Facility", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Number of lanes – adjacent road", options: ["Not Selected", "1 per Direction/NA", "> 1 per Direction"] },
  { name: "Number of lanes – intersecting road", options: ["Not Selected", "1 per Direction/NA", "> 1 per Direction"] },
  { name: "Property Access", options: ["Not Selected", "Present", "Not Present"] },
  { name: "Peak pedestrian flow along or across facility", options: ["Not Selected", "None", "Low", "Moderate to high"] },
  { name: "Peak bicycle/LV traffic flow", options: ["Not Selected", "Low", "Moderate to high"] },
  { name: "Observed proportion of cargo bikes and mopeds", options: ["Not Selected", "Low", "Moderate to high"] },
  { name: "Bicycle/LV speed – average", options: ["Not Selected", "< 20km/h", "=/> 20km/h"] },
  { name: "Bicycle/LV speed differential", options: ["Not Selected", "< 10km/h", "=/> 10km/h"] },
  { name: "Heavy vehicle flow", options: ["Not Selected", "Low", "Moderate to high"] }
];

type ProjectData = {
  projectName: string;
  geoFeatures: Feature<LineString, any>[];
  attributes: AttributeRow[];
  color: string;
};

export default function AttributeAnalysisMapView({ selectedProjects, selectedAttribute }: AttributeAnalysisMapViewProps) {
  const [activeTab, setActiveTab] = useState<string>("map");
  const [projectsData, setProjectsData] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [panToBounds, setPanToBounds] = useState<L.LatLngBounds | null>(null);
  const [attrMappings, setAttrMappings] = useState<Record<string, Record<string, string>>>({});

  // Category toggle states - managed internally
  const [categoryToggles, setCategoryToggles] = useState<Record<string, boolean>>({});

  // Track if we should auto-fit bounds (only on initial project load, not on category changes)
  const [shouldAutoFit, setShouldAutoFit] = useState(false);

  // Load attribute mappings on mount
  useEffect(() => {
    fetchAttributeMappings()
      .then(setAttrMappings)
      .catch(e => console.error("Failed to load attribute mappings:", e));
  }, []);

  // Get available categories for the selected attribute
  const availableCategories = useMemo(() => {
    if (!selectedAttribute) return [];
    const attr = cyclerapAttributes.find(a => a.name === selectedAttribute);
    return attr ? attr.options.filter(opt => opt !== "Not Selected") : [];
  }, [selectedAttribute]);

  // Initialize category toggles when attribute changes - enable all by default
  useEffect(() => {
    if (!selectedAttribute || availableCategories.length === 0) {
      setCategoryToggles({});
      return;
    }

    const initialToggles: Record<string, boolean> = {};
    availableCategories.forEach(category => {
      initialToggles[category] = true; // Enable all by default
    });
    setCategoryToggles(initialToggles);
  }, [selectedAttribute, availableCategories]);

  // Get list of enabled categories
  const enabledCategories = useMemo(() => {
    return Object.entries(categoryToggles)
      .filter(([_, enabled]) => enabled)
      .map(([category, _]) => category);
  }, [categoryToggles]);

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
      "Low": "#16A34A", // Green
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
            // Determine color based on selected attribute or project
            let pointColor = projectData.color; // Default to project color
            let attrValueText = "";

            if (selectedAttribute) {
              const attrValue = attributes[selectedAttribute];
              attrValueText = getAttrText(selectedAttribute, attrValue);
              pointColor = attributeCategoryColors[attrValueText] || "#6B7280"; // Gray as fallback

              // Filter by enabled categories - skip if category is not enabled
              if (enabledCategories.length > 0 && !enabledCategories.includes(attrValueText)) {
                return; // Skip this point
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
  }, [projectsData, selectedAttribute, attrMappings, attributeCategoryColors, enabledCategories]);

  const allLatLngs = useMemo(() => allPoints.map(p => p.latlng), [allPoints]);

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

  // Calculate category distribution data for the chart
  const categoryDistributionData = useMemo(() => {
    if (!selectedAttribute) return [];

    // Count occurrences of each category
    const categoryCounts: Record<string, number> = {};

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
  }, [allPoints, selectedAttribute, attributeCategoryColors]);

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
        <Tabs.List>
          <Tabs.Trigger value="map">Map View</Tabs.Trigger>
          <Tabs.Trigger value="table">Table View</Tabs.Trigger>
        </Tabs.List>

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

              {/* Category Toggles - Only show when an attribute is selected */}
              {selectedAttribute && availableCategories.length > 0 && (
                <Box mb="3" pb="3" borderBottom="1px solid" borderColor="gray.200">
                  <Text fontSize="xs" fontWeight="semibold" mb="2" color="gray.600" _dark={{ color: "gray.300" }}>
                    Filter Categories:
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
                      };
                      const colorPalette = colorMap[color] || "gray";

                      return (
                        <Flex key={category} align="center" gap="2">
                          <Text
                            fontSize="sm"
                            fontWeight="medium"
                            color={categoryToggles[category] ? `${colorPalette}.600` : "gray.500"}
                          >
                            {category}
                          </Text>
                          <Switch
                            colorPalette={colorPalette}
                            size="sm"
                            checked={categoryToggles[category] || false}
                            onCheckedChange={(e) => {
                              setCategoryToggles(prev => ({
                                ...prev,
                                [category]: e.checked
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
                {selectedAttribute ? (
                  <>
                    <Text fontSize="xs" fontWeight="semibold" mb="1" color="gray.600" _dark={{ color: "gray.300" }}>
                      {selectedAttribute} Categories:
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
                  if (selectedAttribute && attributeValue) {
                    label += ` | ${selectedAttribute}: ${attributeValue}`;
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
                  <tr style={{ backgroundColor: "#f7fafc" }}>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                        fontWeight: "600",
                      }}
                    >
                      Project
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                        fontWeight: "600",
                      }}
                    >
                      Segment #
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                        fontWeight: "600",
                      }}
                    >
                      Image Reference
                    </th>
                    <th
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        borderBottom: "2px solid #e2e8f0",
                        fontWeight: "600",
                      }}
                    >
                      Coordinates
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allPoints.map(({ idx, latlng, f, projectName, color }, globalIdx) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Box>
        </Tabs.Content>
      </Tabs.Root>

      {/* Chart Below Map (Always Visible when attribute is selected) */}
      {selectedAttribute && (
        <Box p="4" bg="bg.panel">
          <AttributeDistributionChart
            categoryData={categoryDistributionData}
            selectedAttribute={selectedAttribute}
          />
        </Box>
      )}
    </Box>
  );
}
