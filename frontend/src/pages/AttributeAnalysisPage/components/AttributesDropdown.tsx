import { useState, useMemo } from "react";
import {
  Box,
  Text,
  createListCollection,
  Button,
  Flex,
  Combobox,
  Portal,
} from "@chakra-ui/react";
import "./AttributesDropdown.css";

// CycleRAP Attributes with their specific possible values
interface AttributeConfig {
  name: string;
  options: string[];
}

const cyclerapAttributes: AttributeConfig[] = [
  {
    name: "Facility Type",
    options: ["Not Selected", "Sidewalk", "Multi-Use Path", "Off-Road Bicycle Path", "On-road Bicycle Lane", "Road Shoulder", "Mixed Traffic Road Lane"]
  },
  {
    name: "Facility access",
    options: ["Not Selected", "Adequate", "Inadequate"]
  },
  {
    name: "Loose or slippery surface",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Tram or Train Rails",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Major Surface Deformation or Drain Opening",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Fixed Obstacle on Facility",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Non-Fixed Obstacle on Facility",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Delineation",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Light Segregation",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Facility Width per Direction",
    options: ["Not Selected", "Very Narrow", "Narrow", "Wide"]
  },
  {
    name: "Flow Direction",
    options: ["Not Selected", "One Way", "Two Way"]
  },
  {
    name: "Width Restriction",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Road Lane 0-1m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Vehicle Parking 0-1m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Severe Hazard 0-1m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent object or level change 0-1m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Sidewalk 0-1m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Road Lane 1-3m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Vehicle Parking 1-3m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Severe Hazard 1-3m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent object or level change 1-3m",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Grade",
    options: ["Not Selected", "< 5 Degrees", "=/> 5 Degrees"]
  },
  {
    name: "Curvature",
    options: ["Not Selected", "Sharp Turn Present", "No Sharp Turn Present"]
  },
  {
    name: "Street Lighting",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Pedestrian Crossing",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Intersecting Bicycle Facility",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Intersection Approach",
    options: ["Not Selected", "Shared", "Separate/NA"]
  },
  {
    name: "Intersection or Road Crossing",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Crossing Facility",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Number of lanes – adjacent road",
    options: ["Not Selected", "1 per Direction/NA", "> 1 per Direction"]
  },
  {
    name: "Number of lanes – intersecting road",
    options: ["Not Selected", "1 per Direction/NA", "> 1 per Direction"]
  },
  {
    name: "Property Access",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Peak pedestrian flow along or across facility",
    options: ["Not Selected", "None", "Low", "Moderate to high"]
  },
  {
    name: "Peak bicycle/LV traffic flow",
    options: ["Not Selected", "Low", "Moderate to high"]
  },
  {
    name: "Observed proportion of cargo bikes and mopeds",
    options: ["Not Selected", "Low", "Moderate to high"]
  },
  {
    name: "Bicycle/LV speed – average",
    options: ["Not Selected", "< 20km/h", "=/> 20km/h"]
  },
  {
    name: "Bicycle/LV speed differential",
    options: ["Not Selected", "< 10km/h", "=/> 10km/h"]
  },
  {
    name: "Heavy vehicle flow",
    options: ["Not Selected", "Low", "Moderate to high"]
  }
];

interface AttributesDropdownProps {
  selectedAttribute: string | null;
  onAttributeChange: (attributeName: string | null) => void;
}

export default function AttributesDropdown({
  selectedAttribute,
  onAttributeChange
}: AttributesDropdownProps) {
  const [inputValue, setInputValue] = useState("");

  const handleAttributeChange = (value: string) => {
    // If "Not Selected" is chosen, clear the selection
    if (value === "Not Selected") {
      onAttributeChange(null);
    } else {
      onAttributeChange(value);
    }
    console.log(`Selected attribute changed to:`, value);
  };

  // Reset selection
  const handleResetFilters = () => {
    onAttributeChange(null);
    setInputValue("");
  };

  // All attribute names including "Not Selected"
  const allAttributes = useMemo(() => [
    { label: "Not Selected", value: "Not Selected" },
    ...cyclerapAttributes.map((attr) => ({
      label: attr.name,
      value: attr.name,
    })),
  ], []);

  // Filter attributes based on input value
  const filteredAttributes = useMemo(() => {
    if (!inputValue) return allAttributes;

    const lowerInput = inputValue.toLowerCase();
    return allAttributes.filter((attr) =>
      attr.label.toLowerCase().includes(lowerInput)
    );
  }, [inputValue, allAttributes]);

  // Create collection with filtered attributes
  const attributeCollection = useMemo(() =>
    createListCollection({
      items: filteredAttributes,
    }),
  [filteredAttributes]);

  const currentValue = selectedAttribute || "Not Selected";

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p="6"
      bg="bg.panel"
    >
      {/* Header */}
      <Flex justify="space-between" align="center" mb="4">
        <Flex align="center" gap="2">
          <Text fontSize="md" fontWeight="bold">
            Filter Segment by Attribute
          </Text>
          {selectedAttribute && (
            <Box
              px="2"
              py="0.5"
              borderRadius="full"
              bg="blue.subtle"
              fontSize="xs"
              fontWeight="semibold"
              color="blue.fg"
            >
              {selectedAttribute}
            </Box>
          )}
        </Flex>
        {selectedAttribute && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            colorPalette="red"
          >
            Clear Selection
          </Button>
        )}
      </Flex>

      {/* Single Attribute Selection */}
      <Box>
        <Text fontSize="sm" color="fg.muted" mb="3">
          Select one attribute to visualize segments with color-coded categories
        </Text>
        <Box maxW="400px">
          <Text fontSize="sm" fontWeight="semibold" mb="2">
            Attribute
          </Text>
          <Combobox.Root
            collection={attributeCollection}
            value={[currentValue]}
            onValueChange={(e) => handleAttributeChange(e.value[0])}
            inputValue={inputValue}
            onInputValueChange={(e) => setInputValue(e.inputValue)}
          >
            <Combobox.Control>
              <Combobox.Input placeholder="Type to search attributes..." />
              <Combobox.IndicatorGroup>
                <Combobox.ClearTrigger />
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            <Portal>
              <Combobox.Positioner>
                <Combobox.Content maxH="400px" overflowY="auto">
                  <Combobox.Empty>No attributes found</Combobox.Empty>
                  {attributeCollection.items.map((item) => (
                    <Combobox.Item item={item} key={item.value}>
                      {item.label}
                      <Combobox.ItemIndicator />
                    </Combobox.Item>
                  ))}
                </Combobox.Content>
              </Combobox.Positioner>
            </Portal>
          </Combobox.Root>
        </Box>
      </Box>
    </Box>
  );
}
