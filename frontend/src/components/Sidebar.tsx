import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@chakra-ui/react"

import "./sidebar.css";

const LINKS = [
  { to: "/home", label: "Home" },
  { to: "/coding", label: "Coding" },
  { to: "/analysis", label: "Analysis" },
]

export default function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="psat-sidebar" aria-label="PSAT sidebar">
      {/* Top: PSAT + buttons */}
      <div className="psat-side-top">
        <div className="psat-brand">PSAT</div>
        
        <div className="psat-actions">
          {LINKS.map(({ to, label }) => {
            const active = pathname.startsWith(to)
            return (
              <Button
                asChild
                key={to}
                colorPalette="gray"
                variant={active ? "solid" : "outline"}
                size="sm"
              >
                <NavLink to={to}>{label}</NavLink>
              </Button>
            )
          })}
        </div>
      </div>

      {/* Middle: placeholder (将来按页面切换成不同功能区) */}
      <div className="psat-side-middle">
        {/* 占位内容：你可以根据 pathname 渲染不同的小部件 */}
        <div className="placeholder">Placeholder</div>
      </div>

      {/* Bottom: Create Project */}
      <div className="psat-side-bottom">
          <Button
            asChild
            colorPalette={"grey"}
            variant={"solid"}
            size="sm"
          >
            <NavLink to="/projects/create">Create Project</NavLink>
          </Button>
      </div>
    </aside>
  );
}
