import { useLocation, useNavigate, useMatch } from "react-router-dom";
import { Button, Separator } from "@chakra-ui/react";
import { useMemo, useCallback, useState } from "react";
import { toaster } from "../../components/ui/toaster";
import { calculateScore } from "../../api";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@chakra-ui/react";

import CodingSidebar from "./components/CodingSidebar";
import ShapefileModal from "./components/ShapefileModal";
import "./sidebar.css";

const LINKS = [
  { to: "/home", label: "Home" },
  { to: "/treatment", label: "Treatment Projection" },
];

const ANALYSIS_LINKS = [
  { to: "/analysis/attribute", label: "Attribute Analysis" },
  { to: "/analysis/post-treatment", label: "Post-Treatment Analysis" },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [shapefileModalOpen, setShapefileModalOpen] = useState(false);

  const createProject = () => {
    navigate(`/projects/create`);
  };

  const openShapefileModal = () => {
    setShapefileModalOpen(true);
  };

  const closeShapefileModal = () => {
    setShapefileModalOpen(false);
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
  const onAnalysis = pathname.startsWith("/analysis");

  const onCalculate = useCallback(async () => {
    if (!projectName) {
      toaster.create({
        description: "No project selected",
        type: "error",
      });
      return;
    }

    try {
      // Show loading toast and store ID so we can dismiss it later
      const loadingToastId = toaster.create({
        description: "Calculating scores...",
        type: "loading",
      });

      const result = await calculateScore(projectName);

      // Log the attrs data to console so you can inspect it
      console.log("=== CALCULATE SCORE RESULT ===");
      console.log("Result:", result);
      console.log("Result rows:", result.result_rows);

      // Dismiss loading toast
      if (loadingToastId) {
        toaster.dismiss(loadingToastId);
      }

      // Show success toast
      toaster.create({
        description: `Score calculated! ${result.result_rows.length} rows returned`,
        type: "success",
      });

      // Trigger GeoDataPanel to refetch scores
      window.dispatchEvent(new CustomEvent("psat:scores:updated"));
    } catch (error) {
      console.error("Calculate score error:", error);

      // Dismiss loading toast if it exists
      // Note: In error case, we can't reliably dismiss the loading toast,
      // so we'll just let it stay while the error is shown

      toaster.create({
        description: error instanceof Error ? error.message : "Failed to calculate score",
        type: "error",
      });
    }
  }, [projectName]);

  const onAutoCodeOne = useCallback(() => {
    window.dispatchEvent(new CustomEvent("psat:autocode:one"));
  }, []);

  const onAutoCodeAll = useCallback(() => {
    window.dispatchEvent(new CustomEvent("psat:autocode:all"));
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

          {/* Analysis Dropdown Menu */}
          <MenuRoot>
            <MenuTrigger asChild>
              <Button
                colorPalette="gray"
                variant={onAnalysis ? "solid" : "outline"}
                size="sm"
              >
                Analysis ▼
              </Button>
            </MenuTrigger>
            <MenuContent>
              {ANALYSIS_LINKS.map(({ to, label }) => (
                <MenuItem
                  key={to}
                  value={to}
                  onClick={() => navigateSidebar(to)}
                  bg={pathname === to ? "gray.subtle" : "transparent"}
                  _hover={{ bg: "gray.subtle" }}
                >
                  {label}
                </MenuItem>
              ))}
            </MenuContent>
          </MenuRoot>
        </div>
      </div>

      {/* Middle */}
      <Separator />

      <div className="psat-side-middle">
        {inCoding && projectName && (
          <CodingSidebar
            projectName={projectName}
            onCalculate={onCalculate}
            onSave={onSave}
            onExit={onExit}
            onAutoCodeOne={onAutoCodeOne}   // ★ 新增
            onAutoCodeAll={onAutoCodeAll}   // ★ 新增
          />
        )}
      </div>

      {/* Bottom: Create Project — 只在 /home 或 /treatment 或 /analysis 时出现 */}
      {(onHome || onTreatment || onAnalysis) && (
        <div className="psat-side-bottom">
          <Button onClick={createProject} colorPalette="gray" variant="surface" size="sm">
            Create Project
          </Button>
          <Button onClick={openShapefileModal} colorPalette="blue" variant="surface" size="sm" mt={2}>
            Update GIS Layers
          </Button>
        </div>
      )}

      {/* Shapefile Management Modal */}
      <ShapefileModal open={shapefileModalOpen} onClose={closeShapefileModal} />
    </aside>
  );
}
