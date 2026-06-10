import { useRef } from 'react';
import { Box, Button, IconButton, Text, Flex } from '@chakra-ui/react';
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';
import { FaFileImport, FaTrash } from 'react-icons/fa';
import { Switch } from '../ui/switch';
import './AnalysisPanel.css';

interface GISLayerToggle {
  key: string;
  label: string;
  color: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colorPalette: string;
}

interface AnalysisSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  showFootpath: boolean;
  setShowFootpath: (v: boolean) => void;
  showCycling: boolean;
  setShowCycling: (v: boolean) => void;
  showShared: boolean;
  setShowShared: (v: boolean) => void;
  showRoadcrossing: boolean;
  setShowRoadcrossing: (v: boolean) => void;
  showMrtExit: boolean;
  setShowMrtExit: (v: boolean) => void;
  showBusStop: boolean;
  setShowBusStop: (v: boolean) => void;
  showBusLane: boolean;
  setShowBusLane: (v: boolean) => void;
  showParkingLot: boolean;
  setShowParkingLot: (v: boolean) => void;
  showKerbLine: boolean;
  setShowKerbLine: (v: boolean) => void;
  showBicycleCrossing: boolean;
  setShowBicycleCrossing: (v: boolean) => void;
  showPathDefects: boolean;
  setShowPathDefects: (v: boolean) => void;
  showStateLand: boolean;
  setShowStateLand: (v: boolean) => void;
  showStatBoard: boolean;
  setShowStatBoard: (v: boolean) => void;
  showLandPrivate: boolean;
  setShowLandPrivate: (v: boolean) => void;
  showLandMinistry: boolean;
  setShowLandMinistry: (v: boolean) => void;
  onFilesSelected: (files: File[]) => void;
  importedShapefileHasData: boolean;
  importedShapefileLoading: boolean;
  importedShapefileError: string | null;
  importedShapefileName: string | null;
  onClearImportedShapefile: () => void;
}

export function AnalysisSidebar({
  isOpen,
  onToggle,
  showFootpath, setShowFootpath,
  showCycling, setShowCycling,
  showShared, setShowShared,
  showRoadcrossing, setShowRoadcrossing,
  showMrtExit, setShowMrtExit,
  showBusStop, setShowBusStop,
  showBusLane, setShowBusLane,
  showParkingLot, setShowParkingLot,
  showKerbLine, setShowKerbLine,
  showBicycleCrossing, setShowBicycleCrossing,
  showPathDefects, setShowPathDefects,
  showStateLand, setShowStateLand,
  showStatBoard, setShowStatBoard,
  showLandPrivate, setShowLandPrivate,
  showLandMinistry, setShowLandMinistry,
  onFilesSelected,
  importedShapefileHasData,
  importedShapefileLoading,
  importedShapefileError,
  importedShapefileName,
  onClearImportedShapefile,
}: AnalysisSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const layers: GISLayerToggle[] = [
    { key: 'footpath',          label: 'Footpath',          color: '#1E90FF', colorPalette: 'blue',   value: showFootpath,          onChange: setShowFootpath },
    { key: 'cycling',           label: 'Cycling Path',      color: '#B91C1C', colorPalette: 'red',    value: showCycling,           onChange: setShowCycling },
    { key: 'shared',            label: 'Shared Path',       color: '#A855F7', colorPalette: 'purple', value: showShared,            onChange: setShowShared },
    { key: 'roadcrossing',      label: 'Road Crossing',     color: '#10B981', colorPalette: 'green',  value: showRoadcrossing,      onChange: setShowRoadcrossing },
    { key: 'bicycle_crossing',  label: 'Bicycle Crossing',  color: '#F97316', colorPalette: 'orange', value: showBicycleCrossing,   onChange: setShowBicycleCrossing },
    { key: 'mrt_exit',          label: 'MRT Exit',          color: '#06B6D4', colorPalette: 'cyan',   value: showMrtExit,           onChange: setShowMrtExit },
    { key: 'bus_stop',          label: 'Bus Stop',          color: '#8B5CF6', colorPalette: 'purple', value: showBusStop,           onChange: setShowBusStop },
    { key: 'bus_lane',          label: 'Bus Lane',          color: '#EAB308', colorPalette: 'yellow', value: showBusLane,           onChange: setShowBusLane },
    { key: 'parking_lot',       label: 'Parking Lot',       color: '#D97706', colorPalette: 'orange', value: showParkingLot,        onChange: setShowParkingLot },
    { key: 'kerb_line',         label: 'Kerb Line',         color: '#D946EF', colorPalette: 'pink',   value: showKerbLine,          onChange: setShowKerbLine },
    { key: 'path_defects',      label: 'Path Defects',      color: '#EF4444', colorPalette: 'red',    value: showPathDefects,       onChange: setShowPathDefects },
    { key: 'state_land',        label: 'State Land',         color: '#14B8A6', colorPalette: 'teal',   value: showStateLand,         onChange: setShowStateLand },
    { key: 'stat_board',        label: 'Stat Board',         color: '#F59E0B', colorPalette: 'yellow', value: showStatBoard,         onChange: setShowStatBoard },
    { key: 'land_private',      label: 'Private Land',       color: '#6366F1', colorPalette: 'purple', value: showLandPrivate,       onChange: setShowLandPrivate },
    { key: 'land_ministry',     label: 'Ministry Land',      color: '#EC4899', colorPalette: 'pink',   value: showLandMinistry,      onChange: setShowLandMinistry },
  ];

  return (
    <>
      {/* Overlay panel — slides in from the left over the map */}
      <Box
        position="absolute"
        top="0"
        left="0"
        bottom="0"
        w={isOpen ? "220px" : "0"}
        overflow="hidden"
        transition="width 0.25s ease"
        zIndex={1000}
        bg="white"
        _dark={{ bg: "gray.800", borderColor: "gray.700" }}
        borderRight={isOpen ? "1px solid" : "none"}
        borderColor="gray.200"
        boxShadow={isOpen ? "lg" : "none"}
      >
        <Box w="220px" h="100%" overflowY="auto" p="3">
          <Text
            fontWeight="semibold"
            mb={3}
            fontSize="xs"
            color="gray.500"
            _dark={{ color: "gray.400" }}
            textTransform="uppercase"
            letterSpacing="wider"
          >
            GIS Layers
          </Text>
          <Box borderBottom="1px solid" borderColor="gray.100" _dark={{ borderColor: "gray.700" }} mb={3} />
          {layers.map((layer) => (
            <Flex
              key={layer.key}
              align="center"
              justify="space-between"
              py="1.5"
              px="1"
              borderRadius="md"
              _hover={{ bg: "gray.50", _dark: { bg: "gray.750" } }}
            >
              <Flex align="center" gap="2" flex="1" minW="0">
                <Box
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  bg={layer.color}
                  flexShrink={0}
                />
                <Text
                  fontSize="sm"
                  fontWeight="medium"
                  color={layer.value ? "gray.800" : "gray.500"}
                  _dark={{ color: layer.value ? "gray.100" : "gray.500" }}
                  truncate
                >
                  {layer.label}
                </Text>
              </Flex>
              <Switch
                colorPalette={layer.colorPalette}
                size="sm"
                checked={layer.value}
                onCheckedChange={(e) => layer.onChange(e.checked)}
                flexShrink={0}
              />
            </Flex>
          ))}

          {/* Import Shapefile */}
          <Box mt={3}>
            <Box borderBottom="1px solid" borderColor="gray.100" _dark={{ borderColor: "gray.700" }} mb={3} />
            <Text
              fontWeight="semibold"
              mb={2}
              fontSize="xs"
              color="gray.500"
              _dark={{ color: "gray.400" }}
              textTransform="uppercase"
              letterSpacing="wider"
            >
              Import
            </Text>
            <Button
              size="xs"
              variant={importedShapefileHasData ? "solid" : "outline"}
              colorPalette={importedShapefileHasData ? "orange" : "gray"}
              loading={importedShapefileLoading}
              w="full"
              mb={importedShapefileHasData ? 1 : 0}
              onClick={() => fileInputRef.current?.click()}
            >
              <FaFileImport />
              <Text ml={1}>{importedShapefileHasData ? "Replace Shapefile" : "Import Shapefile"}</Text>
            </Button>
            {importedShapefileHasData && (
              <Button size="xs" variant="outline" colorPalette="orange" w="full" mb={2} onClick={onClearImportedShapefile}>
                <FaTrash />
                <Text ml={1}>Clear Imported</Text>
              </Button>
            )}
            {!importedShapefileLoading && importedShapefileError && (
              <Text fontSize="xs" color="red.500" mt={1}>{importedShapefileError}</Text>
            )}
            {!importedShapefileLoading && !importedShapefileError && importedShapefileName && (
              <Text fontSize="xs" color="blue.600" mt={1} truncate>Imported: {importedShapefileName}</Text>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.shp,.shx,.dbf,.prj,.cpg,.sbn,.sbx"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length > 0) onFilesSelected(files);
              }}
              style={{ display: "none" }}
            />
          </Box>
        </Box>
      </Box>

      {/* Toggle button — always visible at the left edge of the map */}
      <IconButton
        aria-label="Toggle GIS Layers Panel"
        size="xs"
        position="absolute"
        top="50%"
        left={isOpen ? "220px" : "0"}
        transform="translateY(-50%)"
        transition="left 0.25s ease"
        zIndex={1001}
        onClick={onToggle}
        bg="white"
        color="gray.600"
        _dark={{ bg: "gray.700", color: "gray.200", borderColor: "gray.600" }}
        borderWidth="1px"
        borderColor="gray.200"
        boxShadow="md"
        borderLeftRadius="0"
        borderRightRadius="md"
        w="24px"
        minW="24px"
        h="40px"
        css={{ "& svg": { width: "14px", height: "14px" } }}
      >
        {isOpen ? <FiChevronsLeft /> : <FiChevronsRight />}
      </IconButton>
    </>
  );
}
