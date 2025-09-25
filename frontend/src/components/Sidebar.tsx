import { NavLink, useNavigate, useLocation } from "react-router-dom";
import "./sidebar.css";

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <aside className="psat-sidebar" aria-label="PSAT sidebar">
      {/* Top: PSAT + buttons */}
      <div className="psat-side-top">
        <div className="psat-brand">PSAT</div>
        <div className="psat-actions">
          <NavLink to="/home" className="psat-btn" data-active={pathname.startsWith("/home")}>Home</NavLink>
          <NavLink to="/coding" className="psat-btn" data-active={pathname.startsWith("/coding")}>Coding</NavLink>
          <NavLink to="/analysis" className="psat-btn" data-active={pathname.startsWith("/analysis")}>Analysis</NavLink>
        </div>
      </div>

      {/* Middle: placeholder (将来按页面切换成不同功能区) */}
      <div className="psat-side-middle">
        {/* 占位内容：你可以根据 pathname 渲染不同的小部件 */}
        <div className="placeholder">Placeholder</div>
      </div>

      {/* Bottom: Create Project */}
      <div className="psat-side-bottom">
        <button className="psat-btn primary" onClick={() => navigate("/projects/create")}>
          Create Project
        </button>
      </div>
    </aside>
  );
}
