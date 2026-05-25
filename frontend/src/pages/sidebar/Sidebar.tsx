import { useLocation, useNavigate, useMatch } from "react-router-dom";
import { Button, Separator } from "@chakra-ui/react";
import { useMemo, useCallback, useState } from "react";
import { toaster } from "../../components/ui/toaster";
import { applyAllTreatments, resetAllTreatments, saveTreatments } from "../../api";
import { useProfile } from "../../features/profile/ProfileProvider";

import CodingSidebar from "./components/CodingSidebar";
import TreatmentSidebar from "./components/TreatmentSidebar";
import ResetConfirmationDialog from "./components/ResetConfirmationDialog";
import ExitConfirmationDialog from "./components/ExitConfirmationDialog";
import psatLogo from "../LandingPage/assets/PSAT Logo 2.png";
import "./sidebar.css";

const LINKS = [
  { to: "/home", label: "Projects" },
];

// ─── Report Config: parent → children for cascading checkbox logic ───
const REPORT_PARENT_CHILDREN: Record<string, string[]> = {
  showTitle: ['showTitleText', 'showTitleDescription'],
  showRiskBands: ['showRiskBandsOverall', 'showRiskBandsLegend', 'showRiskBandsCrashTypes', 'showRiskBandsVB', 'showRiskBandsBB', 'showRiskBandsSB', 'showRiskBandsBP'],
  showRiskBandsCrashTypes: ['showRiskBandsVB', 'showRiskBandsBB', 'showRiskBandsSB', 'showRiskBandsBP'],
  showMap: ['showMapView'],
  showCharts: ['showPieChart', 'showBarChart'],
};

const REPORT_CHILD_PARENT: Record<string, string> = {
  showTitleText: 'showTitle', showTitleDescription: 'showTitle',
  showRiskBandsOverall: 'showRiskBands', showRiskBandsLegend: 'showRiskBands', showRiskBandsCrashTypes: 'showRiskBands',
  showRiskBandsVB: 'showRiskBandsCrashTypes', showRiskBandsBB: 'showRiskBandsCrashTypes',
  showRiskBandsSB: 'showRiskBandsCrashTypes', showRiskBandsBP: 'showRiskBandsCrashTypes',
  showMapView: 'showMap',
  showPieChart: 'showCharts', showBarChart: 'showCharts',
};

const DEFAULT_REPORT_CONFIG = {
  showTitle: true, showTitleText: true, showTitleDescription: true,
  showRiskBands: true, showRiskBandsOverall: true, showRiskBandsLegend: true,
  showRiskBandsCrashTypes: true, showRiskBandsVB: true, showRiskBandsBB: true,
  showRiskBandsSB: true, showRiskBandsBP: true,
  showFilters: true,
  showMap: true, showMapView: true,
  showCharts: true, showPieChart: true, showBarChart: true,
};


export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { activeProfile, logout } = useProfile();
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [treatmentExitDialogOpen, setTreatmentExitDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Report visibility options for Path Analysis page
  const [reportConfigOpen, setReportConfigOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) { next.delete(section); } else { next.add(section); }
      return next;
    });
  }, []);

  const [reportConfig, setReportConfig] = useState<typeof DEFAULT_REPORT_CONFIG>(() => {
    try {
      const stored = sessionStorage.getItem("psat_report_config");
      if (stored) return { ...DEFAULT_REPORT_CONFIG, ...JSON.parse(stored) };
      return DEFAULT_REPORT_CONFIG;
    } catch {
      return DEFAULT_REPORT_CONFIG;
    }
  });

  const updateReportConfig = useCallback((key: string, val: boolean) => {
    setReportConfig((prev: any) => {
      const next = { ...prev, [key]: val };

      // Cascade down: toggling a parent sets all its children
      const children = REPORT_PARENT_CHILDREN[key];
      if (children) children.forEach((child: string) => { next[child] = val; });

      // Cascade up: checking a child auto-enables the parent chain
      if (val) {
        let cur = key;
        while (REPORT_CHILD_PARENT[cur]) {
          const par = REPORT_CHILD_PARENT[cur]; next[par] = true; cur = par;
        }
      }

      // Cascade up: unchecking a child may disable its parent if all siblings are off
      if (!val) {
        let cur = key;
        while (REPORT_CHILD_PARENT[cur]) {
          const par = REPORT_CHILD_PARENT[cur];
          const siblings = REPORT_PARENT_CHILDREN[par] || [];
          if (siblings.every((s: string) => !next[s])) { next[par] = false; } else { break; }
          cur = par;
        }
      }

      sessionStorage.setItem("psat_report_config", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("psat:report:config-changed", { detail: next }));
      return next;
    });
  }, []);

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

  const completeLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      navigate("/");
    } catch (error) {
      toaster.create({
        title: "Logout failed",
        description: error instanceof Error ? error.message : "Failed to log out.",
        type: "error",
      });
    } finally {
      setIsLoggingOut(false);
    }
  }, [logout, navigate]);

  const consumePendingNavigation = useCallback((defaultPath: string) => {
    const pendingNavigation = (window as any).psat_pendingNavigation;
    (window as any).psat_pendingNavigation = null;
    return pendingNavigation || defaultPath;
  }, []);

  const consumePendingLogout = useCallback(() => {
    const pendingLogout = Boolean((window as any).psat_pendingLogout);
    (window as any).psat_pendingLogout = null;
    return pendingLogout;
  }, []);

  const completeExitAction = useCallback(async (defaultPath: string) => {
    const shouldLogout = consumePendingLogout();
    const nextPath = consumePendingNavigation(defaultPath);
    if (shouldLogout) {
      await completeLogout();
      return;
    }
    navigate(nextPath);
  }, [completeLogout, consumePendingLogout, consumePendingNavigation, navigate]);

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

    const projects = projectName.split(',').map(s => s.trim()).filter(Boolean);
    const allDetails: any[] = [];
    let totalTreated = 0;
    let totalSkipped = 0;
    let errors: string[] = [];

    for (const proj of projects) {
      try {
        const result = await applyAllTreatments(proj);
        if (result.ok) {
          totalTreated += result.segments_treated;
          totalSkipped += result.segments_skipped;
          const enrichedDetails = result.details.map((d: any) => ({ ...d, projectName: proj }));
          allDetails.push(...enrichedDetails);
        }
      } catch (error) {
        errors.push(`${proj}: ${error instanceof Error ? error.message : "Failed"}`);
      }
    }

    if (totalTreated > 0 || totalSkipped > 0) {
      toaster.create({
        title: "Treatments Applied",
        description: `Applied to ${totalTreated} segments across ${projects.length} project(s). ${totalSkipped} skipped.`,
        type: "success",
      });
      // Notify using all details
      window.dispatchEvent(new CustomEvent("psat:treat:all:completed", { detail: allDetails }));
    }

    if (errors.length > 0) {
      toaster.create({
        description: `Some errors occurred: ${errors.join("; ")}`,
        type: "error"
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
      const projects = projectName.split(',').map(s => s.trim()).filter(Boolean);
      let totalReset = 0;
      let errors: string[] = [];

      for (const proj of projects) {
        try {
          const result = await resetAllTreatments(proj);
          if (result.ok) {
            totalReset += result.segments_reset;
          }
        } catch (e) {
          errors.push(`${proj}: Failed`);
        }
      }

      toaster.create({
        title: "Treatments Reset",
        description: `Reset ${totalReset} segments across ${projects.length} project(s).`,
        type: "success",
      });

      window.dispatchEvent(new CustomEvent("psat:reset:all:completed"));
      setResetDialogOpen(false);

      if (errors.length > 0) {
        toaster.create({ description: `Errors: ${errors.join("; ")}`, type: "error" });
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

  const onAutoCodeByAttribute = useCallback((fields: string[]) => {
    window.dispatchEvent(new CustomEvent("psat:autocode:by-field", { detail: { fields } }));
  }, []);

  const onSave = async () => {
    window.dispatchEvent(new CustomEvent("psat:save"));
  };

  const onExit = useCallback(() => {
    setExitDialogOpen(true);
  }, []);

  const onLogout = useCallback(() => {
    if (inCoding) {
      (window as any).psat_pendingNavigation = "/";
      (window as any).psat_pendingLogout = true;
      setExitDialogOpen(true);
      return;
    }

    if (onTreatmentDetail) {
      (window as any).psat_pendingNavigation = "/";
      (window as any).psat_pendingLogout = true;
      setTreatmentExitDialogOpen(true);
      return;
    }

    void completeLogout();
  }, [completeLogout, inCoding, onTreatmentDetail]);


  const handleSaveAndExit = useCallback(() => {
    setIsSaving(true);
    window.dispatchEvent(new CustomEvent("psat:save"));

    // Give the save event a moment to complete before navigating
    setTimeout(() => {
      setIsSaving(false);
      setExitDialogOpen(false);

      void completeExitAction("/home");
    }, 500);
  }, [completeExitAction]);

  const handleDiscardAndExit = useCallback(() => {
    setExitDialogOpen(false);

    void completeExitAction("/home");
  }, [completeExitAction]);

  const handleExitCancel = useCallback(() => {
    setExitDialogOpen(false);
    // Clear pending navigation
    (window as any).psat_pendingNavigation = null;
    (window as any).psat_pendingLogout = null;
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
      const projects = projectName.split(',').map(s => s.trim()).filter(Boolean);
      let errors: string[] = [];

      for (const proj of projects) {
        try {
          await saveTreatments(proj);
        } catch (e) {
          errors.push(`${proj}: Failed`);
        }
      }

      if (errors.length === 0) {
        toaster.create({
          title: "Treatments Saved",
          description: `Saved all changes for ${projects.length} project(s).`,
          type: "success",
        });
      } else {
        toaster.create({
          description: `Saved with some errors: ${errors.join("; ")}`,
          type: "error"
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
      void completeExitAction("/home");
    }).catch(() => {
      setIsSaving(false);
      toaster.create({
        title: "Save failed",
        description: "Failed to save treatments. Please try again.",
        type: "error",
      });
    });
  }, [completeExitAction, onTreatmentSave]);

  const handleTreatmentDiscardAndExit = useCallback(() => {
    setTreatmentExitDialogOpen(false);
    void completeExitAction("/home");
  }, [completeExitAction]);

  const handleTreatmentExitCancel = useCallback(() => {
    setTreatmentExitDialogOpen(false);
    (window as any).psat_pendingNavigation = null;
    (window as any).psat_pendingLogout = null;
  }, []);

  return (
    <aside className="psat-sidebar" aria-label="PSAT sidebar">
      {/* Top: PSAT + buttons */}
      <div className="psat-side-top">
        <img src={psatLogo} alt="PSAT" className="psat-brand-logo" />
        <h1 className="psat-sidebar-title">Path Safety Assessment Tool</h1>

        {activeProfile && (
          <div className="psat-profile-panel">
            <div className="psat-profile-label">Current Profile</div>
            <div className="psat-profile-name">{activeProfile.name}</div>
            <div className="psat-profile-division">{activeProfile.division}</div>
            <Button
              onClick={onLogout}
              colorPalette="red"
              variant="outline"
              size="sm"
              loading={isLoggingOut}
            >
              Log Out
            </Button>
          </div>
        )}

        <div className="psat-actions">
          {LINKS.filter(({ to }) => pathname !== to).map(({ to, label }) => {
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
          {pathname === "/analysis/path" && (
            <div className="psat-report-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <Button
                onClick={() => navigate("/analysis/report")}
                style={{ backgroundColor: "#a220e3", color: "white" }}
                variant="solid"
                size="sm"
                width="100%"
              >
                📄 Open Report Builder
              </Button>

              <div className="psat-report-dropdown-container">
                <button type="button" className="psat-report-dropdown-trigger" onClick={() => setReportConfigOpen(!reportConfigOpen)}>
                  <span>Report Options</span>
                  <span className={`arrow ${reportConfigOpen ? 'open' : ''}`}>▼</span>
                </button>

                {reportConfigOpen && (
                  <div className="psat-report-dropdown-content">

                    {/* ── Title & Description ── */}
                    <div className="psat-report-group">
                      <div className="psat-report-group-header">
                        <label className="psat-checkbox-label">
                          <input type="checkbox" checked={!!reportConfig.showTitle} onChange={(e) => updateReportConfig('showTitle', e.target.checked)} />
                          <span>Title &amp; Description</span>
                        </label>
                        <button type="button" className="psat-section-toggle" onClick={() => toggleSection('title')}>
                          {expandedSections.has('title') ? '▾' : '▸'}
                        </button>
                      </div>
                      {expandedSections.has('title') && (
                        <div className="psat-report-sub-options">
                          <label className="psat-checkbox-label sub-item">
                            <input type="checkbox" checked={!!reportConfig.showTitleText} onChange={(e) => updateReportConfig('showTitleText', e.target.checked)} />
                            <span>Page Title</span>
                          </label>
                          <label className="psat-checkbox-label sub-item">
                            <input type="checkbox" checked={!!reportConfig.showTitleDescription} onChange={(e) => updateReportConfig('showTitleDescription', e.target.checked)} />
                            <span>Subtitle Text</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* ── Risk Score Bands ── */}
                    <div className="psat-report-group">
                      <div className="psat-report-group-header">
                        <label className="psat-checkbox-label">
                          <input type="checkbox" checked={!!reportConfig.showRiskBands} onChange={(e) => updateReportConfig('showRiskBands', e.target.checked)} />
                          <span>Risk Score Bands</span>
                        </label>
                        <button type="button" className="psat-section-toggle" onClick={() => toggleSection('riskBands')}>
                          {expandedSections.has('riskBands') ? '▾' : '▸'}
                        </button>
                      </div>
                      {expandedSections.has('riskBands') && (
                        <div className="psat-report-sub-options">
                          <label className="psat-checkbox-label sub-item">
                            <input type="checkbox" checked={!!reportConfig.showRiskBandsOverall} onChange={(e) => updateReportConfig('showRiskBandsOverall', e.target.checked)} />
                            <span>Overall Risk Level</span>
                          </label>
                          <label className="psat-checkbox-label sub-item">
                            <input type="checkbox" checked={!!reportConfig.showRiskBandsLegend} onChange={(e) => updateReportConfig('showRiskBandsLegend', e.target.checked)} />
                            <span>Risk Level Legend</span>
                          </label>
                          {/* Nested: Risk by Crash Type */}
                          <div className="psat-report-group nested">
                            <div className="psat-report-group-header">
                              <label className="psat-checkbox-label sub-item">
                                <input type="checkbox" checked={!!reportConfig.showRiskBandsCrashTypes} onChange={(e) => updateReportConfig('showRiskBandsCrashTypes', e.target.checked)} />
                                <span>Risk by Crash Type</span>
                              </label>
                              <button type="button" className="psat-section-toggle" onClick={() => toggleSection('crashTypes')}>
                                {expandedSections.has('crashTypes') ? '▾' : '▸'}
                              </button>
                            </div>
                            {expandedSections.has('crashTypes') && (
                              <div className="psat-report-sub-options">
                                <label className="psat-checkbox-label sub-item">
                                  <input type="checkbox" checked={!!reportConfig.showRiskBandsVB} onChange={(e) => updateReportConfig('showRiskBandsVB', e.target.checked)} />
                                  <span>Vehicle-Bicycle (VB)</span>
                                </label>
                                <label className="psat-checkbox-label sub-item">
                                  <input type="checkbox" checked={!!reportConfig.showRiskBandsBB} onChange={(e) => updateReportConfig('showRiskBandsBB', e.target.checked)} />
                                  <span>Bicycle-Bicycle (BB)</span>
                                </label>
                                <label className="psat-checkbox-label sub-item">
                                  <input type="checkbox" checked={!!reportConfig.showRiskBandsSB} onChange={(e) => updateReportConfig('showRiskBandsSB', e.target.checked)} />
                                  <span>Single-Bicycle (SB)</span>
                                </label>
                                <label className="psat-checkbox-label sub-item">
                                  <input type="checkbox" checked={!!reportConfig.showRiskBandsBP} onChange={(e) => updateReportConfig('showRiskBandsBP', e.target.checked)} />
                                  <span>Bicycle-Pedestrian (BP)</span>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Filters Panel (no sub-options) ── */}
                    <label className="psat-checkbox-label">
                      <input type="checkbox" checked={!!reportConfig.showFilters} onChange={(e) => updateReportConfig('showFilters', e.target.checked)} />
                      <span>Filters Panel</span>
                    </label>

                    {/* ── Interactive Map ── */}
                    <div className="psat-report-group">
                      <div className="psat-report-group-header">
                        <label className="psat-checkbox-label">
                          <input type="checkbox" checked={!!reportConfig.showMap} onChange={(e) => updateReportConfig('showMap', e.target.checked)} />
                          <span>Interactive Map</span>
                        </label>
                        <button type="button" className="psat-section-toggle" onClick={() => toggleSection('map')}>
                          {expandedSections.has('map') ? '▾' : '▸'}
                        </button>
                      </div>
                      {expandedSections.has('map') && (
                        <div className="psat-report-sub-options">
                          <label className="psat-checkbox-label sub-item">
                            <input type="checkbox" checked={!!reportConfig.showMapView} onChange={(e) => updateReportConfig('showMapView', e.target.checked)} />
                            <span>Map View</span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* ── Distribution Charts ── */}
                    <div className="psat-report-group">
                      <div className="psat-report-group-header">
                        <label className="psat-checkbox-label">
                          <input type="checkbox" checked={!!reportConfig.showCharts} onChange={(e) => updateReportConfig('showCharts', e.target.checked)} />
                          <span>Distribution Charts</span>
                        </label>
                        <button type="button" className="psat-section-toggle" onClick={() => toggleSection('charts')}>
                          {expandedSections.has('charts') ? '▾' : '▸'}
                        </button>
                      </div>
                      {expandedSections.has('charts') && (
                        <div className="psat-report-sub-options">
                          <label className="psat-checkbox-label sub-item">
                            <input type="checkbox" checked={!!reportConfig.showPieChart} onChange={(e) => updateReportConfig('showPieChart', e.target.checked)} />
                            <span>Pie Chart</span>
                          </label>
                          <label className="psat-checkbox-label sub-item">
                            <input type="checkbox" checked={!!reportConfig.showBarChart} onChange={(e) => updateReportConfig('showBarChart', e.target.checked)} />
                            <span>Bar Chart</span>
                          </label>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>
          )}
        
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
            onAutoCodeByAttribute={onAutoCodeByAttribute}
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
        <div className="psat-side-bottom" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Button onClick={() => navigateSidebar("/gis-layers")} colorPalette="teal" variant="surface" size="sm" width="100%">
            View GIS Layers
          </Button>
        </div>
      )}

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
