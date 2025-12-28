import { useEffect, useMemo, useState } from "react";
import { fetchProjectList, ping, deleteProject as apiDeleteProject, type ProjectListItem } from "../../api";
import {
  Button,
  Dialog,
  Portal,
  CloseButton,
  Select,
  createListCollection,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { LuPencil } from "react-icons/lu";
import EditProjectModal from "./components/EditProjectModal";

import "./projects.css";

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
      const { projectName, verified } = event.detail;
      console.log("Verification update received:", projectName, verified);

      // Update the project list directly
      setProjectList((prev) => {
        if (!prev) return prev;
        return {
          projects: prev.projects.map((p) =>
            p.name === projectName ? { ...p, verified } : p
          ),
        };
      });
    };

    window.addEventListener("psat:verified:updated", handleVerificationUpdate as EventListener);
    return () => window.removeEventListener("psat:verified:updated", handleVerificationUpdate as EventListener);
  }, []);

  // UseMemo projects
  const projects: ProjectListItem[] = useMemo(() => {
    if (!Projectlist?.projects) return [];
    console.log(Projectlist)
    return Projectlist.projects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
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
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
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

  // Load selected projects
  const loadProject = async () => {
    if (selected.size === 0) return;
    // Convert set to array and encode as query params
    const projectNames = Array.from(selected);
    const encodedNames = projectNames.map(name => encodeURIComponent(name));
    navigate(`/coding/${encodedNames.join(',')}`);
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
            <Button onClick={askDelete} disabled={!selected}>
              Delete Project
            </Button>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="project-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Project Name</th>
              <th style={{ width: 120 }}>Verification Status</th>
              <th>Tags</th>
              <th style={{ width: 180 }}>Actions</th>
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
                      <span style={{ fontSize: "16px" }}>
                        {p.verified ? "✅" : "⏳"}
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
              })
            )}
          </tbody>
        </table>
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