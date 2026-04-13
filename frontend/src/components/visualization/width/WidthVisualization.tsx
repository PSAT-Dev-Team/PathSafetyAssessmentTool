import ThemeAwareTileLayer from "../../common/ThemeAwareTileLayer";
import { MapContainer, TileLayer, Polyline, CircleMarker, Circle, useMap, Popup } from 'react-leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import type { WidthVisualizationResponse } from '../../../api/widthVisualization';

interface WidthVisualizationProps {
  data: WidthVisualizationResponse;
}

// Helper component to fit map bounds and center on analysis point
function FitBounds({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, 20); // High zoom to show local area
  }, [map, center]);

  return null;
}

export function WidthVisualization({ data }: WidthVisualizationProps) {
  const center: [number, number] = [data.point.lat, data.point.lon];

  return (
    <div className="width-map" style={{ width: '100%', height: '520px', borderRadius: '8px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={20}
        maxZoom={22}
        minZoom={17}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        {/* CartoDB Light basemap - same as Curvature and Map Preview */}
        <ThemeAwareTileLayer />

        {/* Fit bounds on load */}
        <FitBounds center={center} />

        {/* Search rings - only show if width was NOT found (to show search pattern) */}
        {data.search_info.found_at_radius === null ? (
          // Show all search rings with dashed gray circles when no paths found
          data.search_rings.map((ring, index) => (
            <Circle
              key={`ring-${index}`}
              center={center}
              radius={ring.radius}
              pathOptions={{
                color: '#999',
                weight: 1,
                fillColor: 'transparent',
                fillOpacity: 0,
                dashArray: '5, 5',
              }}
            />
          ))
        ) : (
          // Show only the ring where width was found (green highlight)
          <Circle
            center={center}
            radius={data.search_info.found_at_radius}
            pathOptions={{
              color: '#27AE60',
              weight: 3,
              fillColor: '#27AE60',
              fillOpacity: 0.1,
            }}
          />
        )}

        {/* Path centerlines - color-coded by type */}
        {data.paths.map((path, index) => {
          const pathCoords: [number, number][] = path.coordinates.map(
            ([lon, lat]) => [lat, lon]
          );
          const color = `rgb(${path.color[0]}, ${path.color[1]}, ${path.color[2]})`;
          const weight = path.is_analysis_layer ? 6 : 3; // Bold for analysis layer
          const opacity = path.is_analysis_layer ? 1.0 : 0.7;

          return (
            <Polyline
              key={`path-${index}`}
              positions={pathCoords}
              pathOptions={{
                color,
                weight,
                opacity,
              }}
            >
              {/* Popup with width info if available */}
              {path.width_value !== null && (
                <Popup>
                  <div>
                    <strong>{path.type.toUpperCase()} Path</strong>
                    <br />
                    Width: {path.width_value.toFixed(2)}m
                    {path.is_analysis_layer && (
                      <>
                        <br />
                        <em>(Used for coding)</em>
                      </>
                    )}
                  </div>
                </Popup>
              )}
            </Polyline>
          );
        })}

        {/* Analysis point - red circle marker */}
        <CircleMarker
          center={center}
          radius={10}
          pathOptions={{
            fillColor: '#E74C3C',
            fillOpacity: 1,
            color: '#ffffff',
            weight: 3,
          }}
        >
          <Popup>
            <div>
              <strong>Analysis Point</strong>
              <br />
              Lat: {data.point.lat.toFixed(6)}
              <br />
              Lon: {data.point.lon.toFixed(6)}
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}

export default WidthVisualization;
