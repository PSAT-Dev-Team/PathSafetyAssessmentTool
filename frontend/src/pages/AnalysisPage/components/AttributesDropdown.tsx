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

// Generate 55 field names for detailed analysis
const cyclerapAttributeNames = [
  // Traffic and Speed Environment
  "Motorised Traffic Volume (AADT)",
  "Posted Speed Limit",
  "Carriageway Width",
  "Number of Motorised Lanes",
  "Cycle Facility Type (Presence/Class)", // Maps to "Bike Lane Present"
  
  // Separation and Roadside Features
  "Adjacent Sidewalk Width",
  "Crossing Visibility / Sight Distance", // Combines two concepts
  "Street Lighting Presence",
  "Surface Quality / Surface Irregularity", // Maps to "Pavement Quality"
  "Delineation / Lane Markings Quality", // Maps to "Road Markings"
  
  // Intersections and Crossings
  "Intersection Control (Signalisation)", // Maps to "Signal Timing"
  "Pedestrian/Cyclist Crossing Facility Type",
  "Intersection Geometry / Junction Type",
  "Sight Distance / Visibility Distance", // Direct CycleRAP attribute
  "Vertical Grade / Road Gradient",
  
  // Obstructions and Conflict Zones
  "Adjacent Parking / Buffer to Parking",
  "Bus Stop Interaction / Proximity",
  "Area Type (Urban/Rural)", // Maps to "Building Density"
  "Land Use (General Classification)",
  "Commercial/Retail Interaction", // Maps to "Commercial Activity"
  
  // Land Use and Context (often 'Location Attributes' in CycleRAP)
  "Residential Density / Land Use",
  "School Zone Presence",
  "Key Destination Proximity (Hospital)", // Contextual/Location Attribute
  "Key Destination Proximity (Police Station)", // Contextual/Location Attribute
  "Key Destination Proximity (Fire Station)", // Contextual/Location Attribute
  
  // Environmental and Supporting Infrastructure
  "Adjacent Park/Green Space Interaction",
  "Key Destination Proximity (Shopping)",
  "Public Transport Connectivity", // Contextual/Location Attribute
  "Cycle Facility Connectivity/Coherence", // Maps to "Cycling Infrastructure"
  "Adjacent Footpath Quality", // Maps to "Walking Path Quality"
  
  // Roadside and Comfort Factors
  "Obstruction Presence / Street Furniture",
  "Roadside Environment (Greenery Level)", // Comfort/Attractiveness Factor
  "Noise Exposure (Contextual)", // Comfort Factor
  "Air Quality (Contextual)", // Environmental Factor
  
  // Operational/Contextual Factors (Not core infrastructure codes)
  "Weather Condition (Operational)", 
  "Time of Day (Operational)",
  "Day of Week (Operational)",
  "Seasonal Factors (Operational)",
  "Temporary Obstruction (Special Events)", // Maps to "Special Events"
  "Construction Zone Presence / Temporary Obstruction",
  
  // Safety Performance and Maintenance
  "Observed Crash History / Data Validation", // Used for validation, not coding
  "Perceived Security / Crime Rate (Contextual)", // Security/Location Attribute
  "Maintenance Condition", // Relates to surface/obstruction codes
  "Drainage Grate Presence / Surface Hazard", // Maps to "Drainage Quality"
  
  // Physical Road/Facility Features
  "Surface Material Type",
  "Curb Separation / Edge Condition",
  "Separation Barrier Type",
  "Signage Clarity / Information Signage",
  "Warning Signage Presence",
  
  // Traffic Calming and Geometry
  "Speed Hump/Table Presence",
  "Roundabout/Traffic Circle Presence",
  "Traffic Calming Measure (General)",
  "Emergency Vehicle Access (Design Factor)", // Less common as a single code
  "Permanent Obstruction (Visibility)", // Maps to "Visibility Obstructions"
  "Roadside Tree Presence / Shade", // Comfort/Attractiveness Factor
];

// Options for each attribute dropdown
const attributeOptions = createListCollection({
  items: [
    { label: "Not Selected", value: "none" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
    { label: "Very High", value: "very_high" },
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ],
});

export default function AttributesDropdown() {
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>(
    Object.fromEntries(cyclerapAttributeNames.map((name) => [name, "none"]))
  );
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAttributeChange = (fieldName: string, value: string) => {
    setAttributeValues((prev) => ({ ...prev, [fieldName]: value }));
    console.log(`${fieldName} changed to:`, value);
  };

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p="6"
      bg="white"
      _dark={{ bg: "gray.800" }}
    >
      {/* Expand/Collapse Button */}
      <Flex justify="space-between" align="center" mb={isExpanded ? "4" : "0"}>
        <Text fontSize="md" fontWeight="bold">
          Filter Segment by Attribute
        </Text>
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

      {/* Collapsible Content */}
      <Collapsible.Root open={isExpanded}>
        <Collapsible.Content>
          <Grid
            templateColumns={{
              base: "1fr",
              md: "repeat(3, 1fr)",
              lg: "repeat(5, 1fr)",
            }}
            gap="4"
          >
            {cyclerapAttributeNames.map((fieldName) => (
              <GridItem key={fieldName}>
                <Text fontSize="xs" fontWeight="semibold" mb="1.5">
                  {fieldName}
                </Text>
                <SelectRoot
                  collection={attributeOptions}
                  size="sm"
                  value={[attributeValues[fieldName]]}
                  onValueChange={(e) => handleAttributeChange(fieldName, e.value[0])}
                >
                  <SelectTrigger>
                    <SelectValueText placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {attributeOptions.items.map((item) => (
                      <SelectItem key={item.value} item={item}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              </GridItem>
            ))}
          </Grid>
        </Collapsible.Content>
        {/* Info Text */}
        <Text fontSize="sm" color="gray.600" textAlign="center" px="6">
          Select your desired filters to view segment of interest
        </Text>
      </Collapsible.Root>
    </Box>
  );
}
