import { TileLayer } from "react-leaflet";
import { useColorMode } from "../ui/color-mode";

export default function ThemeAwareTileLayer() {
  const { colorMode } = useColorMode();
  
  const lightMap = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  const darkMap = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  
  return (
    <TileLayer
      key={colorMode} // Force re-render when theme changes to avoid caching issues
      url={colorMode === "dark" ? darkMap : lightMap}
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors & <a href="https://carto.com/attributions">CARTO</a>'
      maxZoom={22}
    />
  );
}
