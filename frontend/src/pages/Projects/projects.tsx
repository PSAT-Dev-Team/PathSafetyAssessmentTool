import { useEffect, useMemo, useState } from "react";
import { fetchProjectList, ping, deleteProject as apiDeleteProject, type ProjectListItem } from "../../api";
import {
  Button,
  Dialog,
  Portal,
  CloseButton,
  Combobox,
  createListCollection,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { LuPencil, LuArrowUpDown, LuArrowUp, LuArrowDown } from "react-icons/lu";
import EditProjectModal from "./components/EditProjectModal";

import "./projects.css";
import "./components/EditProjectModal.css";

const createProject = (navigate: any) => {
  navigate(`/projects/create`);
};

interface FileListResponse {
  projects: ProjectListItem[];
}

// Generate a consistent, bright, varied color for each unique tag
function getTagColor(tag: string): string {
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

export default function Home() {

  // Status
  const [, setStatus] = useState("checking...");
  const [, setError] = useState<string | null>(null);

  // Project List
  const [Projectlist, setProjectList] = useState<FileListResponse | null>(null);

  // Sorting
  type SortCriterion = { key: string; direction: 'asc' | 'desc' };
  const [sortConfig, setSortConfig] = useState<SortCriterion[]>([
    { key: 'last_updated', direction: 'desc' }, // Default to newest first
  ]);

  // Filter
  const [nameQuery, setNameQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagInputValue, setTagInputValue] = useState("");
  const [tagComboboxOpen, setTagComboboxOpen] = useState(false);

  // Selected Projects (multiple selection)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Delete dialog state
  const [openDelete, setOpenDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit dialog state
  const [openEdit, setOpenEdit] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null);

  const navigate = useNavigate();


  // Use effect
  useEffect(() => {
    ping()
      .then((r) => setStatus(r.status))
      .catch(() => setStatus("offline"));

    fetchProjectList()
      .then((data) => setProjectList(data))
      .catch((e) => setError(String(e)));
  }, []);

  // Listen for project verified status changes from coding page
  useEffect(() => {
    const handleVerificationUpdate = (event: CustomEvent) => {
      const { projectName, verified, verifiedSegmentCount } = event.detail;

      // Update the project list directly
      setProjectList((prev) => {
        if (!prev) return prev;
        return {
          projects: prev.projects.map((p) => {
            if (p.name === projectName) {
              const updates: any = {};
              if (verified !== undefined) updates.verified = verified;
              if (verifiedSegmentCount !== undefined) updates.verified_segment_count = verifiedSegmentCount;
              return { ...p, ...updates };
            }
            return p;
          }),
        };
      });
    };

    window.addEventListener("psat:verified:updated", handleVerificationUpdate as EventListener);
    return () => window.removeEventListener("psat:verified:updated", handleVerificationUpdate as EventListener);
  }, []);

  // Listen for project autocoded status changes from coding page
  useEffect(() => {
    const handleAutocodedUpdate = (event: CustomEvent) => {
      const { projectName, autocodedSegmentCount } = event.detail;

      // Update the project list directly
      setProjectList((prev) => {
        if (!prev) return prev;
        return {
          projects: prev.projects.map((p) => {
            if (p.name === projectName) {
              if (autocodedSegmentCount !== undefined) {
                return { ...p, autocoded_segment_count: autocodedSegmentCount };
              }
            }
            return p;
          }),
        };
      });
    };

    window.addEventListener("psat:autocoded:updated", handleAutocodedUpdate as EventListener);
    return () => window.removeEventListener("psat:autocoded:updated", handleAutocodedUpdate as EventListener);
  }, []);

  // UseMemo projects
  const projects: ProjectListItem[] = useMemo(() => {
    if (!Projectlist?.projects) return [];

    return Projectlist.projects.slice().sort((a, b) => {
      for (const criterion of sortConfig) {
        let result = 0;

        if (criterion.key === 'last_updated') {
          const dateA = new Date(a.last_updated || 0).getTime();
          const dateB = new Date(b.last_updated || 0).getTime();
          result = dateA - dateB;
        } else if (criterion.key === 'verification_status') {
          const pctA = (a.total_segments || 0) > 0 ? (a.verified_segment_count || 0) / a.total_segments! : 0;
          const pctB = (b.total_segments || 0) > 0 ? (b.verified_segment_count || 0) / b.total_segments! : 0;
          result = pctA - pctB;
        } else if (criterion.key === 'distance_verified') {
          const distA = (a.verified_segment_count || 0) * 10;
          const distB = (b.verified_segment_count || 0) * 10;
          result = distA - distB;
        } else if (criterion.key === 'autocode_status') {
          const pctA = (a.total_segments || 0) > 0 ? (a.autocoded_segment_count || 0) / a.total_segments! : 0;
          const pctB = (b.total_segments || 0) > 0 ? (b.autocoded_segment_count || 0) / b.total_segments! : 0;
          result = pctA - pctB;
        }

        if (result !== 0) {
          return criterion.direction === 'asc' ? result : -result;
        }
      }
      return 0;
    });
  }, [Projectlist, sortConfig]);

  // Get all unique tags across all projects
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    projects.forEach(p => {
      p.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [projects]);

  // for Filters
  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    let list = projects;

    // Filter by name query - searches both project name and tags
    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.tags && p.tags.some(tag => tag.toLowerCase().includes(q)))
      );
    }

    // Filter by selected tags - project must have ALL selected tags
    if (tagFilters.length > 0) {
      list = list.filter((p) =>
        tagFilters.every(selectedTag => p.tags?.includes(selectedTag))
      );
    }

    return list;
  }, [projects, nameQuery, tagFilters]);

  // Toggle project selection
  const onRowClick = (name: string) => {
    setSelected(prev => {
      const newSet = new Set(prev);
      if (newSet.has(name)) {
        newSet.delete(name);
      } else {
        newSet.add(name);
      }
      return newSet;
    });
  };

  // Toggle select all projects
  const toggleSelectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      // All are selected, deselect all
      setSelected(new Set());
    } else {
      // Select all
      setSelected(new Set(filtered.map(p => p.name)));
    }
  };

  // Load selected projects
  const loadProject = async () => {
    if (selected.size === 0) return;
    // Convert set to array and encode as query params
    const projectNames = Array.from(selected);
    const encodedNames = projectNames.map(name => encodeURIComponent(name));
    navigate(`/coding/${encodedNames.join(',')}`);
  };

  // Load treatment application for selected projects
  const loadTreatment = async () => {
    if (selected.size === 0) return;
    // Pass all selected projects as comma-separated encoded names
    const projectNames = Array.from(selected);
    const encodedNames = projectNames.map(name => encodeURIComponent(name));
    navigate(`/treatment/${encodedNames.join(',')}`);
  };

  // Load path analysis for selected projects
  const loadPathAnalysis = () => {
    if (selected.size === 0) return;
    const projectNames = Array.from(selected);
    sessionStorage.setItem("pathAnalysis_selectedProjects", JSON.stringify(projectNames));
    sessionStorage.setItem("pathAnalysis_loadedProjects", JSON.stringify(projectNames));
    navigate("/analysis/path");
  };

  // Edit success callback
  const handleEditSuccess = (newName: string, newTags: string[]) => {
    if (!editingProject) return;

    const oldName = editingProject.name;

    // Update local list
    setProjectList((prev) => {
      if (!prev) return prev;
      return {
        projects: prev.projects.map((p) =>
          p.name === oldName ? { name: newName, tags: newTags } : p
        ),
      };
    });

    // If edited project is currently selected and name changed, update selection
    if (selected.has(oldName) && newName !== oldName) {
      setSelected(prev => {
        const newSet = new Set(prev);
        newSet.delete(oldName);
        newSet.add(newName);
        return newSet;
      });
    }
  };

  // Open delete confirmation dialog for first selected project
  const askDelete = () => {
    if (selected.size === 0) return;
    setOpenDelete(true);
  };

  // Delete selected projects
  const confirmDelete = async () => {
    if (selected.size === 0) return;
    try {
      setDeleting(true);
      // Delete all selected projects
      await Promise.all(Array.from(selected).map(name => apiDeleteProject(name)));
      // Remove from local list
      setProjectList((prev) =>
        prev
          ? { projects: prev.projects.filter((p) => !selected.has(p.name)) }
          : prev
      );
      setSelected(new Set());
      setOpenDelete(false);
    } catch (e: any) {
    } finally {
      setDeleting(false);
    }
  };

  // Remove tag from filter
  const removeTagFilter = (tagToRemove: string) => {
    setTagFilters(tagFilters.filter(tag => tag !== tagToRemove));
  };


  // Handle column header click for sorting
  const handleSort = (key: string, event: React.MouseEvent) => {
    setSortConfig(current => {
      const isShift = event.shiftKey;
      const existingIndex = current.findIndex(c => c.key === key);

      // If user holds Shift, we are doing multi-column sort
      if (isShift) {
        // If sorting by this key already exists
        if (existingIndex !== -1) {
          // Toggle direction
          const newConfig = [...current];
          newConfig[existingIndex] = {
            ...newConfig[existingIndex],
            direction: newConfig[existingIndex].direction === 'asc' ? 'desc' : 'asc'
          };
          return newConfig;
        } else {
          // Add new sort criterion to the end
          return [...current, { key, direction: 'desc' }];
        }
      } else {
        // Single column sort (replace everything)
        // If clicking the same column that is currently primary, toggle it
        if (current.length > 0 && current[0].key === key) {
          return [{ key, direction: current[0].direction === 'asc' ? 'desc' : 'asc' }];
        }
        // Otherwise start fresh with this column descending
        return [{ key, direction: 'desc' }];
      }
    });
  };

  // Helper to get sort status for a column
  const getSortMeta = (key: string) => {
    const index = sortConfig.findIndex(c => c.key === key);
    if (index === -1) return null;
    return {
      direction: sortConfig[index].direction,
      priority: index + 1 // 1-based priority
    };
  };

  const renderHeader = (label: string, key: string, width: number) => {
    const meta = getSortMeta(key);
    return (
      <th
        style={{ width, cursor: "pointer", userSelect: "none" }}
        onClick={(e) => handleSort(key, e)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {label}
          {meta ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              {meta.direction === 'asc' ? <LuArrowUp size={14} /> : <LuArrowDown size={14} />}
              {sortConfig.length > 1 && (
                <span style={{ fontSize: "10px", marginLeft: "2px", fontWeight: "bold" }}>
                  {meta.priority}
                </span>
              )}
            </div>
          ) : (
            <LuArrowUpDown size={14} style={{ opacity: 0.3 }} />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="projects-root">
      <div className="search-panel">
        <div className="search-row">
          <div className="search-item">
            <label htmlFor="nameQuery">Search by project name or tags</label>
            <input
              id="nameQuery"
              type="text"
              placeholder="Type project name or tag…"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="search-item">
            <label htmlFor="tagFilterCombobox">Filter by tags</label>
            <Combobox.Root
              collection={createListCollection({
                items: allTags.map(tag => ({ label: tag, value: tag }))
              })}
              inputValue={tagInputValue}
              onInputValueChange={({ inputValue }) => setTagInputValue(inputValue)}
              onValueChange={({ value }) => {
                if (value.length > 0 && !tagFilters.includes(value[0])) {
                  setTagFilters([...tagFilters, value[0]]);
                  setTagInputValue("");
                }
              }}
              open={tagComboboxOpen}
              onOpenChange={(details) => setTagComboboxOpen(details.open)}
            >
              <Combobox.Control onClick={() => setTagComboboxOpen(true)}>
                <div className="tag-input-container">
                  <div className="tag-input-wrapper">
                    {tagFilters.map((tag) => (
                      <div
                        key={tag}
                        className="tag-chip"
                        style={{ backgroundColor: getTagColor(tag) }}
                      >
                        <span className="tag-chip-text">{tag}</span>
                        <button
                          className="tag-chip-remove"
                          onClick={() => removeTagFilter(tag)}
                          type="button"
                          aria-label={`Remove ${tag} filter`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <Combobox.Input
                      id="tagFilterCombobox"
                      placeholder={tagFilters.length === 0 ? "Type or click to select tags..." : "Add more tags..."}
                      className="tag-input-field"
                    />
                  </div>
                </div>
              </Combobox.Control>
              <Portal>
                <Combobox.Positioner>
                  <Combobox.Content>
                    {allTags
                      .filter(tag =>
                        tag.toLowerCase().includes(tagInputValue.toLowerCase()) &&
                        !tagFilters.includes(tag)
                      )
                      .map((tag) => (
                        <Combobox.Item key={tag} item={{ label: tag, value: tag }}>
                          {tag}
                        </Combobox.Item>
                      ))}
                  </Combobox.Content>
                </Combobox.Positioner>
              </Portal>
            </Combobox.Root>
          </div>
        </div>

        <div className="actions-panel" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            Total Distance Verified: {(filtered.reduce((acc, p) => acc + (p.verified_segment_count || 0), 0) * 10 / 1000).toFixed(2)} km
          </div>
          <div className="buttons">
            <Button onClick={() => createProject(navigate)} colorPalette="black" variant="solid">
              Create Project
            </Button>
            <Button onClick={askDelete} colorPalette="red" disabled={!selected || selected.size === 0}>
              Delete Project
            </Button>
            <Button onClick={loadProject} colorPalette="blue" disabled={!selected || selected.size === 0}>
              Coding
            </Button>
            <Button onClick={loadPathAnalysis} style={{ backgroundColor: "#a220e3", color: "white" }} disabled={!selected || selected.size === 0}>
              Analyse Projects
            </Button>
            <Button onClick={loadTreatment} colorPalette="green" disabled={!selected || selected.size === 0}>
              Treatment Application
            </Button>
          </div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-wrap">
          <table className="project-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>Project Name</th>
                {renderHeader("Verification Status", "verification_status", 140)}
                {renderHeader("Distance Verified", "distance_verified", 140)}
                {renderHeader("Autocode Status", "autocode_status", 140)}
                {renderHeader("Time Modified", "last_updated", 180)}
                <th>Tags</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">
                    No projects found
                  </td>
                </tr>
              ) : (
                <>
                  <tr className="select-all-row" onClick={toggleSelectAll} style={{ cursor: "pointer" }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={toggleSelectAll}
                        aria-label="Select all projects"
                      />
                    </td>
                    <td colSpan={6}>
                      <strong>Select All</strong>
                    </td>
                  </tr>
                  {filtered.map((p) => {
                    const isSelected = selected.has(p.name);

                    return (
                      <tr
                        key={p.name}
                        className={isSelected ? "row selected" : "row"}
                        onClick={() => onRowClick(p.name)}
                        style={{ cursor: "pointer" }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onRowClick(p.name)}
                            aria-label={`Select ${p.name}`}
                          />
                        </td>
                        <td title={p.name}>{p.name}</td>
                        <td>
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>
                            {typeof p.total_segments === 'number' && p.total_segments > 0
                              ? `${((p.verified_segment_count ?? 0) / p.total_segments * 100).toFixed(1)}%`
                              : typeof p.total_segments === 'number'
                                ? "0%"
                                : "—"}
                          </span>
                          {/* Debug: Show raw values if needed */}
                          {/* (segments: {p.verified_segment_count}/{p.total_segments}) */}
                        </td>
                        <td>
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>
                            {typeof p.verified_segment_count === 'number'
                              ? `${((p.verified_segment_count * 10) / 1000).toFixed(2)} km`
                              : "0.00 km"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>
                            {typeof p.total_segments === 'number' && p.total_segments > 0
                              ? `${((p.autocoded_segment_count ?? 0) / p.total_segments * 100).toFixed(1)}%`
                              : typeof p.total_segments === 'number'
                                ? "0%"
                                : "—"}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "14px", color: "#666" }}>
                            {p.last_updated ? new Date(p.last_updated).toLocaleString('en-GB', {
                              year: 'numeric',
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : "—"}
                          </span>
                        </td>
                        <td>
                          <div className="tags-container">
                            {p.tags && p.tags.length > 0 ? (
                              p.tags
                                .slice()
                                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
                                .map((tag) => (
                                  <span
                                    key={tag}
                                    className="tag-badge"
                                    style={{
                                      backgroundColor: getTagColor(tag),
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
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 编辑 Dialog */}
      {editingProject && (
        <EditProjectModal
          open={openEdit}
          onClose={() => setOpenEdit(false)}
          projectName={editingProject.name}
          projectTags={editingProject.tags}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Delete confirmation Dialog */}
      <Dialog.Root open={openDelete} onOpenChange={(d) => setOpenDelete(d.open)}>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Delete {selected.size} project(s)?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                This will permanently remove the following projects and their files:
                <ul style={{ marginTop: "12px", paddingLeft: "20px" }}>
                  {Array.from(selected).map(name => (
                    <li key={name}><strong>{name}</strong></li>
                  ))}
                </ul>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button variant="outline" disabled={deleting}>
                    Cancel
                  </Button>
                </Dialog.ActionTrigger>
                <Button
                  colorPalette="red"
                  onClick={confirmDelete}
                  loading={deleting}
                >
                  Delete
                </Button>
              </Dialog.Footer>

              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </div>
  );
}