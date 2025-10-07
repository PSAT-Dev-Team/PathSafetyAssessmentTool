import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Spinner,
  Container,
  Flex,
} from '@chakra-ui/react';
import MapViewer from './components/MapViewerLeaflet';
import ColorLegend from './components/ColorLegend';
import { readGeoPackage } from './utils/geopackageReader';

function App() {
  const [geoData, setGeoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  // Simple status message display (replaces toasts for now)
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  async function loadData() {
    try {
      setLoading(true);
      
      const data = await readGeoPackage('/geo_data.gpkg');
      
      console.log('Loaded features:', data.length);
      setGeoData(data);
      setStatusMessage(`✓ Loaded ${data.length} path segments successfully`);
      
    } catch (error) {
      console.error('Error loading data:', error);
      setStatusMessage(`✗ Error loading data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleSegmentClick(index) {
    setSelectedIndex(index);
    setStatusMessage(`Viewing segment ${index + 1} of ${geoData?.length || 0}`);
  }

  function handlePrevious() {
    if (selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  }

  function handleNext() {
    if (geoData && selectedIndex < geoData.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  }

  if (loading) {
    return (
      <Flex 
        minH="100vh" 
        align="center" 
        justify="center"
        bg="gray.50"
      >
        <VStack gap={4}>
          <Spinner size="xl" colorPalette="blue" />
          <Text>Loading path data...</Text>
        </VStack>
      </Flex>
    );
  }

  return (
    <Box minH="100vh" bg="gray.50">
      <Container maxW="container.xl" py={8}>
        <VStack gap={6} align="stretch">
          
          {/* Header */}
          <Box>
            <Heading size="lg" mb={2}>
              CycleRAP Path Viewer
            </Heading>
            <Text color="gray.600">
              Interactive visualization of path safety assessment data
            </Text>
          </Box>

          {/* Status Message Banner */}
          {statusMessage && (
            <Box 
              p={3} 
              bg={statusMessage.startsWith('✓') ? 'green.50' : 'red.50'}
              color={statusMessage.startsWith('✓') ? 'green.800' : 'red.800'}
              borderRadius="md"
              border="1px solid"
              borderColor={statusMessage.startsWith('✓') ? 'green.200' : 'red.200'}
            >
              {statusMessage}
            </Box>
          )}

          {/* Navigation Controls */}
          {geoData && (
            <HStack 
              justify="space-between" 
              p={4} 
              bg="white" 
              borderRadius="md" 
              shadow="sm"
            >
              <Button
                onClick={handlePrevious}
                disabled={selectedIndex === 0}
                colorPalette="blue"
                size="sm"
              >
                ← Previous
              </Button>
              
              <Text fontWeight="medium">
                Segment {selectedIndex + 1} of {geoData.length}
              </Text>
              
              <Button
                onClick={handleNext}
                disabled={selectedIndex === geoData.length - 1}
                colorPalette="blue"
                size="sm"
              >
                Next →
              </Button>
            </HStack>
          )}

          {/* Map and Legend */}
          <HStack align="start" gap={4}>
            <Box 
              flex={1} 
              bg="white" 
              borderRadius="md" 
              shadow="md" 
              overflow="hidden"
            >
              {geoData && (
                <MapViewer
                  geoData={geoData}
                  selectedIndex={selectedIndex}
                  onSegmentClick={handleSegmentClick}
                />
              )}
            </Box>
            
            <Box width="250px">
              <ColorLegend />
            </Box>
          </HStack>

          {/* Segment Details */}
          {geoData && geoData[selectedIndex] && (
            <Box p={4} bg="white" borderRadius="md" shadow="sm">
              <Heading size="sm" mb={3}>Segment Details</Heading>
              <VStack align="start" gap={2}>
                <Text fontSize="sm">
                  <strong>Image Reference:</strong>{' '}
                  {geoData[selectedIndex]['Image Reference']}
                </Text>
                <Text fontSize="sm">
                  <strong>Distance:</strong>{' '}
                  {geoData[selectedIndex]['Distance (Metres)']} meters
                </Text>
                <Text fontSize="sm">
                  <strong>Coordinates:</strong>{' '}
                  {geoData[selectedIndex].coordinates.length} points
                </Text>
              </VStack>
            </Box>
          )}
        </VStack>
      </Container>
    </Box>
  );
}

export default App;