import { useState, useEffect, useMemo } from "react";
import {
  Button,
  Portal,
  Select,
  createListCollection,
  Box,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { LuPencil } from "react-icons/lu";
import { fetchProjectList, type FileResponse } from "../../api";
import EditProjectModal from "../Home/components/EditProjectModal";
import "../Home/home.css";

// Get border color for Pre/Post tags
function getTagBorderColor(tag: string): string {
  if (tag === "Pre") return "#fb923c"; // orange.emphasized
  if (tag === "Post") return "#22c55e"; // green.emphasized
  return "rgba(0, 0, 0, 0.1)";
}

// Generate a consistent, bright, varied color for each unique tag
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

export default function TreatmentPage() {
  // Project list state
  const [projectList, setProjectList] = useState<FileResponse | null>(null);

  // Filter states
  const [nameQuery, setNameQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");

  // Selected Project
  const [selected, setSelected] = useState<string | null>(null);

  // Edit dialog state
  const [openEdit, setOpenEdit] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);

  const navigate = useNavigate();

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

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    projects.forEach(p => {
      p.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [projects]);

  // Apply filters
  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    let list = projects;
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    if (tagFilter) list = list.filter((p) => p.tags?.includes(tagFilter));
    return list;
  }, [projects, nameQuery, tagFilter]);

  const onRowClick = (name: string) => setSelected(name);

  const loadProject = async () => {
    if (!selected) return;
    navigate(`/coding/${encodeURIComponent(selected)}`);
  };

  const handleEditSuccess = (newName: string, newTags: string[]) => {
    if (!editingProject) return;
    const oldName = editingProject.name;
    setProjectList((prev) => {
      if (!prev) return prev;
      return {
        projects: prev.projects.map((p) =>
          p.name === oldName ? { name: newName, tags: newTags } : p
        ),
      };
    });
    if (selected === oldName && newName !== oldName) {
      setSelected(newName);
    }
  };

  return (
    <div className="home-root">
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
          <div className="search-item">
            <label htmlFor="tagFilter">Filter by tag</label>
            <Select.Root
              collection={createListCollection({
                items: [
                  { label: "All tags", value: "" },
                  ...allTags.map(tag => ({ label: tag, value: tag }))
                ]
              })}
              size="sm"
              value={tagFilter ? [tagFilter] : [""]}
              onValueChange={({ value }) => setTagFilter(value[0] ?? "")}
            >
              <Select.HiddenSelect name="tag-filter" />
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText placeholder="All tags" />
                </Select.Trigger>
                <Select.IndicatorGroup>
                  <Select.Indicator />
                </Select.IndicatorGroup>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content>
                    <Select.Item item={{ label: "All tags", value: "" }} key="">
                      All tags
                      <Select.ItemIndicator />
                    </Select.Item>
                    {allTags.map((tag) => (
                      <Select.Item item={{ label: tag, value: tag }} key={tag}>
                        {tag}
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          </div>
          <div className="actions-buttons">
            <Button onClick={loadProject} colorPalette="blue" disabled={!selected}>
              Load Project
            </Button>
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
              <th style={{ width: 120 }}>Status</th>
              <th>Tags</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  No projects found
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const isSelected = selected === p.name;
                // Find Pre/Post tag if it exists
                const phaseTag = p.tags?.find(tag => tag === "Pre" || tag === "Post");
                // Get all other tags (excluding Pre/Post)
                const otherTags = p.tags?.filter(tag => tag !== "Pre" && tag !== "Post") || [];

                return (
                  <tr
                    key={p.name}
                    className={isSelected ? "row selected" : "row"}
                    onClick={() => onRowClick(p.name)}
                  >
                    <td>
                      <input
                        type="radio"
                        name="projectSelect"
                        checked={isSelected}
                        onChange={() => onRowClick(p.name)}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td title={p.name}>{p.name}</td>
                    <td>
                      {phaseTag && (
                        <Box
                          as="span"
                          bg={phaseTag === "Pre" ? "orange.subtle" : "green.subtle"}
                          color={phaseTag === "Pre" ? "orange.fg" : "green.fg"}
                          borderColor={phaseTag === "Pre" ? "orange.emphasized" : "green.emphasized"}
                          borderWidth="1px"
                          fontSize="xs"
                          fontWeight="semibold"
                          px="2"
                          py="1"
                          borderRadius="md"
                        >
                          {phaseTag}
                        </Box>
                      )}
                    </td>
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
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setEditingProject(p);
                          setOpenEdit(true);
                        }}
                        className="row-edit-btn"
                        aria-label="Edit project"
                      >
                        <LuPencil className="row-edit-icon" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Dialog */}
      {editingProject && (
        <EditProjectModal
          open={openEdit}
          onClose={() => setOpenEdit(false)}
          projectName={editingProject.name}
          projectTags={editingProject.tags}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
