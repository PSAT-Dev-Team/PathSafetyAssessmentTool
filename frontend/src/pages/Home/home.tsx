import { useEffect, useMemo, useState } from "react";
import { fetchProjectList, ping, deleteProject as apiDeleteProject, type ProjectListItem } from "../../api";
import {
  Button,
  Dialog,
  Portal,
  CloseButton,
  Text,
  Select,
  createListCollection,
} from "@chakra-ui/react";import { useNavigate } from "react-router-dom";

import "./home.css";

interface FileListResponse {
  projects: ProjectListItem[];
}

// Generate a consistent color for each unique tag
function getTagColor(tag: string): string {
  // Simple hash function to convert string to number
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert to HSL color with good saturation and lightness
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
  const lightness = 75 + (Math.abs(hash >> 8) % 10); // 75-85%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export default function Home() {

  // Status
  const [status, setStatus] = useState("checking...");
  const [error, setError] = useState<string | null>(null);

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
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

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

// 打开确认对话框
  const askDelete = () => {
    if (!selected) return;
    setDeleteErr(null);
    setOpenDelete(true);
  };

  // 真正删除
  const confirmDelete = async () => {
    if (!selected) return;
    try {
      setDeleting(true);
      setDeleteErr(null);
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
      setDeleteErr(e?.message ?? "Delete failed");
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
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty">
                  No projects found
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const isSelected = selected === p.name;
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
                      <div className="tags-container">
                        {p.tags && p.tags.length > 0 ? (
                          p.tags.map((tag) => (
                            <span
                              key={tag}
                              className="tag-badge"
                              style={{ backgroundColor: getTagColor(tag) }}
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="no-tags">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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