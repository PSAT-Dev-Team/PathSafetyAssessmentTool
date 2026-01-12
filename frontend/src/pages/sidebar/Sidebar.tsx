import { useLocation, useNavigate, useMatch } from "react-router-dom";
import { Button, Separator } from "@chakra-ui/react";
import { useMemo, useCallback, useState } from "react";
import { toaster } from "../../components/ui/toaster";
import { applyAllTreatments, resetAllTreatments, saveTreatments } from "../../api";

import CodingSidebar from "./components/CodingSidebar";
import TreatmentSidebar from "./components/TreatmentSidebar";
import ResetConfirmationDialog from "./components/ResetConfirmationDialog";
import ShapefileModal from "./components/ShapefileModal";
import ExitConfirmationDialog from "./components/ExitConfirmationDialog";
import "./sidebar.css";

const LINKS = [
  { to: "/home", label: "Projects" },
];


export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [shapefileModalOpen, setShapefileModalOpen] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [treatmentExitDialogOpen, setTreatmentExitDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const openShapefileModal = () => {
    setShapefileModalOpen(true);
  };

  const closeShapefileModal = () => {
    setShapefileModalOpen(false);
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
  const onTreatmentDetail = pathname.startsWith("/treatment/") && projectName;

  // Navigate with exit prompt for coding page
  const navigateSidebar = useCallback((to: string) => {
    if (inCoding) {
      // Always show exit dialog when navigating away from coding page
      (window as any).psat_pendingNavigation = to;
      setExitDialogOpen(true);
    } else {
      navigate(to);
    }
  }, [inCoding, navigate]);

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

        // Notify other components (e.g., TreatmentDetailPage) to refresh using the full details
        window.dispatchEvent(new CustomEvent("psat:treat:all:completed", { detail: result.details }));
      }
    } catch (error) {

      toaster.create({
        description: error instanceof Error ? error.message : "Failed to apply treatments",
        type: "error",
      });
    }
  }, [projectName]);

  const handleResetClick = useCallback(() => {
    if (!projectName) {
      toaster.create({
        description: "No project selected",
        type: "error",
      });
      return;
    }
    setResetDialogOpen(true);
  }, [projectName]);

  const handleConfirmReset = useCallback(async () => {
    if (!projectName) return;

    try {
      setIsResetting(true);
      const result = await resetAllTreatments(projectName);

      if (result.ok) {
        toaster.create({
          title: "Treatments Reset",
          description: `${result.message} Reset ${result.segments_reset} segments.`,
          type: "success",
        });

        window.dispatchEvent(new CustomEvent("psat:reset:all:completed"));
        setResetDialogOpen(false);
      }
    } catch (error) {
      toaster.create({
        description: error instanceof Error ? error.message : "Failed to reset treatments",
        type: "error",
      });
    } finally {
      setIsResetting(false);
    }
  }, [projectName]);


  const onAutoCodeOne = useCallback(() => {
    window.dispatchEvent(new CustomEvent("psat:autocode:one"));
  }, []);

  const onAutoCodeAll = useCallback(() => {
    window.dispatchEvent(new CustomEvent("psat:autocode:all"));
  }, []);

  const onAutoCodeAllProjects = useCallback(() => {
    window.dispatchEvent(new CustomEvent("psat:autocode:all-projects"));
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
    setExitDialogOpen(true);
  }, []);


  const handleSaveAndExit = useCallback(() => {
    setIsSaving(true);
    window.dispatchEvent(new CustomEvent("psat:save"));

    // Give the save event a moment to complete before navigating
    setTimeout(() => {
      setIsSaving(false);
      setExitDialogOpen(false);

      // Navigate to pending location or home
      const pendingNavigation = (window as any).psat_pendingNavigation;
      if (pendingNavigation) {
        navigate(pendingNavigation);
        (window as any).psat_pendingNavigation = null;
      } else {
        navigate(`/home`);
      }
    }, 500);
  }, [navigate]);

  const handleDiscardAndExit = useCallback(() => {
    setExitDialogOpen(false);

    // Navigate to pending location or home
    const pendingNavigation = (window as any).psat_pendingNavigation;
    if (pendingNavigation) {
      navigate(pendingNavigation);
      (window as any).psat_pendingNavigation = null;
    } else {
      navigate(`/home`);
    }
  }, [navigate]);

  const handleExitCancel = useCallback(() => {
    setExitDialogOpen(false);
    // Clear pending navigation
    (window as any).psat_pendingNavigation = null;
  }, []);

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

      toaster.create({
        description: error instanceof Error ? error.message : "Failed to save treatments",
        type: "error",
      });
    }
  }, [projectName]);

  const onTreatmentExit = useCallback(() => {
    setTreatmentExitDialogOpen(true);
  }, []);

  const handleTreatmentSaveAndExit = useCallback(() => {
    setIsSaving(true);
    onTreatmentSave().then(() => {
      setIsSaving(false);
      setTreatmentExitDialogOpen(false);
      navigate(`/home`);
    }).catch(() => {
      setIsSaving(false);
      toaster.create({
        title: "Save failed",
        description: "Failed to save treatments. Please try again.",
        type: "error",
      });
    });
  }, [navigate, onTreatmentSave]);

  const handleTreatmentDiscardAndExit = useCallback(() => {
    setTreatmentExitDialogOpen(false);
    navigate(`/home`);
  }, [navigate]);

  const handleTreatmentExitCancel = useCallback(() => {
    setTreatmentExitDialogOpen(false);
  }, []);

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

          {/* Path Analysis Button */}
          <Button
            onClick={() => navigateSidebar("/analysis/path")}
            colorPalette="gray"
            variant={pathname === "/analysis/path" ? "solid" : "outline"}
            size="sm"
          >
            Path Analysis
          </Button>
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
            onAutoCodeOne={onAutoCodeOne}
            onAutoCodeAll={onAutoCodeAll}
            onAutoCodeAllProjects={onAutoCodeAllProjects}
          />
        )}
      </div>

      {/* Bottom: Create Project & Treatment Actions */}
      {/* Treatment Detail Page - Show treatment sidebar */}
      {onTreatmentDetail && projectName && (
        <div className="psat-side-bottom">
          <TreatmentSidebar
            onTreatAll={handleTreatAllSegments}
            onResetAll={handleResetClick}
            onSave={onTreatmentSave}
            onExit={onTreatmentExit}
          />
        </div>
      )}


      {/* Projects Page - Show GIS layer management button */}
      {pathname === "/home" && (
        <div className="psat-side-bottom">
          <Button onClick={openShapefileModal} colorPalette="blue" variant="surface" size="sm" width="100%">
            GIS Layer
          </Button>
        </div>
      )}

      {/* Shapefile Management Modal */}
      <ShapefileModal open={shapefileModalOpen} onClose={closeShapefileModal} />

      {/* Coding Exit Confirmation Dialog */}
      <ExitConfirmationDialog
        open={exitDialogOpen}
        onSaveAndExit={handleSaveAndExit}
        onDiscardAndExit={handleDiscardAndExit}
        onCancel={handleExitCancel}
        isSaving={isSaving}
      />

      {/* Treatment Exit Confirmation Dialog */}
      <ExitConfirmationDialog
        open={treatmentExitDialogOpen}
        onSaveAndExit={handleTreatmentSaveAndExit}
        onDiscardAndExit={handleTreatmentDiscardAndExit}
        onCancel={handleTreatmentExitCancel}
        isSaving={isSaving}
      />

      <ResetConfirmationDialog
        open={resetDialogOpen}
        onConfirm={handleConfirmReset}
        onCancel={() => setResetDialogOpen(false)}
        isResetting={isResetting}
      />
    </aside>
  );
}
