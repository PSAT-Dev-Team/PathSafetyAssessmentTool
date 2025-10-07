import { useEffect, useMemo, useState } from "react";
import { fetchProjectList, ping } from "../../api";
import { Button } from "@chakra-ui/react"
import { useNavigate } from "react-router-dom";

import "./home.css";

interface FileListResponse {
  projects: string[];
}

// 未来如果后端返回更多字段，可以直接扩展这个类型
interface ProjectItem {
  name: string;
  // createdAt?: string; // ISO
  // updatedAt?: string; // ISO
}

export default function Home() {

  // Status
  const [status, setStatus] = useState("checking...");
  const [error, setError] = useState<string | null>(null);

  // Project List
  const [Projectlist, setProjectList] = useState<FileListResponse | null>(null);

  // Filter
  const [nameQuery, setNameQuery] = useState("");

  // Selected Project
  const [selected, setSelected] = useState<string | null>(null);

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
  const projects: ProjectItem[] = useMemo(() => {
    if (!Projectlist?.projects) return [];
    console.log(Projectlist)
    return Projectlist.projects
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name }));
  }, [Projectlist]);

  // for Filters
  const filtered = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    let list = projects;
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));

    // 下面是日期过滤的占位逻辑（等有 createdAt / updatedAt 时启用）
    // if (updatedFrom) list = list.filter(p => p.updatedAt && p.updatedAt >= `${updatedFrom}T00:00:00`);
    // if (updatedTo)   list = list.filter(p => p.updatedAt && p.updatedAt <= `${updatedTo}T23:59:59`);
    // if (createdFrom) list = list.filter(p => p.createdAt && p.createdAt >= `${createdFrom}T00:00:00`);
    // if (createdTo)   list = list.filter(p => p.createdAt && p.createdAt <= `${createdTo}T23:59:59`);

    return list;
  }, [projects, nameQuery /*, updatedFrom, updatedTo, createdFrom, createdTo */]);

  
  const onRowClick = (name: string) => setSelected(name);

  // 你可按需要替换为真实后端接口
  const loadProject = async () => {
    if (!selected) return;
    // 例：跳转到项目详情路由
    navigate(`/coding/${encodeURIComponent(selected)}`);
  };

  const deleteProject = async () => {
    if (!selected) return;
    // 例：调用删除 API（请替换为你的真实接口）
    // await fetch('/api/project/delete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: selected })});
    console.log("DELETE project:", selected);
    alert(`DELETE project: ${selected}`);
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

        </div>
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
          <Button
            onClick={loadProject}
            colorPalette={"blue"}
            disabled={!selected}
          >
            Load Project
          </Button>
          <Button
            onClick={deleteProject}
            disabled={!selected}
          >
            Delete Project
          </Button>
        </div>
      </div>
    </div>
  );
}