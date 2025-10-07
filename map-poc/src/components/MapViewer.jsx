import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, VStack } from '@chakra-ui/react';
import DeckGL from '@deck.gl/react';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

function MapViewer({ geoData, onSegmentClick, selectedIndex = 0 }) {
  const [viewState, setViewState] = useState({
    longitude: 103.851959,
    latitude: 1.290270,
    zoom: 13,
    pitch: 0,
    bearing: 0
  });

  const mapRef = useRef(null);

  // Log first segment coordinates to console
  useEffect(() => {
  if (geoData && geoData.length > 0) {
    console.log('First segment:', geoData[0]);
    console.log('Coordinates:', geoData[0].coordinates);
    
    const allCoords = geoData.flatMap(s => s.coordinates || []);
    if (allCoords.length > 0) {
      const lons = allCoords.map(c => c[0]);
      const lats = allCoords.map(c => c[1]);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      
      console.log('Data bounds:', { minLon, maxLon, minLat, maxLat });
      
      const centerLon = (minLon + maxLon) / 2;
      const centerLat = (minLat + maxLat) / 2;
      
      setViewState(prev => ({
        ...prev,
        longitude: centerLon,
        latitude: centerLat,
        zoom: 18, // CHANGED FROM 15 to 18 - much closer
        transitionDuration: 2000 // Slow zoom so you can see it happening
      }));
    }
  }
}, [geoData]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.jumpTo({
        center: [viewState.longitude, viewState.latitude],
        zoom: viewState.zoom,
        bearing: viewState.bearing,
        pitch: viewState.pitch
      });
    }
  }, [viewState]);

  // Create point markers at each coordinate for visibility
  const pointData = geoData.flatMap((segment, segIdx) => 
    (segment.coordinates || []).map((coord, coordIdx) => ({
      position: coord,
      segmentIndex: segIdx,
      coordIndex: coordIdx,
      segment: segment
    }))
  );

  const layers = [
    // Draw lines
    new PathLayer({
      id: 'path-layer',
      data: geoData,
      getPath: d => d.coordinates,
      getColor: d => {
        const idx = geoData.indexOf(d);
        const colors = [
          [255, 0, 0, 255],     // Red
          [0, 255, 0, 255],     // Green
          [0, 0, 255, 255],     // Blue
          [255, 255, 0, 255],   // Yellow
          [255, 0, 255, 255],   // Magenta
          [0, 255, 255, 255],   // Cyan
        ];
        return colors[idx % colors.length];
      },
      getWidth: 30, // Very thick
      widthMinPixels: 15,
      widthMaxPixels: 50,
      pickable: true,
      onClick: (info) => {
        if (info.object && onSegmentClick) {
          const index = geoData.indexOf(info.object);
          onSegmentClick(index);
        }
      }
    }),
    
    // Draw points at each coordinate
    new ScatterplotLayer({
      id: 'points-layer',
      data: pointData,
      getPosition: d => d.position,
      getRadius: 20,
      getFillColor: d => {
        const colors = [
          [255, 0, 0],     // Red
          [0, 255, 0],     // Green
          [0, 0, 255],     // Blue
          [255, 255, 0],   // Yellow
          [255, 0, 255],   // Magenta
          [0, 255, 255],   // Cyan
        ];
        return colors[d.segmentIndex % colors.length];
      },
      pickable: true,
      radiusMinPixels: 10,
      radiusMaxPixels: 30
    })
  ];

  return (
    <VStack width="100%" gap={2}>
      <Text fontSize="sm" color="red.600">
        Data bounds: Check console for coordinate values
      </Text>
      <Box position="relative" width="100%" height="600px">
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState }) => setViewState(viewState)}
          controller={true}
          layers={layers}
          getTooltip={({ object }) => {
            if (object && object.segment) {
              return {
                html: `<div style="padding: 8px; background: white; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                  <strong>Segment ${object.segmentIndex + 1}</strong><br/>
                  Coord ${object.coordIndex + 1}<br/>
                  Position: ${object.position[0].toFixed(6)}, ${object.position[1].toFixed(6)}
                </div>`,
                style: { fontSize: '0.8em', color: '#000' }
              };
            }
            return null;
          }}
        >
          <InteractiveMap 
            mapRef={mapRef} 
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" 
          />
        </DeckGL>
      </Box>
    </VStack>
  );
}

function InteractiveMap({ mapRef, mapStyle }) {
  const mapContainerRef = useRef(null);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: [103.851959, 1.290270],
        zoom: 11,
        interactive: false
      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapStyle]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0
      }}
    />
  );
}

export default MapViewer;