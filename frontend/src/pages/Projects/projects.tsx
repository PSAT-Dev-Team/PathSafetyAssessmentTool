import { useEffect, useMemo, useState } from "react";
import { fetchProjectList, ping, deleteProject as apiDeleteProject, type ProjectListItem } from "../../api";
import {
  Button,
  Dialog,
  Portal,
  CloseButton,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { LuPencil } from "react-icons/lu";
import EditProjectModal from "./components/EditProjectModal";

import "./projects.css";

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

  // Filter
  const [nameQuery, setNameQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");

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
      console.log("Verification update received:", {
        projectName,
        verified,
        verifiedSegmentCount,
        eventDetail: event.detail
      });

      // Update the project list directly
      setProjectList((prev) => {
        if (!prev) return prev;
        return {
          projects: prev.projects.map((p) => {
            if (p.name === projectName) {
              const updates: any = {};
              if (verified !== undefined) updates.verified = verified;
              if (verifiedSegmentCount !== undefined) updates.verified_segment_count = verifiedSegmentCount;
              console.log("Updating project:", projectName, "with:", updates);
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
      console.log("Received psat:autocoded:updated event:", { projectName, autocodedSegmentCount });

      // Update the project list directly
      setProjectList((prev) => {
        if (!prev) return prev;
        return {
          projects: prev.projects.map((p) => {
            if (p.name === projectName) {
              if (autocodedSegmentCount !== undefined) {
                console.log("Updating autocoded count for", projectName, "to", autocodedSegmentCount);
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
    console.log(Projectlist)
    return Projectlist.projects
      .slice()
      .sort((a, b) => {
        // Sort by last_updated descending (most recent first)
        const dateA = new Date(a.last_updated || 0).getTime();
        const dateB = new Date(b.last_updated || 0).getTime();
        return dateB - dateA;
      });
  }, [Projectlist]);

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

    // Filter by selected tag (exact match)
    if (tagFilter) list = list.filter((p) => p.tags?.includes(tagFilter));

    return list;
  }, [projects, nameQuery, tagFilter]);

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

  // Load treatment application for selected project
  const loadTreatment = async () => {
    if (selected.size === 0) return;
    // Get the first selected project (only one should be selected for treatment)
    const projectName = Array.from(selected)[0];
    navigate(`/treatment/${encodeURIComponent(projectName)}`);
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
      console.error("Delete failed:", e);
    } finally {
      setDeleting(false);
    }
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
            <label htmlFor="tagFilter">Filter by tag</label>
            <select
              id="tagFilter"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="search-input"
            >
              <option value="">All tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div className="actions-buttons">
            <Button onClick={() => createProject(navigate)} colorPalette="black" variant="solid">
              Create Project
            </Button>
            <Button onClick={loadProject} colorPalette="blue" disabled={!selected}>
              Coding
            </Button>
            <Button onClick={loadTreatment} colorPalette="green" disabled={!selected}>
              Treatment Application
            </Button>
            <Button onClick={askDelete} colorPalette="red" disabled={!selected}>
              Delete Project
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
                <th style={{ width: 120 }}>Verification Status</th>
                <th style={{ width: 120 }}>Autocode Status</th>
                <th>Tags</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
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
                    <td colSpan={4}>
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
                          {typeof p.total_segments === 'number' && p.total_segments > 0
                            ? `${((p.autocoded_segment_count ?? 0) / p.total_segments * 100).toFixed(1)}%`
                            : typeof p.total_segments === 'number'
                            ? "0%"
                            : "—"}
                        </span>
                      </td>
                      <td>
                        <div className="tags-container">
                          {p.tags && p.tags.length > 0 ? (
                            p.tags.map((tag) => (
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