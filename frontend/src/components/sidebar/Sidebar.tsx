import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@chakra-ui/react"

import "./sidebar.css";

const LINKS = [
  { to: "/home", label: "Home" },
  { to: "/analysis", label: "Analysis" },
]

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  

  const createProject = () => {
    navigate(`/projects/create`);
  }

  const navigateSidebar = (to: string) => {
    navigate(to);
  }


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
                onClick={() => navigateSidebar(to)}
                key={to}
                colorPalette="gray"
                variant={active ? "solid" : "outline"}
                size="sm"
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Middle: placeholder */}
      <div className="psat-side-middle">
        <div className="placeholder">Placeholder</div>
      </div>

      {/* Bottom: Create Project */}
      <div className="psat-side-bottom">
          <Button
            onClick={createProject}
            colorPalette="grey"
            variant="solid"
            size="sm"
          >
            Create Project
          </Button>
      </div>
    </aside>
  );
}
