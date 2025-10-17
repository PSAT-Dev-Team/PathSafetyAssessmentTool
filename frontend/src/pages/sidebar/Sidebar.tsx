import { useLocation, useNavigate, useMatch } from "react-router-dom";
import { Button } from "@chakra-ui/react";
import { useMemo, useCallback } from "react";
import { toaster } from "../../components/ui/toaster";

import CodingSidebar from "./components/CodingSidebar";
import "./sidebar.css";

const LINKS = [
  { to: "/home", label: "Home" },
  { to: "/treatment", label: "Treatment" },
  { to: "/analysis", label: "Analysis" },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const createProject = () => {
    navigate(`/projects/create`);
  };

  const navigateSidebar = (to: string) => {
    navigate(to);
  };

  // Get the project name
  const codingMatch = useMatch("/coding/:projectName");
  const rawProjectName = codingMatch?.params.projectName ?? null;
  const projectName = useMemo(() => {
    if (!rawProjectName) return null;
    try {
      return decodeURIComponent(rawProjectName);
    } catch {
      return rawProjectName;
    }
  }, [rawProjectName]);

  const inCoding = pathname.startsWith("/coding");
  const onHome = pathname === "/home";
  const onTreatment = pathname === "/treatment";
  const onAnalysis = pathname === "/analysis";

  const onCalculate = useCallback(async () => {
    toaster.create({
      description: "calculating scores",
      type: "success",
    });
  }, []);

  const onSave = async () => {
    // 发出保存请求；让 CodingPage 去真正保存
    window.dispatchEvent(new CustomEvent("psat:save"));

    toaster.create({
      title: "Save requested",
      description: "Saving current attributes…",
      type: "success",
    });
  };

  const onExit = useCallback(() => {
    navigate(`/home`);
  }, [navigate]);

  return (
    <aside className="psat-sidebar" aria-label="PSAT sidebar">
      {/* Top: PSAT + buttons */}
      <div className="psat-side-top">
        <div className="psat-brand">PSAT</div>

        <div className="psat-actions">
          {LINKS.map(({ to, label }) => {
            const active = pathname.startsWith(to);
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
            );
          })}
        </div>
      </div>

      {/* Middle */}
      <div className="psat-side-middle">
        {inCoding && projectName ? (
          <CodingSidebar
            projectName={projectName}
            onCalculate={onCalculate}
            onSave={onSave}
            onExit={onExit}
          />
        ) : (
          <div className="placeholder">Placeholder</div>
        )}
      </div>

      {/* Bottom: Create Project — 只在 /home 或 /treatment 或 /analysis 时出现 */}
      {(onHome || onTreatment || onAnalysis) && (
        <div className="psat-side-bottom">
          <Button onClick={createProject} colorPalette="gray" variant="surface" size="sm">
            Create Project
          </Button>
        </div>
      )}
    </aside>
  );
}
