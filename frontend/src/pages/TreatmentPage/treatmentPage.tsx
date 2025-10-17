import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  Input,
  createListCollection,
  For,
} from "@chakra-ui/react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "@chakra-ui/react";
import { fetchProjectList } from "../../api";
import AttributesDropdown from "./components/AttributesDropdown";
import TreatmentMapView from "./components/TreatmentMapView";

interface FileListResponse {
  projects: string[];
}

interface ProjectItem {
  name: string;
}

// Size filter options
const sizeOptions = createListCollection({
  items: [
    { label: "Any Size", value: "any" },
    { label: "Small (< 10 MB)", value: "small" },
    { label: "Medium (10-100 MB)", value: "medium" },
    { label: "Large (100-500 MB)", value: "large" },
    { label: "Extra Large (> 500 MB)", value: "xlarge" },
  ],
});

// Dataset filter options
const datasetOptions = createListCollection({
  items: [
    { label: "All Datasets", value: "all" },
    { label: "Safety Assessment", value: "safety" },
    { label: "Traffic Analysis", value: "traffic" },
    { label: "Infrastructure", value: "infrastructure" },
    { label: "Environmental", value: "environmental" },
  ],
});

// Tags filter options
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

export default function TreatmentPage() {
  // Project list state
  const [projectList, setProjectList] = useState<FileListResponse | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  // Filter states
  const [nameQuery, setNameQuery] = useState("");
  const [dateCreatedFrom, setDateCreatedFrom] = useState("");
  const [dateCreatedTo, setDateCreatedTo] = useState("");
  const [lastUpdatedFrom, setLastUpdatedFrom] = useState("");
  const [lastUpdatedTo, setLastUpdatedTo] = useState("");
  const [sizeFilter, setSizeFilter] = useState("any");
  const [datasetFilter, setDatasetFilter] = useState("all");
  const [tagsFilter, setTagsFilter] = useState("all");

  // Fetch projects on mount
  useEffect(() => {
    fetchProjectList()
      .then((data) => setProjectList(data))
      .catch((e) => console.error("Failed to fetch projects:", e));
  }, []);

  // Process projects
  const projects: ProjectItem[] = useMemo(() => {
    if (!projectList?.projects) return [];
    return projectList.projects
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name }));
  }, [projectList]);

  // Create collection for project dropdown
  const projectCollection = useMemo(() => {
    return createListCollection({
      items: projects.map((p) => ({
        label: p.name,
        value: p.name,
      })),
    });
  }, [projects]);

  // Handle View Project button click
  const handleViewProject = () => {
    if (selectedProjects.length === 0) {
      alert("Please select at least one project");
      return;
    }
    console.log("Selected projects:", selectedProjects);
    // TODO: Load treatment data for selected projects
  };

  return (
    <Box w="100%" h="100vh" overflowY="auto" p="6">
      {/* Header */}
      <Box mb="6">
        <Text fontSize="2xl" fontWeight="bold" mb="2">
          Treatment Dashboard
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Select one or more projects to start treatment analysis
        </Text>
      </Box>

      {/* Filter Panel */}
      <Box
        borderWidth="1px"
        borderRadius="lg"
        p="6"
        bg="bg.panel"
        mb="6"
      >
        <Text fontSize="lg" fontWeight="semibold" mb="4">
          Filter Projects
        </Text>

        <Flex direction="column" gap="4">
          {/* Row 1: Project Name Dropdown (Multi-select) */}
          <Box>
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Project Name
            </Text>
            <SelectRoot
              collection={projectCollection}
              size="md"
              multiple
              value={selectedProjects}
              onValueChange={(e) => setSelectedProjects(e.value)}
            >
              <SelectTrigger>
                <SelectValueText placeholder="Select one or more projects...">
                  {selectedProjects.length === 0
                    ? "Select one or more projects..."
                    : `${selectedProjects.length} project${selectedProjects.length > 1 ? "s" : ""} selected`}
                </SelectValueText>
              </SelectTrigger>
              <SelectContent maxH="300px" overflowY="auto">
                <For each={projectCollection.items}>
                  {(item) => (
                    <SelectItem key={item.value} item={item}>
                      <Flex align="center" gap="2">
                        <input
                          type="checkbox"
                          checked={selectedProjects.includes(item.value)}
                          readOnly
                          style={{ pointerEvents: "none" }}
                        />
                        <Text>{item.label}</Text>
                      </Flex>
                    </SelectItem>
                  )}
                </For>
              </SelectContent>
            </SelectRoot>
            {selectedProjects.length > 0 && (
              <Flex mt="2" gap="2" flexWrap="wrap">
                {selectedProjects.map((proj) => (
                  <Flex
                    key={proj}
                    align="center"
                    gap="1"
                    px="2"
                    py="1"
                    bg="blue.subtle"
                    borderRadius="md"
                    fontSize="sm"
                  >
                    <Text>{proj}</Text>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        setSelectedProjects(selectedProjects.filter((p) => p !== proj))
                      }
                      px="1"
                    >
                      ×
                    </Button>
                  </Flex>
                ))}
              </Flex>
            )}
          </Box>

          {/* Row 2: Date filters */}
          <Flex gap="4" direction={{ base: "column", md: "row" }}>
            <Box flex="1">
              <Text fontSize="sm" fontWeight="semibold" mb="2">
                Date Created
              </Text>
              <Flex gap="2" align="center">
                <Input
                  type="date"
                  value={dateCreatedFrom}
                  onChange={(e) => setDateCreatedFrom(e.target.value)}
                  size="md"
                />
                <Text fontSize="sm" color="fg.muted">to</Text>
                <Input
                  type="date"
                  value={dateCreatedTo}
                  onChange={(e) => setDateCreatedTo(e.target.value)}
                  size="md"
                />
              </Flex>
            </Box>

            <Box flex="1">
              <Text fontSize="sm" fontWeight="semibold" mb="2">
                Last Updated
              </Text>
              <Flex gap="2" align="center">
                <Input
                  type="date"
                  value={lastUpdatedFrom}
                  onChange={(e) => setLastUpdatedFrom(e.target.value)}
                  size="md"
                />
                <Text fontSize="sm" color="fg.muted">to</Text>
                <Input
                  type="date"
                  value={lastUpdatedTo}
                  onChange={(e) => setLastUpdatedTo(e.target.value)}
                  size="md"
                />
              </Flex>
            </Box>
          </Flex>

          {/* Row 3: Other filters */}
          <Flex gap="4" direction={{ base: "column", md: "row" }}>
            <Box flex="1">
              <Text fontSize="sm" fontWeight="semibold" mb="2">
                Size
              </Text>
              <SelectRoot
                collection={sizeOptions}
                size="md"
                value={[sizeFilter]}
                onValueChange={(e) => setSizeFilter(e.value[0])}
              >
                <SelectTrigger>
                  <SelectValueText placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {sizeOptions.items.map((item) => (
                    <SelectItem key={item.value} item={item}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </Box>

            <Box flex="1">
              <Text fontSize="sm" fontWeight="semibold" mb="2">
                Dataset
              </Text>
              <SelectRoot
                collection={datasetOptions}
                size="md"
                value={[datasetFilter]}
                onValueChange={(e) => setDatasetFilter(e.value[0])}
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
            </Box>

            <Box flex="1">
              <Text fontSize="sm" fontWeight="semibold" mb="2">
                Tags
              </Text>
              <SelectRoot
                collection={tagsOptions}
                size="md"
                value={[tagsFilter]}
                onValueChange={(e) => setTagsFilter(e.value[0])}
              >
                <SelectTrigger>
                  <SelectValueText placeholder="Select tags" />
                </SelectTrigger>
                <SelectContent>
                  {tagsOptions.items.map((item) => (
                    <SelectItem key={item.value} item={item}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </Box>
          </Flex>

          {/* Load Selected Projects Button */}
          <Flex justify="center" mt="4">
            <Button
              colorPalette="blue"
              size="lg"
              px="12"
              onClick={handleViewProject}
              disabled={selectedProjects.length === 0}
            >
              Load Selected Projects ({selectedProjects.length})
            </Button>
          </Flex>
        </Flex>
      </Box>

      {/* Attributes Dropdown Section */}
      <Box mb="6">
        <AttributesDropdown />
      </Box>

      {/* Map/Table Section */}
      <Box mb="6">
        <TreatmentMapView />
      </Box>
    </Box>
  );
}
