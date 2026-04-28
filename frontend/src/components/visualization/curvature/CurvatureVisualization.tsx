import ThemeAwareTileLayer from "../../common/ThemeAwareTileLayer";
import { MapContainer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import { useEffect, useMemo } from 'react';
import proj4 from 'proj4';
import 'leaflet/dist/leaflet.css';

interface PathData {
  type: string;
  color: [number, number, number];
  coordinates: [number, number][];
  is_analysis_layer: boolean;
}

interface CircleGeoJSON {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number][][];
  };
  properties: {
    radius_m: number;
    style: {
      color: string;
      weight: number;
      fill: boolean;
    };
  };
}

interface VisualizationData {
  point: {
    lon: number;
    lat: number;
  };
  radius: number | null;
  width: number | null;
  curvature: number;
  circle_geojson: CircleGeoJSON;
  paths: PathData[];
  layer_used: string | null;
  analysis_window_m: number;
  diagnostics?: {
    min_triplet?: {
      points: [[number, number], [number, number], [number, number]]; // [[x, y], [x, y], [x, y]] in EPSG:3414
    };
  } | null;
}

interface CurvatureVisualizationProps {
  data: VisualizationData;
}

// Helper component to fit map bounds
function FitBounds({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, 22); // Maximum zoom
  }, [map, center]);

  return null;
}

export function CurvatureVisualization({ data }: CurvatureVisualizationProps) {
  const { point, circle_geojson, paths, diagnostics } = data;
  const center: [number, number] = [point.lat, point.lon];

  // Extract circle coordinates (convert from [lon, lat] to [lat, lon])
  const circleCoords: [number, number][] = circle_geojson.geometry.coordinates[0].map(
    ([lon, lat]) => [lat, lon]
  );

  // Convert triplet points from EPSG:3414 to WGS84 (lat, lon) for display
  const tripletPoints: [number, number][] | null = useMemo(() => {
    if (!diagnostics?.min_triplet?.points) return null;

    try {
      // Define EPSG:3414 (Singapore SVY21)
      proj4.defs('EPSG:3414', '+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs');

      // Transform each point from EPSG:3414 (x, y) to WGS84 (lon, lat) then swap to (lat, lon)
      return diagnostics.min_triplet.points.map(([x, y]) => {
        const [lon, lat] = proj4('EPSG:3414', 'WGS84', [x, y]);
        return [lat, lon] as [number, number];
      });
    } catch (error) {
      
      return null;
    }
  }, [diagnostics]);

  return (
    <div style={{ width: '100%', height: '650px', borderRadius: '8px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={22}
        maxZoom={22}
        minZoom={18}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        {/* CartoDB Light basemap - same as Map Preview */}
        <ThemeAwareTileLayer />

        {/* Fit bounds on load */}
        <FitBounds center={center} />

        {/* Black circle outline (5m analysis window) */}
        <Polyline
          positions={circleCoords}
          pathOptions={{
            color: '#000000',
            weight: 5,
            fill: false,
            opacity: 1,
          }}
        />

        {/* Path centerlines (color-coded) */}
        {paths.map((path, index) => {
          const pathCoords: [number, number][] = path.coordinates.map(
            ([lon, lat]) => [lat, lon]
          );

          return (
            <Polyline
              key={index}
              positions={pathCoords}
              pathOptions={{
                color: `rgb(${path.color.join(',')})`,
                weight: path.is_analysis_layer ? 6 : 4,
                opacity: path.is_analysis_layer ? 1 : 0.8,
              }}
            />
          );
        })}

        {/* Red dot (analysis point) */}
        <CircleMarker
          center={center}
          radius={12}
          pathOptions={{
            fillColor: '#ff0000',
            fillOpacity: 1,
            color: '#ffffff',
            weight: 3,
          }}
        />

        {/* Blue triplet points (P1, P2, P3) */}
        {tripletPoints && tripletPoints.map((point, index) => (
          <CircleMarker
            key={`triplet-${index}`}
            center={point}
            radius={8}
            pathOptions={{
              fillColor: '#1E90FF',
              fillOpacity: 1,
              color: '#ffffff',
              weight: 2,
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}

export default CurvatureVisualization;
