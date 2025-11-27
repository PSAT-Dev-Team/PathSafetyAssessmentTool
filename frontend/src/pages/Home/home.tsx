import { useEffect, useMemo, useState } from "react";
import { fetchProjectList, ping, deleteProject as apiDeleteProject, type ProjectListItem } from "../../api";
import {
  Button,
  Dialog,
  Portal,
  CloseButton,
  Select,
  createListCollection,
  Box,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { LuPencil } from "react-icons/lu";
import EditProjectModal from "./components/EditProjectModal";

import "./home.css";

interface FileListResponse {
  projects: ProjectListItem[];
}

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

export default function Home() {

  // Status
  const [, setStatus] = useState("checking...");
  const [, setError] = useState<string | null>(null);

  // Project List
  const [Projectlist, setProjectList] = useState<FileListResponse | null>(null);

  // Filter
  const [nameQuery, setNameQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");

  // Selected Project
  const [selected, setSelected] = useState<string | null>(null);

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

  
  const onRowClick = (name: string) => setSelected(name);

  // 你可按需要替换为真实后端接口
  const loadProject = async () => {
    if (!selected) return;
    // 例：跳转到项目详情路由
    navigate(`/coding/${encodeURIComponent(selected)}`);
  };

  // 编辑成功回调
  const handleEditSuccess = (newName: string, newTags: string[]) => {
    if (!editingProject) return;

    const oldName = editingProject.name;

    // 更新本地列表
    setProjectList((prev) => {
      if (!prev) return prev;
      return {
        projects: prev.projects.map((p) =>
          p.name === oldName ? { name: newName, tags: newTags } : p
        ),
      };
    });

    // 如果编辑的项目是当前选中的，并且名称改变了，更新选中的项目
    if (selected === oldName && newName !== oldName) {
      setSelected(newName);
    }
  };

// 打开确认对话框
  const askDelete = () => {
    if (!selected) return;
    setOpenDelete(true);
  };

  // 真正删除
  const confirmDelete = async () => {
    if (!selected) return;
    try {
      setDeleting(true);
      await apiDeleteProject(selected);
      // 本地把它从列表移除
      setProjectList((prev) =>
        prev
          ? { projects: prev.projects.filter((p) => p.name !== selected) }
          : prev
      );
      setSelected(null);
      setOpenDelete(false);
    } catch (e: any) {
      console.error("Delete failed:", e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="home-root">
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
              <th>Tags</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
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
                    <td title={p.name}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <span>{p.name}</span>
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
                            ml="auto"
                          >
                            {phaseTag}
                          </Box>
                        )}
                      </div>
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

      {/* 删除确认 Dialog */}
      <Dialog.Root open={openDelete} onOpenChange={(d) => setOpenDelete(d.open)}>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Delete project?</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                This will permanently remove{" "}<strong>{selected}</strong> and its files.
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