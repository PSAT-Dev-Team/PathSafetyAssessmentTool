import ThemeAwareTileLayer from "../../../components/common/ThemeAwareTileLayer";
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { Box } from "@chakra-ui/react";
import "leaflet/dist/leaflet.css";

// Singapore coordinates
const SINGAPORE_CENTER: [number, number] = [1.3521, 103.8198];
const DEFAULT_ZOOM = 12;

// Component to set map view
function SetViewOnLoad() {
  const map = useMap();

  useEffect(() => {
    map.setView(SINGAPORE_CENTER, DEFAULT_ZOOM);
  }, [map]);

  return null;
}

export default function MapView() {
  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      overflow="hidden"
      bg="white"
      _dark={{ bg: "gray.800" }}
      h="500px"
    >
      <MapContainer
        center={SINGAPORE_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <SetViewOnLoad />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    </Box>
  );
}
