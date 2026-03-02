import { useState } from "react";
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
    "Safety Risk Level": [],
    "Facility configuration": [],
    "Facility clear width": [],
    "Facility surface conditions": [],
    "Intersection": [],
    "Flow & Speed": [],
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
    "Safety Risk Level",
    "Facility configuration",
    "Facility clear width",
    "Facility surface conditions",
    "Intersection",
    "Flow & Speed",
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

// Safety Risk Level Crash Types
interface SafetyScoreConfig {
  name: string;
  displayName?: string;
  options: string[];
  group: string;
}

const safetyScoreAttributes: SafetyScoreConfig[] = [
  {
    name: "Overall Risk Level",
    displayName: "Overall Risk Level",
    group: "Safety Risk Level",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
  {
    name: "VB Band",
    displayName: "Vehicle-Bicycle (VB)",
    group: "Safety Risk Level",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
  {
    name: "BB Band",
    displayName: "Bicycle-Bicycle (BB)",
    group: "Safety Risk Level",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
  {
    name: "SB Band",
    displayName: "Single-Bicycle (SB)",
    group: "Safety Risk Level",
    options: ["Not Selected", "Low", "Medium", "High", "Extreme"],
  },
  {
    name: "BP Band",
    displayName: "Bicycle-Pedestrian (BP)",
    group: "Safety Risk Level",
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

// All attribute names including "Not Selected" and "Project"
const allAttributes = [
  { label: "Not Selected", value: "Not Selected", group: "Not Selected" },
  { label: "Project", value: "Project", group: "Project" },
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
];

interface AttributesDropdownProps {
  selectedAttributes: (string | null)[];
  onAttributeChange: (attributes: (string | null)[]) => void;
}

const getLabelForValue = (value: string | null) => {
  if (!value || value === "Not Selected") return "";
  const attr = allAttributes.find((a) => a.value === value);
  return attr ? attr.label : "";
};

export default function AttributesDropdown({
  selectedAttributes,
  onAttributeChange
}: AttributesDropdownProps) {
  const [inputValues, setInputValues] = useState<string[]>(() =>
    selectedAttributes.map((attr) => getLabelForValue(attr))
  );
  const [openComboboxes, setOpenComboboxes] = useState<boolean[]>(selectedAttributes.map(() => false));
  // Generate stable IDs for each filter slot to use as React keys
  const [filterIds, setFilterIds] = useState<string[]>(() => selectedAttributes.map(() => Math.random().toString(36).substr(2, 9)));

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
        return; // Don't allow duplicate
      }

      newAttributes[index] = value;
    }

    onAttributeChange(newAttributes);
  };

  const handleAddFilter = () => {
    if (selectedAttributes.length < 5) {
      onAttributeChange([...selectedAttributes, null]);
      setInputValues([...inputValues, ""]);
      setOpenComboboxes([...openComboboxes, false]);
      setFilterIds([...filterIds, Math.random().toString(36).substr(2, 9)]);
    }
  };

  const handleRemoveFilter = (index: number) => {
    // If there's only one filter and we're removing it, reset it to empty/null state
    if (selectedAttributes.length === 1) {
      onAttributeChange([null]);
      setInputValues([""]);
      setOpenComboboxes([false]);
      // Keep changes minimal, no need to regen ID for the single remaining slot, 
      // but conceptually it's a reset. Let's keep the existing ID or regen? 
      // Existing logic implies clearing value.
      return;
    }

    const newAttributes = selectedAttributes.filter((_, i) => i !== index);
    const newInputValues = inputValues.filter((_, i) => i !== index);
    const newOpenComboboxes = openComboboxes.filter((_, i) => i !== index);
    const newFilterIds = filterIds.filter((_, i) => i !== index);

    onAttributeChange(newAttributes);
    setInputValues(newInputValues);
    setOpenComboboxes(newOpenComboboxes);
    setFilterIds(newFilterIds);
  };

  // Reset all filters
  const handleResetFilters = () => {
    onAttributeChange([null]);
    setInputValues([""]);
    setOpenComboboxes([false]);
    setFilterIds([Math.random().toString(36).substr(2, 9)]);
  };

  // Filter attributes based on input value for each filter
  // Also exclude already-selected attributes to prevent duplicates
  // Fuzzy matching for robust search
  const fuzzyMatch = (query: string, text: string): number => {
    query = query.toLowerCase();
    text = text.toLowerCase();

    let queryIndex = 0;
    let score = 0;

    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
      if (text[i] === query[queryIndex]) {
        score += 1;
        queryIndex++;
      }
    }

    return queryIndex === query.length ? score : -1; // -1 if no match
  };

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

    // Apply search filter with smart sorting
    if (!inputValue) return filtered;

    const lowerInput = inputValue.toLowerCase();

    // Score each attribute for relevance
    const scored = filtered
      .map((attr) => {
        const lowerLabel = attr.label.toLowerCase();

        // Exact match = highest priority
        if (lowerLabel === lowerInput) return { attr, score: 1000 };

        // Starts with input = very high priority
        if (lowerLabel.startsWith(lowerInput)) return { attr, score: 900 };

        // Contains input as a word = high priority
        if (lowerLabel.includes(` ${lowerInput}`) || lowerLabel.includes(`-${lowerInput}`)) {
          return { attr, score: 800 };
        }

        // Contains input substring = medium priority
        if (lowerLabel.includes(lowerInput)) return { attr, score: 700 };

        // Fuzzy match = low priority
        const fuzzyScore = fuzzyMatch(lowerInput, lowerLabel);
        if (fuzzyScore >= 0) return { attr, score: 100 + fuzzyScore };

        // No match
        return { attr, score: -1 };
      })
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.attr);

    return scored;
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
            // Use the stable ID as the key
            const key = filterIds[index] || `fallback-${index}`;

            return (
              <Box key={key} minW="280px">
                <Text fontSize="sm" fontWeight="semibold" mb="2">
                  {getFilterLabel(index)} Filter
                </Text>
                <Flex gap="2" align="flex-end">
                  <Box flex="1">
                    <Combobox.Root
                      collection={attributeCollection}
                      value={[currentValue]}
                      open={openComboboxes[index]}
                      onOpenChange={(details) => {
                        // Keep dropdown open if there's text in the field
                        if (inputValue.length > 0) {
                          const newOpenComboboxes = [...openComboboxes];
                          newOpenComboboxes[index] = true;
                          setOpenComboboxes(newOpenComboboxes);
                        } else {
                          const newOpenComboboxes = [...openComboboxes];
                          newOpenComboboxes[index] = details.open;
                          setOpenComboboxes(newOpenComboboxes);
                        }
                      }}
                      onValueChange={(e) => {
                        // Only handle the change if a valid value is selected
                        if (e.value[0]) {
                          handleAttributeChange(index, e.value[0]);
                          // Close dropdown and clear input after selection
                          const newOpenComboboxes = [...openComboboxes];
                          newOpenComboboxes[index] = false;
                          setOpenComboboxes(newOpenComboboxes);
                          setInputValues(inputValues.map((v, i) => i === index ? "" : v));
                        }
                      }}
                      inputValue={inputValue}
                      onInputValueChange={(e) => setInputValues(inputValues.map((v, i) => i === index ? e.inputValue : v))}
                    >
                      <Combobox.Control
                        onClick={() => {
                          const newOpenComboboxes = [...openComboboxes];
                          newOpenComboboxes[index] = true;
                          setOpenComboboxes(newOpenComboboxes);
                        }}
                      >
                        <Combobox.Input
                          placeholder="Select attribute..."
                        />
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
                  {index === selectedAttributes.length - 1 && canAddMoreFilters && (
                    <Button
                      size="md"
                      variant="outline"
                      colorPalette="blue"
                      onClick={handleAddFilter}
                      px="3"
                    >
                      Add Filter
                    </Button>
                  )}
                  {/* Show X button if it's not the first item OR if it is the first item but has a value selected */}
                  {(index > 0 || (index === 0 && selectedAttribute !== null)) && (
                    <Button
                      size="md"
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
