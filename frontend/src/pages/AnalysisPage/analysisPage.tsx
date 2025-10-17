import { useState } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  Grid,
  GridItem,
  createListCollection,
} from "@chakra-ui/react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@chakra-ui/react";
import AttributesDropdown from "./components/AttributesDropdown";
import MapView from "./components/MapView";

// Define the structure for filter fields
interface FilterFields {
  projectName: string;
  lastUpdated: string;
  size: string;
  dateCreated: string;
  dataset: string;
  tags: string;
}

// Dropdown options for each field
const projectNameOptions = createListCollection({
  items: [
    { label: "All Projects", value: "all" },
    { label: "Project Alpha", value: "alpha" },
    { label: "Project Beta", value: "beta" },
    { label: "Project Gamma", value: "gamma" },
    { label: "Project Delta", value: "delta" },
  ],
});

const lastUpdatedOptions = createListCollection({
  items: [
    { label: "Any Time", value: "any" },
    { label: "Last 24 Hours", value: "24h" },
    { label: "Last Week", value: "week" },
    { label: "Last Month", value: "month" },
    { label: "Last Year", value: "year" },
  ],
});

const sizeOptions = createListCollection({
  items: [
    { label: "Any Size", value: "any" },
    { label: "Small (< 10 MB)", value: "small" },
    { label: "Medium (10-100 MB)", value: "medium" },
    { label: "Large (100-500 MB)", value: "large" },
    { label: "Extra Large (> 500 MB)", value: "xlarge" },
  ],
});

const dateCreatedOptions = createListCollection({
  items: [
    { label: "Any Date", value: "any" },
    { label: "2024", value: "2024" },
    { label: "2023", value: "2023" },
    { label: "2022", value: "2022" },
    { label: "Older", value: "older" },
  ],
});

const datasetOptions = createListCollection({
  items: [
    { label: "All Datasets", value: "all" },
    { label: "Safety Assessment", value: "safety" },
    { label: "Traffic Analysis", value: "traffic" },
    { label: "Infrastructure", value: "infrastructure" },
    { label: "Environmental", value: "environmental" },
  ],
});

const tagsOptions = createListCollection({
  items: [
    { label: "All Tags", value: "all" },
    { label: "Cycling", value: "cycling" },
    { label: "Pedestrian", value: "pedestrian" },
    { label: "Urban", value: "urban" },
    { label: "Rural", value: "rural" },
    { label: "High Priority", value: "priority" },
  ],
});

export default function AnalysisPage() {
  const [filters, setFilters] = useState<FilterFields>({
    projectName: "all",
    lastUpdated: "any",
    size: "any",
    dateCreated: "any",
    dataset: "all",
    tags: "all",
  });

  // Handle dropdown changes
  const handleFilterChange = (field: keyof FilterFields, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  // Handle View Project button click
  const handleViewProject = () => {
    console.log("Selected filters:", filters);
    // Add your logic here to view/filter projects
    alert(`Viewing projects with filters:\n${JSON.stringify(filters, null, 2)}`);
  };

  return (
    <Box w="100%" h="100vh">
      {/* Header */}
      <Box mb="6" px="6" pt="6">
        <Text fontSize="2xl" fontWeight="bold" mb="2">
          Treatment Dashboard
        </Text>
        <Text fontSize="sm" color="gray.600">
          Select 1 or more project of interest to start treatment
        </Text>
      </Box>

      {/* Filter Fields */}
      <Box
        borderWidth="1px"
        borderRadius="lg"
        p="6"
        bg="white"
        _dark={{ bg: "gray.800" }}
        mb="6"
        mx="6"
      >
        <Grid templateColumns={{ base: "1fr", md: "repeat(6, 1fr)" }} gap="4">
          {/* Project Name */}
          <GridItem>
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Project Name
            </Text>
            <SelectRoot
              collection={projectNameOptions}
              size="md"
              value={[filters.projectName]}
              onValueChange={(e) =>
                handleFilterChange("projectName", e.value[0])
              }
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projectNameOptions.items.map((item) => (
                  <SelectItem key={item.value} item={item}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </GridItem>

          {/* Last Updated */}
          <GridItem>
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Last Updated
            </Text>
            <SelectRoot
              collection={lastUpdatedOptions}
              size="md"
              value={[filters.lastUpdated]}
              onValueChange={(e) =>
                handleFilterChange("lastUpdated", e.value[0])
              }
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select time period" />
              </SelectTrigger>
              <SelectContent>
                {lastUpdatedOptions.items.map((item) => (
                  <SelectItem key={item.value} item={item}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </GridItem>

          {/* Size */}
          <GridItem>
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Size
            </Text>
            <SelectRoot
              collection={sizeOptions}
              size="md"
              value={[filters.size]}
              onValueChange={(e) => handleFilterChange("size", e.value[0])}
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select size range" />
              </SelectTrigger>
              <SelectContent>
                {sizeOptions.items.map((item) => (
                  <SelectItem key={item.value} item={item}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </GridItem>

          {/* Date Created */}
          <GridItem>
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Date Created
            </Text>
            <SelectRoot
              collection={dateCreatedOptions}
              size="md"
              value={[filters.dateCreated]}
              onValueChange={(e) =>
                handleFilterChange("dateCreated", e.value[0])
              }
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select date" />
              </SelectTrigger>
              <SelectContent>
                {dateCreatedOptions.items.map((item) => (
                  <SelectItem key={item.value} item={item}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </GridItem>

          {/* Dataset */}
          <GridItem>
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Dataset
            </Text>
            <SelectRoot
              collection={datasetOptions}
              size="md"
              value={[filters.dataset]}
              onValueChange={(e) => handleFilterChange("dataset", e.value[0])}
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select dataset" />
              </SelectTrigger>
              <SelectContent>
                {datasetOptions.items.map((item) => (
                  <SelectItem key={item.value} item={item}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </GridItem>

          {/* Tags */}
          <GridItem>
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Tags
            </Text>
            <SelectRoot
              collection={tagsOptions}
              size="md"
              value={[filters.tags]}
              onValueChange={(e) => handleFilterChange("tags", e.value[0])}
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select tag" />
              </SelectTrigger>
              <SelectContent>
                {tagsOptions.items.map((item) => (
                  <SelectItem key={item.value} item={item}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
          </GridItem>
        </Grid>

        {/* View Project Button */}
        <Flex justify="center" mt="8">
          <Button
            colorScheme="blue"
            size="lg"
            px="12"
            onClick={handleViewProject}
          >
            View Project
          </Button>
        </Flex>
      </Box>

      {/* Attributes Dropdown Section - Separate Box */}
      <Box mx="6" mb="6">
        <AttributesDropdown />
      </Box>

      {/* Map Section - Separate Box */}
      <Box mx="6" mb="6">
        <MapView />
      </Box>
    </Box>
  );
}
