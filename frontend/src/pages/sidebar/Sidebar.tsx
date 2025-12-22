import { useLocation, useNavigate, useMatch } from "react-router-dom";
import { Button, Separator } from "@chakra-ui/react";
import { useMemo, useCallback, useState } from "react";
import { toaster } from "../../components/ui/toaster";
import { applyAllTreatments, resetAllTreatments, saveTreatments } from "../../api";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@chakra-ui/react";

import CodingSidebar from "./components/CodingSidebar";
import TreatmentSidebar from "./components/TreatmentSidebar";
import ShapefileModal from "./components/ShapefileModal";
import "./sidebar.css";

const LINKS = [
  { to: "/home", label: "Home" },
  // { to: "/treatment", label: "Treatment Projection" }, // Temporarily removed
];

const ANALYSIS_LINKS = [
  { to: "/analysis/attribute", label: "Path Analysis" },
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
  const treatmentMatch = useMatch("/treatment/:projectName");
  const rawProjectName = codingMatch?.params.projectName ?? treatmentMatch?.params.projectName ?? null;
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
  const onTreatmentDetail = pathname.startsWith("/treatment/") && projectName;
  const onAnalysis = pathname.startsWith("/analysis");

  // Bulk treatment operations
  const handleTreatAllSegments = useCallback(async () => {
    if (!projectName) {
      toaster.create({
        description: "No project selected",
        type: "error",
      });
      return;
    }

    try {
      const result = await applyAllTreatments(projectName);

      if (result.ok) {
        toaster.create({
          title: "Treatments Applied",
          description: `Successfully applied treatments to ${result.segments_treated} segments. ${result.segments_skipped} segments had no applicable treatments.`,
          type: "success",
        });
      }
    } catch (error) {
      console.error("Failed to apply all treatments:", error);
      toaster.create({
        description: error instanceof Error ? error.message : "Failed to apply treatments",
        type: "error",
      });
    }
  }, [projectName]);

  const handleResetAllSegments = useCallback(async () => {
    if (!projectName) {
      toaster.create({
        description: "No project selected",
        type: "error",
      });
      return;
    }

    const confirmed = confirm(
      "Are you sure you want to reset all applied treatments for all segments? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      const result = await resetAllTreatments(projectName);

      if (result.ok) {
        toaster.create({
          title: "Treatments Reset",
          description: `${result.message} Reset ${result.segments_reset} segments.`,
          type: "success",
        });
      }
    } catch (error) {
      console.error("Failed to reset all treatments:", error);
      toaster.create({
        description: error instanceof Error ? error.message : "Failed to reset treatments",
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

  // Treatment save and exit handlers
  const onTreatmentSave = useCallback(async () => {
    if (!projectName) {
      toaster.create({
        description: "No project selected",
        type: "error",
      });
      return;
    }

    try {
      const result = await saveTreatments(projectName);

      if (result.ok) {
        toaster.create({
          title: "Treatments Saved",
          description: result.message,
          type: "success",
        });
      }
    } catch (error) {
      console.error("Failed to save treatments:", error);
      toaster.create({
        description: error instanceof Error ? error.message : "Failed to save treatments",
        type: "error",
      });
    }
  }, [projectName]);

  const onTreatmentExit = useCallback(() => {
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
            onSave={onSave}
            onExit={onExit}
            onAutoCodeOne={onAutoCodeOne}   // ★ 新增
            onAutoCodeAll={onAutoCodeAll}   // ★ 新增
          />
        )}
      </div>

      {/* Bottom: Create Project & Treatment Actions */}
      {/* Treatment Detail Page - Show treatment sidebar */}
      {onTreatmentDetail && projectName && (
        <div className="psat-side-bottom">
          <TreatmentSidebar
            onTreatAll={handleTreatAllSegments}
            onResetAll={handleResetAllSegments}
            onSave={onTreatmentSave}
            onExit={onTreatmentExit}
          />
        </div>
      )}

      {/* Home, Treatment List, and Analysis Pages - Show project management buttons */}
      {(onHome || onTreatment || onAnalysis) && (
        <div className="psat-side-bottom">
          <Button onClick={createProject} colorPalette="gray" variant="surface" size="sm" width="100%">
            Create Project
          </Button>
          <Button onClick={openShapefileModal} colorPalette="blue" variant="surface" size="sm" mt={2} width="100%">
            Update GIS Layers
          </Button>
        </div>
      )}

      {/* Shapefile Management Modal */}
      <ShapefileModal open={shapefileModalOpen} onClose={closeShapefileModal} />
    </aside>
  );
}
