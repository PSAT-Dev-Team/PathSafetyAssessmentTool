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
  selectedAttributes: (string | null)[];
  onAttributeChange: (attributes: (string | null)[]) => void;
}

export default function AttributesDropdown({
  selectedAttributes,
  onAttributeChange
}: AttributesDropdownProps) {
  const [inputValues, setInputValues] = useState<string[]>(selectedAttributes.map(() => ""));

  const getFilterLabel = (index: number): string => {
    const labels = ["1st", "2nd", "3rd", "4th", "5th"];
    return labels[index] || "";
  };

  const handleAttributeChange = (index: number, value: string) => {
    const newAttributes = [...selectedAttributes];

    // If "Not Selected" is chosen, clear that filter
    if (value === "Not Selected") {
      newAttributes[index] = null;
    } else {
      // Check if this attribute is already selected in another filter
      const isDuplicate = selectedAttributes.some(
        (attr, i) => attr === value && i !== index
      );

      if (isDuplicate) {
        console.warn(`Attribute "${value}" is already selected in another filter`);
        return; // Don't allow duplicate
      }

      newAttributes[index] = value;
    }

    onAttributeChange(newAttributes);
    console.log(`Filter ${index + 1} changed to:`, value);
  };

  const handleAddFilter = () => {
    if (selectedAttributes.length < 5) {
      onAttributeChange([...selectedAttributes, null]);
      setInputValues([...inputValues, ""]);
    }
  };

  const handleRemoveFilter = (index: number) => {
    const newAttributes = selectedAttributes.filter((_, i) => i !== index);
    const newInputValues = inputValues.filter((_, i) => i !== index);
    onAttributeChange(newAttributes);
    setInputValues(newInputValues);
  };

  // Reset all filters
  const handleResetFilters = () => {
    onAttributeChange([null]);
    setInputValues([""]);
  };

  // All attribute names including "Not Selected" and "Project"
  const allAttributes = useMemo(() => [
    { label: "Not Selected", value: "Not Selected" },
    { label: "Project", value: "Project" },
    ...cyclerapAttributes.map((attr) => ({
      label: attr.name,
      value: attr.name,
    })),
  ], []);

  // Filter attributes based on input value for each filter
  // Also exclude already-selected attributes to prevent duplicates
  const getFilteredAttributes = (inputValue: string, currentIndex: number) => {
    let filtered = allAttributes;

    // Exclude attributes already selected in other filters
    const selectedAttributeNames = selectedAttributes
      .filter((_, i) => i !== currentIndex) // Exclude current filter
      .filter((attr) => attr !== null) as string[];

    filtered = filtered.filter(
      (attr) => !selectedAttributeNames.includes(attr.value) || attr.value === "Not Selected"
    );

    // Apply search filter
    if (!inputValue) return filtered;

    const lowerInput = inputValue.toLowerCase();
    return filtered.filter((attr) =>
      attr.label.toLowerCase().includes(lowerInput)
    );
  };

  // Create collections with filtered attributes for each filter
  const getAttributeCollection = (inputValue: string, currentIndex: number) =>
    createListCollection({
      items: getFilteredAttributes(inputValue, currentIndex),
    });

  const hasAnyFilter = selectedAttributes.some(attr => attr !== null);

  // Can only add more filters if we haven't reached 5 AND there are available attributes
  const selectedAttributeNames = selectedAttributes.filter((attr) => attr !== null) as string[];
  const availableAttributeCount = cyclerapAttributes.length + 1; // Total unique attributes + "Project"
  const canAddMoreFilters = selectedAttributes.length < 5 && selectedAttributeNames.length < availableAttributeCount;

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p="6"
      bg="bg.panel"
    >
      {/* Header */}
      <Flex justify="space-between" align="center" mb="4">
        <Text fontSize="md" fontWeight="bold">
          Filter Segment
        </Text>
        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            colorPalette="red"
          >
            Clear All
          </Button>
        )}
      </Flex>

      {/* Multiple Attribute Filters */}
      <Box>
        <Text fontSize="sm" color="fg.muted" mb="4">
          Add up to 5 filters to visualize segments with multiple attributes
        </Text>

        {/* Render all filters horizontally */}
        <Flex gap="4" flexWrap="wrap" align="flex-start" mb="4">
          {selectedAttributes.map((selectedAttribute, index) => {
            const currentValue = selectedAttribute || "Not Selected";
            const inputValue = inputValues[index] || "";
            const attributeCollection = getAttributeCollection(inputValue, index);

            return (
              <Box key={index} minW="280px">
                <Text fontSize="sm" fontWeight="semibold" mb="2">
                  {getFilterLabel(index)} Filter
                </Text>
                <Flex gap="2" align="flex-end">
                  <Box flex="1">
                    <Combobox.Root
                      collection={attributeCollection}
                      value={[currentValue]}
                      onValueChange={(e) => handleAttributeChange(index, e.value[0])}
                      inputValue={inputValue}
                      onInputValueChange={(e) => setInputValues(inputValues.map((v, i) => i === index ? e.inputValue : v))}
                    >
                      <Combobox.Control>
                        <Combobox.Input placeholder="Select attribute..." />
                        <Combobox.IndicatorGroup>
                          <Combobox.ClearTrigger />
                          <Combobox.Trigger />
                        </Combobox.IndicatorGroup>
                      </Combobox.Control>
                      <Portal>
                        <Combobox.Positioner>
                          <Combobox.Content maxH="400px" overflowY="auto">
                            <Combobox.Empty>No attributes found</Combobox.Empty>
                            {attributeCollection.items.map((item: any) => (
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

                  {/* Add/Remove Filter Buttons */}
                  {index === 0 && canAddMoreFilters && (
                    <Button
                      size="sm"
                      variant="outline"
                      colorPalette="blue"
                      onClick={handleAddFilter}
                      px="3"
                    >
                      Add Filter
                    </Button>
                  )}
                  {index > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      colorPalette="red"
                      onClick={() => handleRemoveFilter(index)}
                      px="3"
                    >
                      ✕
                    </Button>
                  )}
                </Flex>
              </Box>
            );
          })}
        </Flex>

        {/* Display selected filters as badges */}
        {hasAnyFilter && (
          <Box mt="4" pt="4" borderTop="1px solid" borderColor="gray.200">
            <Text fontSize="xs" fontWeight="semibold" mb="2" color="gray.600">
              Active Filters:
            </Text>
            <Flex gap="2" flexWrap="wrap">
              {selectedAttributes.map((attr, index) => attr && (
                <Box
                  key={index}
                  px="3"
                  py="1"
                  borderRadius="full"
                  bg="blue.subtle"
                  fontSize="sm"
                  fontWeight="semibold"
                  color="blue.fg"
                >
                  {attr}
                </Box>
              ))}
            </Flex>
          </Box>
        )}
      </Box>
    </Box>
  );
}
