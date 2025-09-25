import { useEffect, useMemo, useState } from "react";
import { fetchSegments, ping } from "../../api";
import "./style.css";

interface FileResponse {
  dirs: string[];
}

// 未来如果后端返回更多字段，可以直接扩展这个类型
interface ProjectItem {
  name: string;
  // createdAt?: string; // ISO
  // updatedAt?: string; // ISO
}

export default function Home() {
  const [status, setStatus] = useState("checking...");
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<FileResponse | null>(null);

  // filters
  const [nameQuery, setNameQuery] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState<string>(""); // placeholder
  const [updatedTo, setUpdatedTo] = useState<string>("");     // placeholder
  const [createdFrom, setCreatedFrom] = useState<string>(""); // placeholder
  const [createdTo, setCreatedTo] = useState<string>("");     // placeholder

  // selection
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    ping()
      .then((r) => setStatus(r.status))
      .catch(() => setStatus("offline"));

    fetchSegments()
      .then((data) => setRaw(data))
      .catch((e) => setError(String(e)));
  }, []);

  // 统一把后端的 dirs 映射成表格数据
  const projects: ProjectItem[] = useMemo(() => {
    if (!raw?.dirs) return [];
    return raw.dirs
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name }));
  }, [raw]);

  // 仅名称过滤（日期过滤等后端有时间字段后再启用）
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
    // navigate(`/project/${encodeURIComponent(selected)}`);
    console.log("LOAD project:", selected);
    alert(`LOAD project: ${selected}`);
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
      {/* 搜索区 */}
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
            <label>Search by date (updated)</label>
            <div className="date-range">
              <input
                type="date"
                value={updatedFrom}
                onChange={(e) => setUpdatedFrom(e.target.value)}
              />
              <span className="range-sep">to</span>
              <input
                type="date"
                value={updatedTo}
                onChange={(e) => setUpdatedTo(e.target.value)}
              />
            </div>
          </div>

          <div className="search-item">
            <label>Search by date created</label>
            <div className="date-range">
              <input
                type="date"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
              <span className="range-sep">to</span>
              <input
                type="date"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 表格区 */}
      <div className="table-wrap">
        <table className="project-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Project Name</th>
              {/* 未来可加 <th>Updated</th> <th>Created</th> */}
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

      {/* 选择 + 操作区 */}
      <div className="actions-panel">
        <div className="selection-box">
          <span className="selection-label">Selected:</span>
          <span className="selection-value">{selected ?? "—"}</span>
        </div>
        <div className="buttons">
          <button
            className="btn primary"
            onClick={loadProject}
            disabled={!selected}
            aria-disabled={!selected}
          >
            Load Project
          </button>
          <button
            className="btn danger"
            onClick={deleteProject}
            disabled={!selected}
            aria-disabled={!selected}
          >
            Delete Project
          </button>
        </div>
      </div>
    </div>
  );
}