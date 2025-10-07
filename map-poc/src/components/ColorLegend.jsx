import React from 'react';
import { Box, HStack, Text, VStack } from '@chakra-ui/react';

/**
 * ColorLegend Component
 * 
 * This displays what each color means on your map. In data visualization,
 * a legend is crucial—without it, colors are just pretty but meaningless.
 * Think of it like the key on a paper map that explains symbols.
 */
function ColorLegend() {
  // These match the CycleRAP risk assessment categories from your Python app
  const riskLevels = [
    { 
      label: 'Low', 
      color: [135, 196, 36],  // Green
      description: '< 5 (BB, BP, SB) or < 10 (VB)' 
    },
    { 
      label: 'Medium', 
      color: [255, 204, 26],  // Yellow
      description: '5-10 (BB, BP, SB) or 10-25 (VB)' 
    },
    { 
      label: 'High', 
      color: [255, 91, 26],   // Orange
      description: '10-20 (BB, BP, SB) or 25-60 (VB)' 
    },
    { 
      label: 'Extreme', 
      color: [205, 26, 255],  // Magenta
      description: '> 20 (BB, BP, SB) or > 60 (VB)' 
    }
  ];

  return (
    <VStack align="stretch" gap={2} p={4} bg="white" borderRadius="md" shadow="md">
      <Text fontWeight="bold" fontSize="sm">Risk Level</Text>
      {riskLevels.map(level => (
        <HStack key={level.label} gap={3}>
          {/* Color swatch - a small square showing the color */}
          <Box
            w="20px"
            h="20px"
            borderRadius="sm"
            bg={`rgb(${level.color.join(',')})`}
          />
          {/* Text description */}
          <VStack align="start" gap={0}>
            <Text fontSize="sm" fontWeight="medium">{level.label}</Text>
            <Text fontSize="xs" color="gray.600">{level.description}</Text>
          </VStack>
        </HStack>
      ))}
    </VStack>
  );
}

export default ColorLegend;