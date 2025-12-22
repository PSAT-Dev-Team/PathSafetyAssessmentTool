import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
} from "@chakra-ui/react";
import { fetchProjectList, type FileResponse } from "../../api";
import "../Projects/projects.css"; // Reuse projects page styles

function getTagBorderColor(tag: string): string {
  if (tag === "Pre") return "#fb923c"; // orange.emphasized
  if (tag === "Post") return "#22c55e"; // green.emphasized
  return "rgba(0, 0, 0, 0.1)";
}

function getTagColor(tag: string): string {
  // Fixed colors for Pre/Post - matching the analysis pages (orange.subtle and green.subtle)
  if (tag === "Pre") return "#fed7aa"; // orange.subtle
  if (tag === "Post") return "#bbf7d0"; // green.subtle

  // Simple hash function to convert string to number
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Use multiple hash variations to increase color variety
  const hash2 = Math.abs(hash >> 16);
  const hash3 = Math.abs(hash << 3);

  // Create wider hue distribution with warm and cool colors
  // Avoid muddy middle ranges (40-60 yellow-green, 160-180 cyan)
  let hue = Math.abs(hash % 360);
  if (hue >= 40 && hue <= 60) hue = (hue + 30) % 360;  // Skip muddy yellow-green
  if (hue >= 160 && hue <= 180) hue = (hue + 30) % 360; // Skip muddy cyan

  // Higher saturation (75-95%) for more vibrant colors
  const saturation = 75 + (hash2 % 21); // 75-95%

  // Higher lightness (65-80%) for brighter, more visible colors
  const lightness = 65 + (hash3 % 16); // 65-80%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export default function PostTreatmentAnalysisPage() {
  // Project list state
  const [projectList, setProjectList] = useState<FileResponse | null>(null);

  // Filter and selection states
  const [nameQuery, setNameQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Fetch projects on mount - filter for "Post" tag
  useEffect(() => {
    fetchProjectList()
      .then((data) => setProjectList(data))
      .catch((e) => console.error("Failed to fetch post-treatment projects:", e));
  }, []);

  // Process projects - filter for those with "Post" tag
  const projects = useMemo(() => {
    if (!projectList?.projects) return [];
    return projectList.projects
      .filter((p) => p.tags && p.tags.includes("Post"))
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
    console.log(`Analyzing post-treatment project:`, selected);
    // TODO: Navigate to analysis view or show analysis dashboard
    alert(`Analyzing post-treatment project: ${selected}`);
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
          Post-Treatment Analysis
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Analyze projects after treatment implementation
        </Text>
      </Box>

      {/* Info banner */}
      <Box
        p="4"
        mb="4"
        borderRadius="lg"
        bg="green.subtle"
        borderWidth="1px"
        borderColor="green.emphasized"
      >
        <Flex align="center" gap="2">
          <Text fontWeight="semibold" fontSize="sm">
            ✅ Post-Treatment Projects
          </Text>
          <Text fontSize="sm" color="fg.muted">
            Viewing projects after treatment implementation
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
                  No post-treatment projects found. Create a new project with "Post" tag to see it here.
                </td>
              </tr>
            ) : (
              filtered.map((project) => {
                const isSelected = selected === project.name;
                // Get all tags excluding Pre/Post
                const otherTags = project.tags?.filter(tag => tag !== "Pre" && tag !== "Post") || [];
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
                      <div className="tags-container">
                        {otherTags.length > 0 ? (
                          otherTags.map((tag) => (
                            <span
                              key={tag}
                              className="tag-badge"
                              style={{
                                backgroundColor: getTagColor(tag),
                                borderColor: getTagBorderColor(tag),
                                borderWidth: "1px",
                                borderStyle: "solid",
                              }}
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="no-tags">—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Box
                        as="span"
                        px="2"
                        py="1"
                        borderRadius="md"
                        fontSize="xs"
                        fontWeight="semibold"
                        bg="green.subtle"
                        color="green.fg"
                      >
                        Post
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
