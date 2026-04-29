import { useEffect, useMemo, useState } from "react";
import { fetchProjectList, deleteProject as apiDeleteProject, type FileResponse, type ProjectListItem } from "../../api";
import { matchesProjectSearch } from "../../utils/projectSearch";
import {
  Button,
  Dialog,
  Portal,
  CloseButton,
} from "@chakra-ui/react";import { useNavigate } from "react-router-dom";

import "./home.css";

export default function Home() {
  const [error, setError] = useState<string | null>(null);

  // Project List
  const [Projectlist, setProjectList] = useState<FileResponse | null>(null);

  // Filter
  const [nameQuery, setNameQuery] = useState("");

  // Selected Project
  const [selected, setSelected] = useState<string | null>(null);

  // Delete dialog state
  const [openDelete, setOpenDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const navigate = useNavigate();


  // Use effect
  useEffect(() => {
    fetchProjectList()
      .then((data) => setProjectList(data))
      .catch((e) => setError(String(e)));
  }, []);

  // UseMemo projects
  const projects: ProjectListItem[] = useMemo(() => {
    if (!Projectlist?.projects) return [];
    return Projectlist.projects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [Projectlist]);

  // for Filters
  const filtered = useMemo(() => {
    let list = projects;
    if (nameQuery.trim()) list = list.filter((p) => matchesProjectSearch(p, nameQuery));

    return list;
  }, [projects, nameQuery /*, updatedFrom, updatedTo, createdFrom, createdTo */]);

  
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
          ? { projects: prev.projects.filter((project) => project.name !== selected) }
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
            <label htmlFor="nameQuery">Search by project or road</label>
            <input
              id="nameQuery"
              type="text"
              placeholder="Type project name or road…"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="empty">{error}</div>}
      </div>

      <div className="table-wrap">
        <table className="project-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Project Name</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={2} className="empty">
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="actions-panel">
        <div className="buttons">
          <Button onClick={loadProject} colorPalette="blue" disabled={!selected}>
            Load Project
          </Button>
          <Button onClick={askDelete} disabled={!selected}>
            Delete Project
          </Button>
        </div>
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
                {deleteErr && (
                  <div style={{ marginTop: 12, color: "var(--chakra-colors-red-500)" }}>
                    {deleteErr}
                  </div>
                )}
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