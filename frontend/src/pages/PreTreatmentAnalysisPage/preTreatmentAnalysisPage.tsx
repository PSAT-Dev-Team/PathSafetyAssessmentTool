import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
} from "@chakra-ui/react";
import { fetchProjectList, type FileResponse } from "../../api";
import "../Home/home.css"; // Reuse home page styles

export default function PreTreatmentAnalysisPage() {
  // Project list state
  const [projectList, setProjectList] = useState<FileResponse | null>(null);

  // Filter and selection states
  const [nameQuery, setNameQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Fetch projects on mount - filter for "Pre" tag
  useEffect(() => {
    fetchProjectList()
      .then((data) => setProjectList(data))
      .catch((e) => console.error("Failed to fetch pre-treatment projects:", e));
  }, []);

  // Process projects - filter for those with "Pre" tag
  const projects = useMemo(() => {
    if (!projectList?.projects) return [];
    return projectList.projects
      .filter((p) => p.tags && p.tags.includes("Pre"))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectList]);

  // Apply filters
  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    let list = projects;
    if (q) list = list.filter((project) => project.name.toLowerCase().includes(q));
    return list;
  }, [projects, nameQuery]);

  const onRowClick = (name: string) => setSelected(name);

  const analyzeProject = async () => {
    if (!selected) return;
    console.log(`Analyzing pre-treatment project:`, selected);
    // TODO: Navigate to analysis view or show analysis dashboard
    alert(`Analyzing pre-treatment project: ${selected}`);
  };

  const compareProjects = async () => {
    if (!selected) return;
    console.log(`Comparing project:`, selected);
    // TODO: Open comparison view
    alert(`Feature coming soon: Compare pre/post treatment for ${selected}`);
  };

  return (
    <Box className="home-root">
      {/* Header */}
      <Box mb="6">
        <Text fontSize="2xl" fontWeight="bold" mb="2">
          Pre-Treatment Analysis
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Analyze projects in their pre-treatment state
        </Text>
      </Box>

      {/* Info banner */}
      <Box
        p="4"
        mb="4"
        borderRadius="lg"
        bg="orange.subtle"
        borderWidth="1px"
        borderColor="orange.emphasized"
      >
        <Flex align="center" gap="2">
          <Text fontWeight="semibold" fontSize="sm">
            🈲 Pre-Treatment Projects
          </Text>
          <Text fontSize="sm" color="fg.muted">
            Viewing projects prior to treatment implementation
          </Text>
        </Flex>
      </Box>

      {/* Search Panel */}
      <div className="search-panel">
        <div className="search-row">
          <div className="search-item">
            <label htmlFor="nameQuery">Search by project name</label>
            <input
              id="nameQuery"
              type="text"
              placeholder="Type project name…"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Project Table */}
      <div className="table-wrap">
        <table className="project-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Project Name</th>
              <th>Tags</th>
              <th style={{ width: 120 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No pre-treatment projects found. Create a new project with "Pre" tag to see it here.
                </td>
              </tr>
            ) : (
              filtered.map((project) => {
                const isSelected = selected === project.name;
                return (
                  <tr
                    key={project.name}
                    className={isSelected ? "row selected" : "row"}
                    onClick={() => onRowClick(project.name)}
                  >
                    <td>
                      <input
                        type="radio"
                        name="projectSelect"
                        checked={isSelected}
                        onChange={() => onRowClick(project.name)}
                        aria-label={`Select ${project.name}`}
                      />
                    </td>
                    <td title={project.name}>{project.name}</td>
                    <td>
                      {project.tags && project.tags.length > 0 ? (
                        <Flex gap="1" flexWrap="wrap">
                          {project.tags.map((tag) => (
                            <Box
                              key={tag}
                              as="span"
                              px="2"
                              py="0.5"
                              borderRadius="md"
                              fontSize="xs"
                              bg="gray.100"
                              color="gray.700"
                            >
                              {tag}
                            </Box>
                          ))}
                        </Flex>
                      ) : (
                        <Text fontSize="xs" color="gray.400">
                          No tags
                        </Text>
                      )}
                    </td>
                    <td>
                      <Box
                        as="span"
                        px="2"
                        py="1"
                        borderRadius="md"
                        fontSize="xs"
                        fontWeight="semibold"
                        bg="orange.subtle"
                        color="orange.fg"
                      >
                        Pre
                      </Box>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Action Buttons */}
      <div className="actions-panel">
        <div className="buttons">
          <Button
            onClick={analyzeProject}
            colorPalette="blue"
            disabled={!selected}
          >
            Analyze Project
          </Button>
          <Button
            onClick={compareProjects}
            colorPalette="purple"
            disabled={!selected}
          >
            Compare Pre/Post
          </Button>
        </div>
      </div>
    </Box>
  );
}
