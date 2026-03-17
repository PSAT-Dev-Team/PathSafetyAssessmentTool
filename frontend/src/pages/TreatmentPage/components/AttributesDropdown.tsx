import { useState } from "react";
import {
  Box,
  Text,
  Grid,
  GridItem,
  createListCollection,
  Collapsible,
  Button,
  Flex,
} from "@chakra-ui/react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@chakra-ui/react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";

// CycleRAP Attributes with their specific possible values
interface AttributeConfig {
  name: string;
  options: string[];
}

const cyclerapAttributes: AttributeConfig[] = [
  {
    name: "Facility Type",
    options: ["Not Selected", "Mixed traffic road lane", "Multi-use path", "Off-road bike path", "On road bike lane", "Road shoulder", "Sidewalk"]
  },
  {
    name: "Facility Access",
    options: ["Not Selected", "Adequate", "Inadequate"]
  },
  {
    name: "Loose or slippery surface",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Tram or train rails",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Major surface deformation or drain",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Fixed obstacle on facility",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Non fixed obstacle on facility",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Delineation",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Light segregation",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Facility width per direction",
    options: ["Not Selected", "Narrow", "Very Narrow", "Wide"]
  },
  {
    name: "Flow direction",
    options: ["Not Selected", "One-way", "Two-way"]
  },
  {
    name: "Width restriction",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent road lane 0-1m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent vehicle parking 0-1m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent severe hazard 0-1m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent object or level change 0-1m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent sidewalk 0-1m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent road lane 1-3m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent vehicle parking 1-3m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent severe hazard 1-3m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Adjacent object or level change 1-3m",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Grade",
    options: ["Not Selected", "Absent", "Present"]
  },
  {
    name: "Curvature",
    options: ["Not Selected", "No sharp turn present", "Sharp turn present"]
  },
  {
    name: "Street lighting",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Pedestrian crossing",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Intersecting bicycle facility",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Intersection approach",
    options: ["Not Selected", "Separate/NA", "Shared"]
  },
  {
    name: "Intersection or road crossing",
    options: ["Not Selected", "Not present", "Present"]
  },
  {
    name: "Crossing facility",
    options: ["Not Selected", "Not present/NA", "Present/NA"]
  },
  {
    name: "Number of lanes - adjacent road",
    options: ["Not Selected", "1 per direction/NA", "> 1 per direction"]
  },
  {
    name: "Number of lanes - intersecting road",
    options: ["Not Selected", "1 per direction/NA", "> 1 per direction"]
  },
  {
    name: "Property Access",
    options: ["Not Selected", "Not Present", "Present"]
  },
  {
    name: "Peak pedestrian flow along or across",
    options: ["Not Selected", "Low", "Moderate", "None"]
  },
  {
    name: "Peak bicycle/LV traffic flow",
    options: ["Not Selected", "Low", "Moderate to high"]
  },
  {
    name: "Obs. proportion of cargo bikes",
    options: ["Not Selected", "Low", "Moderate to high"]
  },
  {
    name: "Bicycle/LV speed - average",
    options: ["Not Selected", "< 20 km/h", ">/= 20 km/h"]
  },
  {
    name: "Bicycle/LV speed differential",
    options: ["Not Selected", "< 10 km/h", ">/= 10 km/h"]
  },
  {
    name: "Road AADT",
    options: ["Not Selected", "0", "100", "500", "1500"]
  },
  {
    name: "Heavy vehicle flow",
    options: ["Not Selected", "Low/restricted acc.", "Moderate to high"]
  },
  {
    name: "Road operating speed (mean)",
    options: ["Not Selected", "0", "10", "20", "30", "40"]
  }
];

export default function AttributesDropdown() {
  // Initialize all attributes with "Not Selected"
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>(
    Object.fromEntries(cyclerapAttributes.map((attr) => [attr.name, "Not Selected"]))
  );
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAttributeChange = (fieldName: string, value: string) => {
    setAttributeValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  // Reset all filters
  const handleResetFilters = () => {
    setAttributeValues(
      Object.fromEntries(cyclerapAttributes.map((attr) => [attr.name, "Not Selected"]))
    );
  };

  // Count how many filters are active (not "Not Selected")
  const activeFilterCount = Object.values(attributeValues).filter(
    (value) => value !== "Not Selected"
  ).length;

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p="6"
      bg="bg.panel"
    >
      {/* Header with Expand/Collapse Button */}
      <Flex justify="space-between" align="center" mb={isExpanded ? "4" : "0"}>
        <Flex align="center" gap="2">
          <Text fontSize="md" fontWeight="bold">
            Filter Segment by Attribute
          </Text>
          {activeFilterCount > 0 && (
            <Box
              px="2"
              py="0.5"
              borderRadius="full"
              bg="blue.subtle"
              fontSize="xs"
              fontWeight="semibold"
              color="blue.fg"
            >
              {activeFilterCount} active
            </Box>
          )}
        </Flex>
        <Flex gap="2">
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              colorPalette="red"
            >
              Reset All
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "Hide" : "Show"} Fields
            <Box ml="2" display="inline">
              {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
            </Box>
          </Button>
        </Flex>
      </Flex>

      {/* Collapsible Content */}
      <Collapsible.Root open={isExpanded}>
        <Collapsible.Content>
          <Box mb="4">
            <Text fontSize="sm" color="fg.muted" textAlign="center" mb="4">
              Select your desired filters to view segments of interest
            </Text>
          </Box>

          <Grid
            templateColumns={{
              base: "1fr",
              md: "repeat(3, 1fr)",
              lg: "repeat(4, 1fr)",
            }}
            gap="4"
          >
            {cyclerapAttributes.map((attribute) => {
              // Create collection for this specific attribute
              const optionCollection = createListCollection({
                items: attribute.options.map((opt) => ({
                  label: opt,
                  value: opt,
                })),
              });

              return (
                <GridItem key={attribute.name}>
                  <Text fontSize="xs" fontWeight="semibold" mb="1.5">
                    {attribute.name}
                  </Text>
                  <SelectRoot
                    collection={optionCollection}
                    size="sm"
                    value={[attributeValues[attribute.name]]}
                    onValueChange={(e) => handleAttributeChange(attribute.name, e.value[0])}
                  >
                    <SelectTrigger>
                      <SelectValueText placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent maxH="250px" overflowY="auto">
                      {optionCollection.items.map((item) => (
                        <SelectItem key={item.value} item={item}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                </GridItem>
              );
            })}
          </Grid>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
}
