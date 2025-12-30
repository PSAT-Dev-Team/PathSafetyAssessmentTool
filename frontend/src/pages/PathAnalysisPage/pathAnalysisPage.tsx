import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  Input,
  createListCollection,
  Combobox,
  Portal,
} from "@chakra-ui/react";
import { fetchProjectList, type FileResponse } from "../../api";
import AttributesDropdown from "./components/AttributesDropdown";
import PathAnalysisMapView from "./components/PathAnalysisMapView";
import AttributeDistributionChart from "./components/AttributeDistributionChart";
import AggregatedScoreBandPanel from "./components/AggregatedScoreBandPanel";
import "./pathAnalysisPage.css";

export default function PathAnalysisPage() {
  // Project list state
  const [projectList, setProjectList] = useState<FileResponse | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [loadedProjects, setLoadedProjects] = useState<string[]>([]);

  // Filter states
  const [dateCreatedFrom, setDateCreatedFrom] = useState("");
  const [dateCreatedTo, setDateCreatedTo] = useState("");
  const [lastUpdatedFrom, setLastUpdatedFrom] = useState("");
  const [lastUpdatedTo, setLastUpdatedTo] = useState("");
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);

  // Selected attributes for visualization (up to 5)
  const [selectedAttributes, setSelectedAttributes] = useState<(string | null)[]>([null]);

  // Combobox input states for filtering
  const [projectInputValue, setProjectInputValue] = useState("");
  const [tagsInputValue, setTagsInputValue] = useState("");

  // Combobox open states
  const [projectComboboxOpen, setProjectComboboxOpen] = useState(false);
  const [tagsComboboxOpen, setTagsComboboxOpen] = useState(false);

  // Chart data state
  const [chartData, setChartData] = useState<{
    categoryDistributionData: { category: string; count: number; color: string }[];
    primaryFocusAttribute: string | null;
  }>({
    categoryDistributionData: [],
    primaryFocusAttribute: null,
  });

  // Fetch projects on mount
  useEffect(() => {
    fetchProjectList()
      .then((data) => setProjectList(data))
      .catch((e) => console.error("Failed to fetch projects:", e));
  }, []);

  // Process projects
  const projects = useMemo(() => {
    if (!projectList?.projects) return [];
    return projectList.projects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectList]);

  // Filter projects based on input, tags, and date created
  const filteredProjects = useMemo(() => {
    let result = projects;

    // Filter by project name input
    if (projectInputValue) {
      result = result.filter((p) =>
        p.name.toLowerCase().includes(projectInputValue.toLowerCase())
      );
    }

    // Filter by selected tags (if any tags are selected, show only projects that have at least one of those tags)
    if (tagsFilter.length > 0) {
      result = result.filter((p) => {
        if (!p.tags || !Array.isArray(p.tags)) return false;
        return tagsFilter.some((tag) => p.tags!.includes(tag));
      });
    }

    // Filter by date created range
    if (dateCreatedFrom || dateCreatedTo) {
      result = result.filter((p) => {
        if (!p.date_created) return false;
        const projectDate = new Date(p.date_created);

        if (dateCreatedFrom) {
          const fromDate = new Date(dateCreatedFrom);
          if (projectDate < fromDate) return false;
        }

        if (dateCreatedTo) {
          const toDate = new Date(dateCreatedTo);
          // Set to end of day for inclusive range
          toDate.setHours(23, 59, 59, 999);
          if (projectDate > toDate) return false;
        }

        return true;
      });
    }

    // Filter by last updated range
    if (lastUpdatedFrom || lastUpdatedTo) {
      result = result.filter((p) => {
        if (!p.last_updated) return false;
        const projectDate = new Date(p.last_updated);

        if (lastUpdatedFrom) {
          const fromDate = new Date(lastUpdatedFrom);
          if (projectDate < fromDate) return false;
        }

        if (lastUpdatedTo) {
          const toDate = new Date(lastUpdatedTo);
          // Set to end of day for inclusive range
          toDate.setHours(23, 59, 59, 999);
          if (projectDate > toDate) return false;
        }

        return true;
      });
    }

    return result;
  }, [projects, projectInputValue, tagsFilter, dateCreatedFrom, dateCreatedTo, lastUpdatedFrom, lastUpdatedTo]);

  // Get all unique tags from all projects
  const allTags = useMemo(() => {
    if (!projectList?.projects) return [];
    const tagSet = new Set<string>();
    projectList.projects.forEach((p) => {
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach((tag) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [projectList]);

  // Filter tags based on input
  const filteredTags = useMemo(() => {
    if (!tagsInputValue) return allTags;
    return allTags.filter((tag) =>
      tag.toLowerCase().includes(tagsInputValue.toLowerCase())
    );
  }, [allTags, tagsInputValue]);

  // Create collections for dropdowns (using filtered data)
  const projectCollection = useMemo(() =>
    createListCollection({
      items: [
        { label: "Select All", value: "SELECT_ALL" },
        ...filteredProjects.map((p) => ({
          label: p.name,
          value: p.name,
        })),
      ],
    }), [filteredProjects]
  );

  const tagsCollection = useMemo(() =>
    createListCollection({
      items: filteredTags.map((tag) => ({
        label: tag,
        value: tag,
      })),
    }), [filteredTags]
  );

  // Handle Load Selected Projects button click
  const handleLoadProjects = () => {
    if (selectedProjects.length === 0) {
      alert("Please select at least one project");
      return;
    }
    // Trigger loading by updating the loadedProjects state
    setLoadedProjects([...selectedProjects]);
  };

  return (
    <Box w="100%" h="100vh" overflowY="auto" p="6">
      {/* Header */}
      <Box mb="6">
        <Text fontSize="2xl" fontWeight="bold" mb="2">
          Path Analysis
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Select one or more projects to analyze attributes across multiple projects
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
            <Combobox.Root
              collection={projectCollection}
              multiple
              value={selectedProjects}
              open={projectComboboxOpen}
              onOpenChange={(details) => setProjectComboboxOpen(details.open)}
              onValueChange={(e) => {
                if (e.value.includes("SELECT_ALL")) {
                  // If SELECT_ALL is in the value and all projects are already selected, deselect all
                  const allProjectNames = filteredProjects.map(p => p.name);
                  if (selectedProjects.length === allProjectNames.length &&
                      allProjectNames.every(name => selectedProjects.includes(name))) {
                    setSelectedProjects([]);
                  } else {
                    // Otherwise, select all filtered projects (excluding the SELECT_ALL option itself)
                    setSelectedProjects(allProjectNames);
                  }
                } else {
                  setSelectedProjects(e.value);
                }
              }}
              inputValue={projectInputValue}
              onInputValueChange={(e) => setProjectInputValue(e.inputValue)}
            >
              <Combobox.Control
                onClick={() => setProjectComboboxOpen(true)}
              >
                <Combobox.Input
                  placeholder="Type to search projects..."
                />
                <Combobox.IndicatorGroup>
                  <Combobox.ClearTrigger />
                  <Combobox.Trigger />
                </Combobox.IndicatorGroup>
              </Combobox.Control>
              <Portal>
                <Combobox.Positioner>
                  <Combobox.Content maxH="300px" overflowY="auto">
                    <Combobox.Empty>No projects found</Combobox.Empty>
                    {projectCollection.items.map((item) => {
                      const isSelectAll = item.value === "SELECT_ALL";
                      const isChecked = isSelectAll
                        ? filteredProjects.length > 0 && filteredProjects.every(p => selectedProjects.includes(p.name))
                        : selectedProjects.includes(item.value);
                      return (
                        <Combobox.Item item={item} key={item.value}>
                          <Flex align="center" gap="2" width="100%">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              style={{ pointerEvents: "none" }}
                            />
                            <Text fontWeight={isSelectAll ? "bold" : "normal"}>{item.label}</Text>
                          </Flex>
                          <Combobox.ItemIndicator />
                        </Combobox.Item>
                      );
                    })}
                  </Combobox.Content>
                </Combobox.Positioner>
              </Portal>
            </Combobox.Root>
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

          {/* Row 3: Tags filter */}
          <Box>
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Tags
            </Text>
            <Combobox.Root
              collection={tagsCollection}
              multiple
              value={tagsFilter}
              open={tagsComboboxOpen}
              onOpenChange={(details) => setTagsComboboxOpen(details.open)}
              onValueChange={(e) => setTagsFilter(e.value)}
              inputValue={tagsInputValue}
              onInputValueChange={(e) => setTagsInputValue(e.inputValue)}
            >
              <Combobox.Control
                onClick={() => setTagsComboboxOpen(true)}
              >
                <Combobox.Input
                  placeholder="Type to search tags..."
                />
                <Combobox.IndicatorGroup>
                  <Combobox.ClearTrigger />
                  <Combobox.Trigger />
                </Combobox.IndicatorGroup>
              </Combobox.Control>
              <Portal>
                <Combobox.Positioner>
                  <Combobox.Content maxH="300px" overflowY="auto">
                    <Combobox.Empty>No tags found</Combobox.Empty>
                    {tagsCollection.items.map((item) => (
                      <Combobox.Item item={item} key={item.value}>
                        <Flex align="center" gap="2" width="100%">
                          <input
                            type="checkbox"
                            checked={tagsFilter.includes(item.value)}
                            readOnly
                            style={{ pointerEvents: "none" }}
                          />
                          <Text>{item.label}</Text>
                        </Flex>
                        <Combobox.ItemIndicator />
                      </Combobox.Item>
                    ))}
                  </Combobox.Content>
                </Combobox.Positioner>
              </Portal>
            </Combobox.Root>
            {tagsFilter.length > 0 && (
              <Flex mt="2" gap="2" flexWrap="wrap">
                {tagsFilter.map((tag) => (
                  <Flex
                    key={tag}
                    align="center"
                    gap="1"
                    px="2"
                    py="1"
                    bg="purple.subtle"
                    borderRadius="md"
                    fontSize="sm"
                  >
                    <Text>{tag}</Text>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        setTagsFilter(tagsFilter.filter((t) => t !== tag))
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

          {/* Load Selected Projects Button */}
          <Flex justify="center" mt="4">
            <Button
              colorPalette="blue"
              size="lg"
              px="12"
              onClick={handleLoadProjects}
              disabled={selectedProjects.length === 0}
            >
              Load Selected Projects ({selectedProjects.length})
            </Button>
          </Flex>
        </Flex>
      </Box>

      {/* Attributes Dropdown Section */}
      <Box mb="6">
        <AttributesDropdown
          selectedAttributes={selectedAttributes}
          onAttributeChange={setSelectedAttributes}
        />
      </Box>

      {/* Map/Table Section */}
      <Box mb="6">
        <PathAnalysisMapView
          selectedProjects={loadedProjects}
          selectedAttributes={selectedAttributes}
          onChartDataUpdate={setChartData}
        />
      </Box>

      {/* Charts Section - Displayed Below Map/Table */}
      {chartData.primaryFocusAttribute && chartData.categoryDistributionData.length > 0 && (
        <Box
          borderWidth="1px"
          borderRadius="lg"
          p="6"
          bg="white"
          _dark={{ bg: "gray.800" }}
        >
          <AttributeDistributionChart
            categoryData={chartData.categoryDistributionData}
            selectedAttribute={chartData.primaryFocusAttribute}
          />
        </Box>
      )}

      {/* Aggregated Score Band Distribution Panel */}
      {loadedProjects.length > 0 && (
        <Box mt="6">
          <AggregatedScoreBandPanel selectedProjects={loadedProjects} />
        </Box>
      )}
    </Box>
  );
}
