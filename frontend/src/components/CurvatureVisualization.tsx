import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';
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
  const { point, circle_geojson, paths } = data;
  const center: [number, number] = [point.lat, point.lon];

  // Extract circle coordinates (convert from [lon, lat] to [lat, lon])
  const circleCoords: [number, number][] = circle_geojson.geometry.coordinates[0].map(
    ([lon, lat]) => [lat, lon]
  );

  return (
    <div style={{ width: '100%', height: '500px', borderRadius: '8px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={22}
        maxZoom={22}
        minZoom={18}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        {/* CartoDB Light basemap - same as Map Preview */}
        <TileLayer
          attribution='&copy; OpenStreetMap contributors & CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          maxZoom={22}
        />

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
      </MapContainer>
    </div>
  );
}

export default CurvatureVisualization;
