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

// Helper function to render grouped attributes with headers
function renderGroupedAttributes(items: any[]) {
  const groupedItems: Record<string, any[]> = {
    "Not Selected": [],
    "Project": [],
    "Safety Score": [],
    "Facility configuration": [],
    "Flow & Speed": [],
    "Facility clear width": [],
    "Facility surface conditions": [],
    "Intersection": [],
  };

  // Group items - only include valid items
  items.forEach((item) => {
    if (!item || !item.value) return; // Skip invalid items

    if (item.value === "Not Selected" || item.value === "Project") {
      groupedItems[item.value].push(item);
    } else if (item.group) {
      if (!groupedItems[item.group]) {
        groupedItems[item.group] = [];
      }
      groupedItems[item.group].push(item);
    }
  });

  const groupOrder = [
    "Not Selected",
    "Project",
    "Safety Score",
    "Facility configuration",
    "Flow & Speed",
    "Facility clear width",
    "Facility surface conditions",
    "Intersection",
  ];

  return (
    <>
      {groupOrder.map((groupName, groupIndex) => {
        const groupItems = groupedItems[groupName] || [];
        if (groupItems.length === 0) return null;

        return (
          <Box key={`group-${groupName}-${groupIndex}`}>
            {/* Divider before group header (except for first group) */}
            {groupIndex > 0 && (
              <Box
                borderTop="1px solid"
                borderColor="gray.200"
                _dark={{ borderColor: "gray.700" }}
                my="1"
              />
            )}

            {/* Group header - only show for non-special items */}
            {groupName !== "Not Selected" && groupName !== "Project" && (
              <Text
                px="3"
                py="2"
                fontSize="xs"
                fontWeight="bold"
                color="gray.700"
                textTransform="uppercase"
                letterSpacing="1px"
                bg="gray.100"
                _dark={{ color: "gray.200", bg: "gray.700" }}
              >
                {groupName}
              </Text>
            )}
            {/* Group items */}
            {groupItems.map((item: any) => {
              if (!item || !item.value) return null;
              return (
                <Combobox.Item item={item} key={item.value}>
                  <Flex align="center" gap="2" width="100%">
                    <Text flex="1">{item.label}</Text>
                  </Flex>
                  <Combobox.ItemIndicator />
                </Combobox.Item>
              );
            })}
          </Box>
        );
      })}
    </>
  );
}

// CycleRAP Attributes with their specific possible values
interface AttributeConfig {
  name: string;
  options: string[];
  group: string; // Add group field
}

// Safety Score Crash Types
interface SafetyScoreConfig {
  name: string;
  displayName?: string;
  options: string[];
  group: string;
}

const safetyScoreAttributes: SafetyScoreConfig[] = [
  {
    name: "CycleRAP Score",
    displayName: "CycleRAP Score",
    group: "Safety Score",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
  {
    name: "VB Band",
    displayName: "Vehicle-Bicycle (VB)",
    group: "Safety Score",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
  {
    name: "BB Band",
    displayName: "Bicycle-Bicycle (BB)",
    group: "Safety Score",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
  {
    name: "SB Band",
    displayName: "Single-Bicycle (SB)",
    group: "Safety Score",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
  {
    name: "BP Band",
    displayName: "Bicycle-Pedestrian (BP)",
    group: "Safety Score",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
];

const cyclerapAttributes: AttributeConfig[] = [
  // Facility configuration group
  {
    name: "Facility Type",
    group: "Facility configuration",
    options: ["Not Selected", "Sidewalk", "Multi-Use Path", "Off-Road Bicycle Path", "On-road Bicycle Lane", "Road Shoulder", "Mixed Traffic Road Lane"]
  },
  {
    name: "Facility access",
    group: "Facility configuration",
    options: ["Not Selected", "Adequate", "Inadequate"]
  },
  {
    name: "Adjacent Sidewalk 0-1m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Road Lane 0-1m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Vehicle Parking 0-1m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Severe Hazard 0-1m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent object or level change 0-1m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Road Lane 1-3m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Vehicle Parking 1-3m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent Severe Hazard 1-3m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Adjacent object or level change 1-3m",
    group: "Facility configuration",
    options: ["Not Selected", "Present", "Not Present"]
  },

  // Flow & Speed group
  {
    name: "Flow Direction",
    group: "Flow & Speed",
    options: ["Not Selected", "One Way", "Two Way"]
  },
  {
    name: "Peak pedestrian flow along or across facility",
    group: "Flow & Speed",
    options: ["Not Selected", "None", "Low", "Moderate to high"]
  },
  {
    name: "Peak bicycle/LV traffic flow",
    group: "Flow & Speed",
    options: ["Not Selected", "Low", "Moderate to high"]
  },
  {
    name: "Observed proportion of cargo bikes and mopeds",
    group: "Flow & Speed",
    options: ["Not Selected", "Low", "Moderate to high"]
  },
  {
    name: "Heavy vehicle flow",
    group: "Flow & Speed",
    options: ["Not Selected", "Low", "Moderate to high"]
  },
  {
    name: "Bicycle/LV speed – average",
    group: "Flow & Speed",
    options: ["Not Selected", "< 20km/h", "=/> 20km/h"]
  },
  {
    name: "Bicycle/LV speed differential",
    group: "Flow & Speed",
    options: ["Not Selected", "< 10km/h", "=/> 10km/h"]
  },

  // Facility clear width group
  {
    name: "Facility Width per Direction",
    group: "Facility clear width",
    options: ["Not Selected", "Very Narrow", "Narrow", "Wide"]
  },
  {
    name: "Fixed Obstacle on Facility",
    group: "Facility clear width",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Non-Fixed Obstacle on Facility",
    group: "Facility clear width",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Width Restriction",
    group: "Facility clear width",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Light Segregation",
    group: "Facility clear width",
    options: ["Not Selected", "Present", "Not Present"]
  },

  // Facility surface conditions group
  {
    name: "Delineation",
    group: "Facility surface conditions",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Loose or slippery surface",
    group: "Facility surface conditions",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Tram or Train Rails",
    group: "Facility surface conditions",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Major Surface Deformation or Drain Opening",
    group: "Facility surface conditions",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Grade",
    group: "Facility surface conditions",
    options: ["Not Selected", "< 5 Degrees", "=/> 5 Degrees"]
  },
  {
    name: "Curvature",
    group: "Facility surface conditions",
    options: ["Not Selected", "Sharp Turn Present", "No Sharp Turn Present"]
  },
  {
    name: "Street Lighting",
    group: "Facility surface conditions",
    options: ["Not Selected", "Present", "Not Present"]
  },

  // Intersection group
  {
    name: "Intersection Approach",
    group: "Intersection",
    options: ["Not Selected", "Shared", "Separate/NA"]
  },
  {
    name: "Intersection or Road Crossing",
    group: "Intersection",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Crossing Facility",
    group: "Intersection",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Pedestrian Crossing",
    group: "Intersection",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Intersecting Bicycle Facility",
    group: "Intersection",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Property Access",
    group: "Intersection",
    options: ["Not Selected", "Present", "Not Present"]
  },
  {
    name: "Number of lanes – adjacent road",
    group: "Intersection",
    options: ["Not Selected", "1 per Direction/NA", "> 1 per Direction"]
  },
  {
    name: "Number of lanes – intersecting road",
    group: "Intersection",
    options: ["Not Selected", "1 per Direction/NA", "> 1 per Direction"]
  },
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
    ...safetyScoreAttributes.map((attr) => ({
      label: attr.displayName || attr.name,
      value: attr.name,
      group: attr.group,
    })),
    ...cyclerapAttributes.map((attr) => ({
      label: attr.name,
      value: attr.name,
      group: attr.group,
    })),
  ], []);

  // Filter attributes based on input value for each filter
  // Also exclude already-selected attributes to prevent duplicates
  const getFilteredAttributes = (inputValue: string, currentIndex: number) => {
    let filtered = allAttributes;

    // Get the currently selected attribute for this filter
    const currentAttribute = selectedAttributes[currentIndex];

    // Exclude attributes already selected in other filters
    const selectedAttributeNames = selectedAttributes
      .filter((_, i) => i !== currentIndex) // Exclude current filter
      .filter((attr) => attr !== null) as string[];

    filtered = filtered.filter(
      (attr) =>
        // Always include the current filter's value
        attr.value === currentAttribute ||
        // Always include "Not Selected"
        attr.value === "Not Selected" ||
        // Exclude attributes selected in other filters
        !selectedAttributeNames.includes(attr.value)
    );

    // Apply search filter
    if (!inputValue) return filtered;

    const lowerInput = inputValue.toLowerCase();
    return filtered.filter((attr) =>
      attr.label.toLowerCase().includes(lowerInput)
    );
  };

  // Create collections with filtered attributes for each filter
  const getAttributeCollection = (inputValue: string, currentIndex: number) => {
    const items = getFilteredAttributes(inputValue, currentIndex);
    // Ensure all items are valid objects with value and label
    const validItems = items.filter(item => item && typeof item === 'object' && item.value && item.label);
    return createListCollection({
      items: validItems,
    });
  };

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
                      onValueChange={(e) => {
                        // Only handle the change if a valid value is selected
                        if (e.value[0]) {
                          handleAttributeChange(index, e.value[0]);
                        }
                      }}
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
                            {attributeCollection.items.length > 0 ? (
                              renderGroupedAttributes(attributeCollection.items)
                            ) : null}
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
