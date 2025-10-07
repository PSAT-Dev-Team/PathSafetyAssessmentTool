import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Box } from '@chakra-ui/react';

function MapViewerLeaflet({ geoData, onSegmentClick, selectedIndex = 0 }) {
  // CycleRAP risk colors matching your legend
  const riskColors = [
    { name: 'Low', color: 'rgb(135, 196, 36)' },      // Green
    { name: 'Medium', color: 'rgb(255, 204, 26)' },   // Yellow
    { name: 'High', color: 'rgb(255, 91, 26)' },      // Orange
    { name: 'Extreme', color: 'rgb(205, 26, 255)' }   // Magenta
  ];
  
  // Assign random risk level to each segment (for now)
  const segmentsWithRisk = geoData.map((segment, idx) => {
    if (!segment._riskLevel) {
      segment._riskLevel = Math.floor(Math.random() * 4); // 0-3
    }
    return segment;
  });
  
  const allCoords = geoData.flatMap(s => s.coordinates || []);
  const center = allCoords.length > 0 
    ? [allCoords[0][1], allCoords[0][0]]
    : [1.3484, 103.8486];

  return (
    <Box height="600px" width="100%">
      <MapContainer 
        center={center} 
        zoom={18}
        maxZoom={22} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            maxZoom={22}
            maxNativeZoom={18}
        />
        
        {segmentsWithRisk.map((segment, idx) => {
          const positions = segment.coordinates.map(coord => [coord[1], coord[0]]);
          const riskLevel = segment._riskLevel;
          const riskInfo = riskColors[riskLevel];
          const isSelected = idx === selectedIndex;
          
          // Calculate segment length
          const calculateLength = (coords) => {
            let total = 0;
            for (let i = 0; i < coords.length - 1; i++) {
              const [lon1, lat1] = coords[i];
              const [lon2, lat2] = coords[i + 1];
              const R = 6371000; // Earth radius in meters
              const dLat = (lat2 - lat1) * Math.PI / 180;
              const dLon = (lon2 - lon1) * Math.PI / 180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                        Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              total += R * c;
            }
            return total;
          };
          
          const segmentLength = calculateLength(segment.coordinates);
          
          return (
            <React.Fragment key={idx}>
              {/* Draw line */}
              <Polyline
                positions={positions}
                color={riskInfo.color}
                weight={isSelected ? 15 : 10}
                opacity={isSelected ? 1 : 0.8}
                eventHandlers={{
                  click: () => onSegmentClick(idx)
                }}
              >
                <Popup>
                  <div>
                    <strong>Segment {idx + 1}</strong><br/>
                    <strong>Image:</strong> {segment['Image Reference']}<br/>
                    <strong>Risk Level:</strong> <span style={{color: riskInfo.color, fontWeight: 'bold'}}>{riskInfo.name}</span><br/>
                    <strong>Length:</strong> {segmentLength.toFixed(2)}m<br/>
                    <strong>Coordinates:</strong> {segment.coordinates.length} points<br/>
                    <strong>Start:</strong> [{segment.coordinates[0][0].toFixed(6)}, {segment.coordinates[0][1].toFixed(6)}]<br/>
                    <strong>End:</strong> [{segment.coordinates[segment.coordinates.length-1][0].toFixed(6)}, {segment.coordinates[segment.coordinates.length-1][1].toFixed(6)}]
                  </div>
                </Popup>
              </Polyline>
              
              {/* Draw points at each coordinate */}
              {positions.map((pos, pIdx) => (
                <CircleMarker
                  key={`${idx}-${pIdx}`}
                  center={pos}
                  radius={isSelected ? 10 : 6}
                  fillColor={riskInfo.color}
                  color="white"
                  weight={2}
                  fillOpacity={0.9}
                >
                  <Popup>
                    <div>
                      <strong>Segment {idx + 1}, Point {pIdx + 1}</strong><br/>
                      <strong>Risk Level:</strong> <span style={{color: riskInfo.color, fontWeight: 'bold'}}>{riskInfo.name}</span><br/>
                      <strong>Coordinates:</strong><br/>
                      Lon: {segment.coordinates[pIdx][0].toFixed(6)}<br/>
                      Lat: {segment.coordinates[pIdx][1].toFixed(6)}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </React.Fragment>
          );
        })}
        
        <AutoZoom geoData={geoData} />
      </MapContainer>
    </Box>
  );
}

function AutoZoom({ geoData }) {
  const map = useMap();
  
  useEffect(() => {
    if (geoData && geoData.length > 0) {
      const allCoords = geoData.flatMap(s => s.coordinates || []);
      const bounds = allCoords.map(coord => [coord[1], coord[0]]);
      
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [geoData, map]);
  
  return null;
}

export default MapViewerLeaflet;