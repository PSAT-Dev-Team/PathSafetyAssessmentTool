import ThemeAwareTileLayer from "../../components/common/ThemeAwareTileLayer";
import { useEffect, useState, useMemo, useRef } from "react";
import { listShapefiles, type ShapefileInfo } from "../../api";
import { Spinner, Text, Badge, Box, Flex, HStack } from "@chakra-ui/react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Polygon as LeafletPolygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import "./gisLayersPage.css";

// Helper component to adjust bounds
function FitBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [bounds, map]);
  return null;
}

type ParsedLine = { positions: [number, number][]; props: any };
type ParsedPoint = { latlng: [number, number]; props: any };
type ParsedPolygon = { positions: [number, number][][]; props: any };

export default function GisLayersPage() {
  const [shapefiles, setShapefiles] = useState<ShapefileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map state
  const [selectedLayer, setSelectedLayer] = useState<ShapefileInfo | null>(null);
  const [geojsonData, setGeojsonData] = useState<any | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  
  const initialCenter = useRef<[number, number]>([1.3521, 103.8198]);

  useEffect(() => {
    async function loadLayers() {
      try {
        setLoading(true);
        const data = await listShapefiles();
        setShapefiles(data);
        setError(null);
      } catch (err: any) {
        console.error("Failed to load shapefiles", err);
        setError(err.message || "Failed to load shapefiles");
      } finally {
        setLoading(false);
      }
    }
    loadLayers();
  }, []);

  // Fetch GeoJSON when a layer is selected
  useEffect(() => {
    if (!selectedLayer) {
      setGeojsonData(null);
      return;
    }

    let aborted = false;
    async function loadGeoJson() {
      try {
        setMapLoading(true);
        setMapError(null);
        
        const res = await fetch("/api/shapefiles/geojson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            path: selectedLayer!.path,
            max_features: 10000 
          })
        });
        
        if (!res.ok) {
          throw new Error(await res.text().catch(() => "Failed to load map data"));
        }
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        if (!aborted) {
          setGeojsonData(data);
        }
      } catch (err: any) {
        console.error("Error loading geojson:", err);
        if (!aborted) setMapError(err.message || "Failed to parse shapefile geometry");
      } finally {
        if (!aborted) setMapLoading(false);
      }
    }

    loadGeoJson();
    return () => { aborted = true; };
  }, [selectedLayer]);

  // Parse ALL geometry types from GeoJSON
  const mapFeatures = useMemo(() => {
    if (!geojsonData || !geojsonData.features) return null;
    
    const lines: ParsedLine[] = [];
    const points: ParsedPoint[] = [];
    const polygons: ParsedPolygon[] = [];
    let bounds = L.latLngBounds([]);

    geojsonData.features.forEach((feature: any) => {
      const geom = feature.geometry;
      if (!geom) return;
      const props = feature.properties || {};

      switch (geom.type) {
        case "Point": {
          const [lon, lat] = geom.coordinates;
          const ll: [number, number] = [lat, lon];
          points.push({ latlng: ll, props });
          bounds.extend(ll);
          break;
        }
        case "MultiPoint": {
          geom.coordinates.forEach((c: [number, number]) => {
            const ll: [number, number] = [c[1], c[0]];
            points.push({ latlng: ll, props });
            bounds.extend(ll);
          });
          break;
        }
        case "LineString": {
          const coords = geom.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
          lines.push({ positions: coords, props });
          coords.forEach((c: [number, number]) => bounds.extend(c));
          break;
        }
        case "MultiLineString": {
          geom.coordinates.forEach((line: [number, number][]) => {
            const coords = line.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
            lines.push({ positions: coords, props });
            coords.forEach((c: [number, number]) => bounds.extend(c));
          });
          break;
        }
        case "Polygon": {
          const rings = geom.coordinates.map((ring: [number, number][]) =>
            ring.map((c: [number, number]) => [c[1], c[0]] as [number, number])
          );
          polygons.push({ positions: rings, props });
          rings[0]?.forEach((c: [number, number]) => bounds.extend(c));
          break;
        }
        case "MultiPolygon": {
          geom.coordinates.forEach((poly: [number, number][][]) => {
            const rings = poly.map((ring: [number, number][]) =>
              ring.map((c: [number, number]) => [c[1], c[0]] as [number, number])
            );
            polygons.push({ positions: rings, props });
            rings[0]?.forEach((c: [number, number]) => bounds.extend(c));
          });
          break;
        }
      }
    });

    const totalCount = lines.length + points.length + polygons.length;
    return { lines, points, polygons, bounds: bounds.isValid() ? bounds : null, totalCount };
  }, [geojsonData]);


  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const renderTooltip = (props: any) => (
    <Tooltip sticky>
      <Box p={1}>
        {Object.entries(props).slice(0, 5).map(([k, v]) => (
          <Text key={k} fontSize="xs"><strong>{k}:</strong> {String(v)}</Text>
        ))}
      </Box>
    </Tooltip>
  );

  return (
    <div className="gis-layers-root">
      <div className="gis-layers-header">
        <h1 className="gis-layers-title">GIS Layers Mapping</h1>
        <p className="gis-layers-subtitle">
          View all the shapefiles currently available in the system on the interactive map below.
        </p>
      </div>

      <Flex h="calc(100vh - 180px)" gap="4">
        {/* Left Side: Table of Layers */}
        <Box 
          flex="0 0 400px" 
          bg="white" 
          borderRadius="lg" 
          boxShadow="sm" 
          overflow="hidden"
          display="flex"
          flexDirection="column"
          borderWidth="1px"
        >
          <Box p={4} borderBottom="1px solid" borderColor="gray.200" bg="gray.50">
            <Text fontWeight="600">Available Shapefiles</Text>
          </Box>
          
          <Box flex="1" overflowY="auto">
            {loading ? (
              <Flex justify="center" align="center" h="100%" p={4}>
                <Spinner /><Text ml={3}>Loading files...</Text>
              </Flex>
            ) : error ? (
                 <Box p={4} color="red.500">{error}</Box>
            ) : shapefiles.length === 0 ? (
                 <Box p={4} color="gray.500">No shapefiles found.</Box>
            ) : (
              <div className="layer-list-container">
                {shapefiles.map(file => {
                  const isSelected = selectedLayer?.path === file.path;
                  return (
                    <Box 
                      key={file.path} 
                      p={3} 
                      borderBottom="1px solid" 
                      borderColor="gray.100"
                      cursor="pointer"
                      bg={isSelected ? "blue.50" : "white"}
                      _hover={{ bg: isSelected ? "blue.100" : "gray.50" }}
                      onClick={() => setSelectedLayer(isSelected ? null : file)}
                      transition="background-color 0.2s"
                    >
                      <Text fontWeight="600" fontSize="sm" truncate title={file.name}>
                        {file.name}
                      </Text>
                      <HStack mt={1} fontSize="xs" color="gray.500" justify="space-between">
                        <Badge colorPalette="blue" variant="subtle" size="sm">{file.category}</Badge>
                        <Text>{formatBytes(file.size)}</Text>
                      </HStack>
                      <HStack mt={1} fontSize="xs" color="gray.500" gap="3">
                        <Text><strong>Year:</strong> {file.year}</Text>
                        <Text truncate title={file.source}><strong>Source:</strong> {file.source}</Text>
                      </HStack>
                    </Box>
                  );
                })}
              </div>
            )}
          </Box>
        </Box>

        {/* Right Side: Map */}
        <Box 
          flex="1" 
          bg="gray.100" 
          borderRadius="lg" 
          boxShadow="sm"
          borderWidth="1px" 
          overflow="hidden"
          position="relative"
        >
          {matchMapState(selectedLayer, mapLoading, mapError, mapFeatures)}
          <MapContainer
            center={initialCenter.current}
            zoom={12}
            style={{ width: "100%", height: "100%" }}
            scrollWheelZoom
          >
            <ThemeAwareTileLayer />

            {mapFeatures?.bounds && (
              <FitBounds bounds={mapFeatures.bounds} />
            )}

            {/* Render Polygons */}
            {mapFeatures?.polygons.map((poly, i) => (
              <LeafletPolygon
                key={`poly-${i}`}
                positions={poly.positions}
                pathOptions={{
                  color: "#9333EA",
                  weight: 2,
                  opacity: 0.8,
                  fillColor: "#9333EA",
                  fillOpacity: 0.2
                }}
              >
                {renderTooltip(poly.props)}
              </LeafletPolygon>
            ))}

            {/* Render Lines */}
            {mapFeatures?.lines.map((line, i) => (
              <Polyline
                key={`line-${i}`}
                positions={line.positions}
                pathOptions={{
                  color: "#2563eb",
                  weight: 3,
                  opacity: 0.8
                }}
              >
                {renderTooltip(line.props)}
              </Polyline>
            ))}

            {/* Render Points */}
            {mapFeatures?.points.map((pt, i) => (
              <CircleMarker
                key={`pt-${i}`}
                center={pt.latlng}
                radius={5}
                pathOptions={{
                  color: "#DC2626",
                  weight: 1,
                  opacity: 0.9,
                  fillOpacity: 0.7,
                  fillColor: "#EF4444"
                }}
              >
                {renderTooltip(pt.props)}
              </CircleMarker>
            ))}

          </MapContainer>
        </Box>
      </Flex>
    </div>
  );
}

function matchMapState(selectedLayer: any, loading: boolean, error: string | null, features: any) {
    if (!selectedLayer) {
      return (
        <Flex position="absolute" inset="0" zIndex="1000" bg="whiteAlpha.800" justify="center" align="center">
           <Text color="gray.600" fontWeight="medium">Select a layer from the list to view it on the map</Text>
        </Flex>
      );
    }
    if (loading) {
        return (
          <Flex position="absolute" inset="0" zIndex="1000" bg="whiteAlpha.800" justify="center" align="center" direction="column" gap={3}>
             <Spinner size="xl" color="blue.500" />
             <Text color="gray.600" fontWeight="medium">Loading layer: {selectedLayer.name}...</Text>
          </Flex>
        );
    }
    if (error) {
       return (
          <Flex position="absolute" inset="0" zIndex="1000" bg="whiteAlpha.800" justify="center" align="center">
             <Text color="red.500" fontWeight="medium">Failed to render layer: {error}</Text>
          </Flex>
        );
    }
    
    if (features && features.totalCount === 0) {
      return (
         <Flex position="absolute" inset="0" zIndex="1000" bg="transparent" justify="center" align="flex-end" pb={10} pointerEvents="none">
             <Box bg="white" px={4} py={2} borderRadius="md" boxShadow="md">
               <Text color="orange.600" fontWeight="medium">Layer loaded but contains no renderable geometries.</Text>
             </Box>
         </Flex>
       );
    }
    return null;
}
