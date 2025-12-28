import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Flex,
  Grid,
  GridItem,
  Text,
  Spinner,
  NumberInput,
  Button,
  Portal,
  Progress,
  Card,
  CardBody
} from "@chakra-ui/react";

import type { Feature, FeatureCollection, LineString } from "geojson";
import { toaster } from "../../components/ui/toaster";


import {
  fetchProjectDetail,
  fetchProjectAttributes,
  fetchProjectGeoJSON,
  fetchAttributeMappings,
  calculateScore,
  calculateScoreForRow,
  fetchProjectMetadata,
  updateProject,
} from "../../api";

import type { AttributeRow } from "../../api";
import { autocodeImage, autocodeGIS, autocodeAll } from "../../api";


import ImagePanel from "./components/ImagePanel";
import AttributesPanel from "./components/AttributesPanel";
import GeoDataPanel from "./components/GeoDataPanel";
import { saveAttributes } from "../../api";
import { CurvatureVisualizationPanel } from "../../components/visualization/curvature/CurvatureVisualizationPanel";
import "../../components/visualization/curvature/CurvatureVisualizationPanel.css";
import { WidthVisualizationPanel } from "../../components/visualization/width/WidthVisualizationPanel";
import "../../components/visualization/width/WidthVisualizationPanel.css";
import SegmentScoresCard from "../../components/visualization/scoreband/SegmentScoresCard";
import AutocodeValidation from "../AttributeAnalysisPage/components/AutocodeValidation";


type ProjectDetail = { name: string; versions: string[]; latest: string };
type AttributesResponse = { rows: AttributeRow[] };
type AttrMappings = Record<string, Record<string, string>>;

const PANEL_HEIGHT = 500;
const CONTROLS_H = 56;

// Type for project data
type ProjectDataState = {
  detail: ProjectDetail | null;
  attrs: AttributeRow[];
  geoFeatures: Feature[];
  scores: any[];
  currentPage: number;
  changedFieldsByRow: Record<number, string[]>;
  fieldSourcesByRow: Record<number, Record<string, string>>;
  loading: boolean;
  error: string | null;
  editedRow: AttributeRow | null;
  verified?: boolean;
};

const defaultProjectData: ProjectDataState = {
  detail: null,
  attrs: [],
  geoFeatures: [],
  scores: [],
  currentPage: 1,
  changedFieldsByRow: {},
  fieldSourcesByRow: {},
  loading: true,
  error: null,
  editedRow: null,
};

export default function CodingPage() {
  const { projectNames } = useParams<{ projectNames: string }>();

  // Parse multiple project names from URL
  const projectList = useMemo(() => {
    if (!projectNames) return [];
    try {
      return projectNames.split(',').map(name => {
        try {
          return decodeURIComponent(name);
        } catch {
          return name;
        }
      });
    } catch {
      return [];
    }
  }, [projectNames]);

  // Current active project tab
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const currentProjectName = projectList[activeTabIndex] ?? null;

  // State for each project: keyed by project name
  const [projectData, setProjectData] = useState<Record<string, ProjectDataState>>({});

  // Global state
  const [autoCoding, setAutoCoding] = useState(false);
  const [autoCodeMsg, setAutoCodeMsg] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [projectProgress, setProjectProgress] = useState<Record<string, { processed: number; total: number }>>({});
  const [attrMappings, setAttrMappings] = useState<AttrMappings>({});

  // Refs for cleanup
  const cleanupTimeoutRef = useRef<number | null>(null);
  const scoreDebounceRef = useRef<Record<number, number>>({});
  const autoCodingRef = useRef(false);

  // Get current project data with defaults
  const currentData = useMemo<ProjectDataState>(() => {
    if (!currentProjectName) return defaultProjectData;
    return projectData[currentProjectName] || defaultProjectData;
  }, [projectData, currentProjectName]);

  // Shorthand accessors
  const {
    detail,
    attrs,
    geoFeatures,
    scores,
    currentPage,
    changedFieldsByRow,
    fieldSourcesByRow,
    loading,
    error,
    editedRow,
  } = currentData;

  // Helper to update a specific project's data
  const updateProjectData = (projectName: string, updates: Partial<ProjectDataState>) => {
    setProjectData(prev => ({
      ...prev,
      [projectName]: {
        ...prev[projectName] || defaultProjectData,
        ...updates,
      },
    }));
  };

  // Toggle verified status for a project
  const toggleVerified = async (projectName: string, currentVerified: boolean) => {
    try {
      await updateProject(projectName, { tags: undefined, verified: !currentVerified });
      updateProjectData(projectName, { verified: !currentVerified });
      // Notify other pages (like projects list) of the verified status change
      window.dispatchEvent(new CustomEvent("psat:verified:updated", { detail: { projectName, verified: !currentVerified } }));
    } catch (e: any) {
      console.error("Failed to update verification status:", e);
      toaster.create({
        title: "Failed to update",
        description: e?.message ?? "Failed to update verification status",
        type: "error",
      });
    }
  };

  // Helper function to clear auto-coding state
  const clearAutoCodingState = useCallback(() => {
    setAutoCoding(false);
    setAutoCodeMsg("");
    setProgress(0);
    setProjectProgress({});
    if (cleanupTimeoutRef.current !== null) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (cleanupTimeoutRef.current !== null) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }
      Object.values(scoreDebounceRef.current).forEach(timeout => {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
      });
      scoreDebounceRef.current = {};
    };
  }, []);

  // Keep autoCodingRef in sync with autoCoding state
  useEffect(() => {
    autoCodingRef.current = autoCoding;
  }, [autoCoding]);

  const len = attrs.length;
  const [pageInput, setPageInput] = useState(String(currentPage));

  const currentIndex = useMemo(
    () => Math.max(0, Math.min(len - 1, currentPage - 1)),
    [currentPage, len]
  );

  const currentAttr = useMemo<AttributeRow | null>(
    () => (len > 0 ? attrs[currentIndex] : null),
    [attrs, currentIndex]
  );

  const currentFeature = useMemo<Feature | null>(() => {
    return geoFeatures[currentIndex] ?? null;
  }, [geoFeatures, currentIndex]);

  const imgRef = useMemo<string | undefined>(() => {
    const fromAttr =
      (attrs?.[currentIndex] as any)?.["Image Reference"] ??
      (attrs?.[currentIndex] as any)?.["image"] ??
      (attrs?.[currentIndex] as any)?.["img"];

    const p = (currentFeature?.properties as any) || {};
    const fromFeature =
      p?.["Image Reference"] ??
      p?.["Image_Reference"] ??
      p?.["image"] ??
      p?.["img"];

    return (fromAttr ?? fromFeature) || undefined;
  }, [attrs, currentIndex, currentFeature]);

  const applyUpdatesToCurrentRow = useCallback(
    (updates: Record<string, number | string | boolean | null>) => {
      if (!updates || Object.keys(updates).length === 0) return;
      if (!currentProjectName) return;
      setProjectData(prev => {
        const projName = currentProjectName;
        return {
          ...prev,
          [projName]: {
            ...prev[projName] || defaultProjectData,
            attrs: (prev[projName]?.attrs || []).map((row, i) =>
              i === currentIndex ? { ...row, ...updates } : row
            ),
          },
        };
      });
    },
    [currentIndex, currentProjectName]
  );

  // Auto-code one segment
  useEffect(() => {
    if (!currentProjectName) return;

    const handler = async () => {
      if (autoCodingRef.current) return;

      try {
        setAutoCoding(true);
        autoCodingRef.current = true;
        setAutoCodeMsg("Starting…");
        setProgress(5);

        if (!imgRef) throw new Error("Missing imageRef");
        if (!currentFeature || currentFeature.geometry?.type !== "LineString") {
          throw new Error("Missing LineString geometry");
        }
        const line = (currentFeature.geometry as LineString).coordinates;

        setAutoCodeMsg("Running Computer Vision…");
        setProgress(35);
        const cvPromise = autocodeImage(currentProjectName, imgRef);

        setAutoCodeMsg("Running GIS rules…");
        setProgress(65);
        const gisPromise = autocodeGIS(currentProjectName, line);

        const [cv, g] = await Promise.all([cvPromise, gisPromise]);

        setAutoCodeMsg("Merging updates…");
        setProgress(85);
        const merged = { ...(cv?.updates ?? {}), ...(g?.updates ?? {}) };

        const cvChanged = cv?.changed_fields ?? [];
        const gisChanged = g?.changed_fields ?? [];
        const allChanged = [...new Set([...cvChanged, ...gisChanged])];

        const fieldSources: Record<string, string> = {};
        cvChanged.forEach(field => { fieldSources[field] = "CV"; });
        gisChanged.forEach(field => { fieldSources[field] = "GIS"; });

        updateProjectData(currentProjectName, {
          changedFieldsByRow: {
            ...changedFieldsByRow,
            [currentIndex]: allChanged
          },
          fieldSourcesByRow: {
            ...fieldSourcesByRow,
            [currentIndex]: fieldSources
          }
        });

        applyUpdatesToCurrentRow(merged);

        setProgress(95);
        if (currentProjectName && currentIndex !== undefined && attrs[currentIndex]) {
          try {
            const updatedRow = { ...attrs[currentIndex], ...merged };
            const newScore = await calculateScoreForRow(currentProjectName, updatedRow);

            updateProjectData(currentProjectName, {
              scores: scores.map((score, i) =>
                i === currentIndex ? { ...score, ...newScore } : score
              )
            });
          } catch (e: any) {
            console.warn("Failed to recalculate score after autocode:", e?.message);
          }
        }

        setProgress(100);
        setAutoCodeMsg("Done");
        toaster.create({
          title: "Auto-code (current) done",
          description: `CV + GIS updates applied. ${allChanged.length} fields changed.`,
          type: "success",
        });
      } catch (e: any) {
        toaster.create({
          title: "Auto-code failed",
          description: String(e?.message ?? e),
          type: "error",
        });
      } finally {
        if (cleanupTimeoutRef.current !== null) {
          clearTimeout(cleanupTimeoutRef.current);
        }
        cleanupTimeoutRef.current = window.setTimeout(() => {
          clearAutoCodingState();
        }, 300);
      }
    };

    window.addEventListener("psat:autocode:one", handler);
    return () => window.removeEventListener("psat:autocode:one", handler);
  }, [currentProjectName, imgRef, currentFeature, applyUpdatesToCurrentRow, currentIndex, attrs, scores, changedFieldsByRow, fieldSourcesByRow]);

  // Auto-code all segments
  useEffect(() => {
    if (!currentProjectName) return;

    const handler = async () => {
      if (autoCodingRef.current) return;
      try {
        setAutoCoding(true);
        autoCodingRef.current = true;
        setAutoCodeMsg("CV + GIS for all records…");
        setProgress(10);
        const attrLength = attrs.length;
        setProjectProgress({ [currentProjectName]: { processed: 0, total: attrLength } });

        // Process each segment one-by-one for real-time progress
        const allChangedFieldsByRow: Record<number, string[]> = {};
        const allSourcesByRow: Record<number, Record<string, string>> = {};
        let totalOk = 0;
        let totalFail = 0;
        const errors: any[] = [];

        for (let i = 0; i < attrs.length; i++) {
          try {
            const r = await autocodeAll(currentProjectName, { indices: [i], save: false });

            // Update progress after each segment
            setProjectProgress({ [currentProjectName]: { processed: i + 1, total: attrLength } });

            if ("changed_by_row" in r && r.changed_by_row) {
              Object.assign(allChangedFieldsByRow, r.changed_by_row);
            }

            if ("sources_by_row" in r && r.sources_by_row) {
              Object.assign(allSourcesByRow, r.sources_by_row);
            }

            if ("ok" in r) totalOk += r.ok || 0;
            if ("fail" in r) totalFail += r.fail || 0;
            if ("errors" in r && r.errors && r.errors.length > 0) {
              errors.push(...r.errors);
            }
          } catch (e: any) {
            totalFail++;
            errors.push({ segment: i, reason: e?.message });
          }
        }

        // After all segments processed, fetch updated attributes and recalculate scores
        setProgress(85);
        try {
          const a = await fetchProjectAttributes(currentProjectName) as AttributesResponse;
          if (a?.rows) {
            updateProjectData(currentProjectName, {
              attrs: a.rows,
              changedFieldsByRow: allChangedFieldsByRow,
              fieldSourcesByRow: allSourcesByRow,
            });

            // Recalculate scores
            const res = await fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/score`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ attributes: a.rows }),
            });

            if (res.ok) {
              const result = await res.json();
              if (result.ok && Array.isArray(result.result_rows)) {
                updateProjectData(currentProjectName, {
                  scores: result.result_rows,
                });
              }
            }
          }
        } catch (e: any) {
          console.warn("Failed to fetch updated attributes or recalculate scores:", e?.message);
        }

        setProgress(100);
        setAutoCodeMsg("Completed");

        const totalProcessed = totalOk + totalFail;
        toaster.create({
          title: "Auto-code (all) done",
          description: `Total: ${totalProcessed}, OK: ${totalOk}, Failed: ${totalFail}${totalFail > 0 ? " (check console for details)" : ""}`,
          type: totalFail > 0 ? "warning" : "success",
        });

        if (totalFail > 0 && errors.length > 0) {
          console.error("Auto-coding errors:", errors);
        }
      } catch (e: any) {
        toaster.create({
          title: "Auto-code failed",
          description: String(e?.message ?? e),
          type: "error",
        });
      } finally {
        if (cleanupTimeoutRef.current !== null) {
          clearTimeout(cleanupTimeoutRef.current);
        }
        cleanupTimeoutRef.current = window.setTimeout(() => {
          clearAutoCodingState();
        }, 300);
      }
    };

    window.addEventListener("psat:autocode:all", handler);
    return () => window.removeEventListener("psat:autocode:all", handler);
  }, [currentProjectName, attrs.length]);

  // Auto-code all segments in all loaded projects
  useEffect(() => {
    const handler = async () => {
      if (autoCodingRef.current) return;
      try {
        setAutoCoding(true);
        autoCodingRef.current = true;
        setAutoCodeMsg("CV + GIS for all segments in all projects…");
        setProgress(10);

        // Auto-code all projects sequentially
        const projectsToAutocode = projectList;
        let totalProcessed = 0;
        let totalSuccessful = 0;
        let totalFailed = 0;
        const errors: any[] = [];

        // Initialize project progress with correct totals
        const initialProgress: Record<string, { processed: number; total: number }> = {};
        projectsToAutocode.forEach(name => {
          const projDataSnapshot = projectData[name];
          let total = 0;
          if (projDataSnapshot?.attrs && Array.isArray(projDataSnapshot.attrs)) {
            total = projDataSnapshot.attrs.length;
          }
          initialProgress[name] = { processed: 0, total };
        });
        setProjectProgress(initialProgress);

        for (let i = 0; i < projectsToAutocode.length; i++) {
          const projectName = projectsToAutocode[i];
          // Get the actual attrs length for this project from the current state
          let projectAttrsLength = 0;
          const projectDataSnapshot = projectData[projectName];
          if (projectDataSnapshot?.attrs && Array.isArray(projectDataSnapshot.attrs)) {
            projectAttrsLength = projectDataSnapshot.attrs.length;
          }

          setAutoCodeMsg(`Auto-coding project ${i + 1}/${projectsToAutocode.length}: ${projectName}…`);
          setProgress(10 + (i / projectsToAutocode.length) * 80);

          // Mark project as started with correct total
          setProjectProgress(prev => ({
            ...prev,
            [projectName]: { processed: 0, total: projectAttrsLength }
          }));

          try {
            const projectChangedFieldsByRow: Record<number, string[]> = {};
            const projectSourcesByRow: Record<number, Record<string, string>> = {};
            let projectOk = 0;
            let projectFail = 0;

            // Process each segment one-by-one for real-time progress
            for (let segmentIdx = 0; segmentIdx < projectAttrsLength; segmentIdx++) {
              try {
                const r = await autocodeAll(projectName, { indices: [segmentIdx], save: false });

                // Update progress after each segment
                setProjectProgress(prev => ({
                  ...prev,
                  [projectName]: { processed: segmentIdx + 1, total: projectAttrsLength }
                }));

                if ("changed_by_row" in r && r.changed_by_row) {
                  Object.assign(projectChangedFieldsByRow, r.changed_by_row);
                }

                if ("sources_by_row" in r && r.sources_by_row) {
                  Object.assign(projectSourcesByRow, r.sources_by_row);
                }

                if ("ok" in r) projectOk += r.ok || 0;
                if ("fail" in r) projectFail += r.fail || 0;
                if ("errors" in r && r.errors && r.errors.length > 0) {
                  errors.push(...r.errors);
                }
              } catch (e: any) {
                projectFail++;
                errors.push({ projectName, segment: segmentIdx, reason: e?.message });
              }
            }

            // After all segments of this project are processed, fetch updated attributes
            try {
              const a = await fetchProjectAttributes(projectName) as AttributesResponse;
              if (a?.rows) {
                updateProjectData(projectName, {
                  attrs: a.rows,
                  changedFieldsByRow: projectChangedFieldsByRow,
                  fieldSourcesByRow: projectSourcesByRow,
                });

                // Recalculate scores
                const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/score`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ attributes: a.rows }),
                });

                if (res.ok) {
                  const result = await res.json();
                  if (result.ok && Array.isArray(result.result_rows)) {
                    updateProjectData(projectName, {
                      scores: result.result_rows,
                    });
                  }
                }
              }
            } catch (e: any) {
              console.warn("Failed to fetch updated attributes or recalculate scores for project", projectName, e?.message);
            }

            totalProcessed += projectAttrsLength;
            totalSuccessful += projectOk;
            totalFailed += projectFail;
          } catch (e: any) {
            console.error("Failed to autocode project", projectName, e?.message);
            totalFailed += projectAttrsLength;
            errors.push({ projectName, reason: e?.message });
          }
        }

        setProgress(95);

        // Notify map of score updates
        window.dispatchEvent(new CustomEvent("psat:scores:updated"));

        setProgress(100);
        setAutoCodeMsg("Completed");

        // Show summary
        if (totalProcessed > 0) {
          toaster.create({
            title: "Auto-code (all projects) done",
            description: `Total: ${totalProcessed}, OK: ${totalSuccessful}, Failed: ${totalFailed}${totalFailed > 0 ? " (check console for details)" : ""}`,
            type: totalFailed > 0 ? "warning" : "success",
          });
        }
      } catch (e: any) {
        toaster.create({
          title: "Auto-code failed",
          description: String(e?.message ?? e),
          type: "error",
        });
      } finally {
        if (cleanupTimeoutRef.current !== null) {
          clearTimeout(cleanupTimeoutRef.current);
        }
        cleanupTimeoutRef.current = window.setTimeout(() => {
          clearAutoCodingState();
        }, 300);
      }
    };

    window.addEventListener("psat:autocode:all-projects", handler);
    return () => window.removeEventListener("psat:autocode:all-projects", handler);
  }, [projectList, projectData]);

  // Load project data
  useEffect(() => {
    if (!currentProjectName) return;

    // If already loaded, don't reload
    if (projectData[currentProjectName] && !projectData[currentProjectName].loading) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        updateProjectData(currentProjectName, { loading: true, error: null });

        const [d, a, gjson, metadata] = await Promise.all([
          fetchProjectDetail(currentProjectName),
          fetchProjectAttributes(currentProjectName) as Promise<AttributesResponse>,
          fetchProjectGeoJSON(currentProjectName) as Promise<FeatureCollection>,
          fetchProjectMetadata(currentProjectName).catch(() => null),
        ]);

        if (cancelled) return;

        const attributes = a?.rows ?? [];

        // Store original autocode values in sessionStorage for validation tracking
        try {
          sessionStorage.setItem(`autocode_original_${currentProjectName}`, JSON.stringify(attributes));
        } catch {
          console.warn("Failed to store original autocode values");
        }

        updateProjectData(currentProjectName, {
          detail: d ?? null,
          attrs: attributes,
          geoFeatures: gjson?.features ?? [],
          currentPage: 1,
          editedRow: null,
          verified: metadata?.verified ?? false,
          loading: false,
        });
      } catch (e: any) {
        if (!cancelled) {
          updateProjectData(currentProjectName, {
            error: e?.message ?? "Unknown error",
            loading: false,
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [currentProjectName]);

  // Get original autocode values for current row
  const originalCurrentAttr = useMemo<AttributeRow | null>(() => {
    if (!currentProjectName || currentIndex < 0) return null;
    try {
      const stored = sessionStorage.getItem(`autocode_original_${currentProjectName}`);
      if (stored) {
        const originals = JSON.parse(stored) as AttributeRow[];
        if (Array.isArray(originals) && currentIndex < originals.length) {
          const original = originals[currentIndex];
          console.log(`[DEBUG] Retrieved original for row ${currentIndex}:`, original);
          return original || null;
        } else {
          console.warn(`[DEBUG] Array validation failed. Array.isArray=${Array.isArray(originals)}, length=${originals?.length}, currentIndex=${currentIndex}`);
        }
      } else {
        console.warn(`[DEBUG] No stored original values found for key: autocode_original_${currentProjectName}`);
      }
    } catch (e) {
      console.warn("Failed to retrieve original autocode values:", e);
    }
    return null;
  }, [currentProjectName, currentIndex]);

  // Auto-calculate scores on project load
  useEffect(() => {
    if (!currentProjectName || attrs.length === 0) return;

    let isMounted = true;

    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/results`);
        if (!res.ok) {
          throw new Error("Failed to fetch results");
        }

        const data = await res.json();

        if (!data.ok || !Array.isArray(data.result_rows) || data.result_rows.length === 0) {
          let loadingToastId: string | undefined;

          if (isMounted) {
            console.log("No scores found, auto-calculating scores for all segments...");
            loadingToastId = toaster.create({
              description: "Auto-calculating scores for all segments...",
              type: "loading",
            });
          }

          const result = await calculateScore(currentProjectName);

          if (isMounted && result.ok && Array.isArray(result.result_rows)) {
            if (loadingToastId) {
              toaster.dismiss(loadingToastId);
            }

            updateProjectData(currentProjectName, {
              scores: result.result_rows as any,
            });
            console.log("Scores auto-calculated:", result.result_rows.length, "segments");
            toaster.create({
              title: "Scores calculated",
              description: `Auto-calculated scores for ${result.result_rows.length} segments`,
              type: "success",
            });

            window.dispatchEvent(new CustomEvent("psat:scores:updated"));
          } else if (isMounted && loadingToastId) {
            toaster.dismiss(loadingToastId);
          }
        } else if (isMounted) {
          updateProjectData(currentProjectName, {
            scores: data.result_rows as any,
          });
          console.log("Scores loaded:", data.result_rows.length, "segments");
        }
      } catch (e: any) {
        if (isMounted) {
          console.warn("Failed to auto-calculate scores:", e?.message);
        }
      }
    })();

    return () => { isMounted = false; };
  }, [currentProjectName, attrs.length]);

  // Fetch attribute mappings (global, not per-project)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const map = await fetchAttributeMappings();
        if (!cancelled) setAttrMappings(map);
      } catch {
        if (!cancelled) setAttrMappings({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save handler
  useEffect(() => {
    function handleSave() {
      if (!currentProjectName || !attrs) return;
      saveAttributes(currentProjectName, attrs)
        .then(() => toaster.create({ title: "Saved", description: "Changes saved successfully.", type: "success" }))
        .catch((e) => toaster.create({ title: "Save failed", description: String(e?.message ?? e), type: "error" }));
    }

    window.addEventListener("psat:save", handleSave);
    return () => window.removeEventListener("psat:save", handleSave);
  }, [currentProjectName, attrs]);

  // Update edited row when current row changes
  useEffect(() => {
    if (!currentProjectName) return;
    updateProjectData(currentProjectName, {
      editedRow: currentAttr ? { ...currentAttr } : null,
    });
  }, [currentAttr, currentProjectName]);

  // Handlers for attribute editing
  const onAttrChange = useCallback(
    (key: string, value: string | number | boolean | null) => {
      if (!currentProjectName) return;
      updateProjectData(currentProjectName, {
        editedRow: editedRow ? { ...editedRow, [key]: value } : null,
      });
    },
    [editedRow, currentProjectName]
  );

  const editCurrentAttr = (field: string, value: string | number | boolean | null) => {
    if (!currentProjectName || !attrs || !attrs[currentIndex]) return;

    const updatedRow = { ...attrs[currentIndex], [field]: value };

    updateProjectData(currentProjectName, {
      attrs: attrs.map((row, i) =>
        i === currentIndex ? updatedRow : row
      ),
    });

    // Dispatch event to notify validation component of attribute change
    console.log(`[DEBUG editCurrentAttr] Dispatching event: field=${field}, value=${value}, rowIndex=${currentIndex}`);
    window.dispatchEvent(new CustomEvent("psat:attribute:changed", {
      detail: { projectName: currentProjectName, rowIndex: currentIndex, field, value }
    }));

    const currentIdx = currentIndex;

    if (scoreDebounceRef.current[currentIdx] !== undefined) {
      clearTimeout(scoreDebounceRef.current[currentIdx]);
    }

    scoreDebounceRef.current[currentIdx] = window.setTimeout(async () => {
      if (!currentProjectName) return;

      try {
        console.log("Calling calculateScoreForRow with updated row:", updatedRow);

        const newScore = await calculateScoreForRow(currentProjectName, updatedRow);

        console.log("Received scores from API:", newScore);

        updateProjectData(currentProjectName, {
          scores: scores.map((score, i) =>
            i === currentIdx
              ? { ...score, ...newScore }
              : score
          ),
        });

        window.dispatchEvent(new CustomEvent("psat:scores:updated"));
      } catch (e: any) {
        console.warn("Failed to recalculate score:", e?.message);
      }
    }, 500);
  };

  // Pagination
  const gotoPage = useCallback((page: number) => {
    if (len === 0 || !currentProjectName) return;
    const clamped = Math.min(Math.max(1, page), len);
    updateProjectData(currentProjectName, { currentPage: clamped });
  }, [len, currentProjectName]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const commitPage = useCallback(
    (valStr: string) => {
      const raw = Number(valStr);
      if (!Number.isFinite(raw)) return;
      const clamped = Math.min(Math.max(1, len || 1), raw);
      gotoPage(clamped);
    },
    [gotoPage, len]
  );

  useEffect(() => {
    const t = setTimeout(() => commitPage(pageInput), 300);
    return () => clearTimeout(t);
  }, [pageInput, commitPage]);

  if (projectList.length === 0) {
    return <Box p="4"><Text color="red.500">No projects selected.</Text></Box>;
  }

  if (loading) {
    return (
      <Flex align="center" justify="center" h="60vh">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Box p="4">
        <Text color="red.500">Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box p="4">
      {autoCoding && (
        <Portal>
          <Box
            position="fixed"
            inset={0}
            bg="blackAlpha.400"
            backdropFilter="blur(2px)"
            zIndex={1000}
            aria-busy="true"
          >
            <Progress.Root
              value={progress}
              min={0}
              max={100}
              orientation="horizontal"
              colorPalette="blue"
              variant="subtle"
              size="sm"
              position="absolute"
              top={0}
              left={0}
              right={0}
              zIndex={1001}
            >
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>

            <Flex minH="100vh" align="center" justify="center" p="4">
              <Card.Root shadow="lg" borderRadius="2xl" maxW="md" w="full">
                <CardBody>
                  <Flex direction="column" gap="4">
                    <Flex align="center" gap="3">
                      <Spinner />
                      <Box>
                        <Text fontWeight="bold">Auto-coding…</Text>
                        <Text fontSize="sm" color="gray.600">
                          {autoCodeMsg || "Please wait while models run."}
                        </Text>
                      </Box>
                    </Flex>

                    {Object.entries(projectProgress).length > 0 && (
                      <Flex direction="column" gap="3">
                        {Object.entries(projectProgress).map(([projectName, { processed, total }]) => (
                          <Box key={projectName}>
                            <Flex justify="space-between" mb="2" align="center">
                              <Text fontSize="sm" fontWeight="medium">{projectName}</Text>
                              <Text fontSize="xs" color="gray.600">{processed}/{total}</Text>
                            </Flex>
                            <Progress.Root
                              value={total > 0 ? (processed / total) * 100 : 0}
                              min={0}
                              max={100}
                              colorPalette="blue"
                              size="sm"
                            >
                              <Progress.Track>
                                <Progress.Range />
                              </Progress.Track>
                            </Progress.Root>
                          </Box>
                        ))}
                      </Flex>
                    )}
                  </Flex>
                </CardBody>
              </Card.Root>
            </Flex>
          </Box>
        </Portal>
      )}

      {projectList.length > 1 && (
        <Flex gap="2" mb="4" wrap="wrap">
          {projectList.map((projectName, index) => {
            const projData = projectData[projectName];
            const projSegmentCount = projData?.attrs.length ?? 0;
            const isActive = activeTabIndex === index;
            return (
              <Button
                key={projectName}
                onClick={() => setActiveTabIndex(index)}
                variant={isActive ? "solid" : "outline"}
                colorPalette={isActive ? "blue" : "gray"}
                size="md"
              >
                {projectName} ({projSegmentCount})
              </Button>
            );
          })}
        </Flex>
      )}

      <Flex justify="space-between" align="center" mb="3">
        <Flex align="center" gap="3">
          <span style={{ fontSize: "20px" }}>
            {currentData.verified ? "✅" : "⏳"}
          </span>
          <Box>
            <Text fontSize="lg" fontWeight="bold">{detail?.name ?? currentProjectName}</Text>
            {detail?.latest && (
              <Text fontSize="sm" color="gray.600">Latest version: {detail.latest}</Text>
            )}
          </Box>
          <Button
            onClick={() => toggleVerified(currentProjectName!, currentData.verified ?? false)}
            size="sm"
            variant={currentData.verified ? "outline" : "solid"}
            colorPalette={currentData.verified ? "green" : "blue"}
            css={
              currentData.verified
                ? {
                    transition: "all 0.2s ease-in-out",
                    "&:hover": {
                      backgroundColor: "#ef4444 !important",
                      color: "white !important",
                      borderColor: "#ef4444 !important",
                    },
                  }
                : {
                    transition: "all 0.2s ease-in-out",
                    "&:hover": {
                      backgroundColor: "#22c55e !important",
                      color: "white !important",
                      borderColor: "#22c55e !important",
                    },
                  }
            }
            onMouseEnter={(e) => {
              if (currentData.verified) {
                e.currentTarget.textContent = "Set To Pending";
              }
            }}
            onMouseLeave={(e) => {
              if (currentData.verified) {
                e.currentTarget.textContent = "Verified";
              }
            }}
          >
            {currentData.verified ? "Verified" : "Mark As Verified"}
          </Button>
        </Flex>

        <Flex align="center" gap="3">
          <Text fontSize="sm" color="gray.600">
            {len > 0 ? `${currentPage} / ${len}` : "0 / 0"}
          </Text>

          <NumberInput.Root
            maxW="120px"
            min={1}
            max={len || 1}
            defaultValue={String(currentPage)}
            value={pageInput}
            onValueChange={(e) => setPageInput(e.value)}
          >
            <NumberInput.Control />
            <NumberInput.Input
              onBlur={() => commitPage(pageInput)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.currentTarget.blur();
                }
              }}
            />
          </NumberInput.Root>
        </Flex>
      </Flex>

      <Grid
        templateColumns={{ base: "1fr", md: "1fr 1fr" }}
        gap="16px"
      >
        <GridItem>
          <ImagePanel
            projectName={currentProjectName!}
            imageRef={imgRef}
            panelHeight={PANEL_HEIGHT}
          />
        </GridItem>

        <GridItem
          display="flex"
          flexDirection="column"
          minH={`${PANEL_HEIGHT}px`}
        >
          <Box flex="1 1 auto" minH={0}>
            <AttributesPanel
              row={editedRow}
              originalRow={originalCurrentAttr}
              mappings={attrMappings}
              panelHeight={PANEL_HEIGHT - CONTROLS_H}
              onChange={onAttrChange}
              onEdit={editCurrentAttr}
              changedFields={changedFieldsByRow[currentIndex] || []}
              fieldSources={fieldSourcesByRow[currentIndex] || {}}
            />
          </Box>

          <Flex
            flex="0 0 auto"
            h={`${CONTROLS_H}px`}
            w="100%"
            minW={0}
            align="center"
            gap="4"
            pt="2"
            position="relative"
            zIndex={1}
            bg="bg"
          >
            <Button
              flex="1"
              minW={0}
              size="sm"
              variant="outline"
              onClick={() => gotoPage(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>

            <Button
              flex="1"
              minW={0}
              size="sm"
              variant="solid"
              onClick={() => gotoPage(currentPage + 1)}
              disabled={currentPage >= len}
            >
              Next
            </Button>
          </Flex>
        </GridItem>

        <GridItem colSpan={{ base: 1, md: 2 }}>
          <GeoDataPanel
            projectName={currentProjectName!}
            feature={
              geoFeatures[currentIndex]?.geometry?.type === "LineString"
                ? (geoFeatures[currentIndex] as any)
                : null
            }
            index={currentIndex}
            onJump={(i) => gotoPage(i + 1)}
            scores={scores}
          />
        </GridItem>

        {currentFeature?.geometry?.type === "LineString" && (
          <GridItem colSpan={{ base: 1, md: 2 }}>
            <WidthVisualizationPanel
              projectName={currentProjectName!}
              coordinates={(currentFeature.geometry as LineString).coordinates as [number, number][]}
              segmentIndex={currentIndex}
            />
          </GridItem>
        )}

        {currentFeature?.geometry?.type === "LineString" && (
          <GridItem colSpan={{ base: 1, md: 2 }}>
            <CurvatureVisualizationPanel
              projectName={currentProjectName!}
              coordinates={(currentFeature.geometry as LineString).coordinates as [number, number][]}
              segmentIndex={currentIndex}
            />
          </GridItem>
        )}

        <GridItem colSpan={{ base: 1, md: 2 }}>
          <AutocodeValidation
            projectName={currentProjectName!}
            attributes={attrs}
            panelHeight={350}
          />
        </GridItem>

        <GridItem colSpan={{ base: 1, md: 2 }}>
          <Box
            bg="white"
            borderRadius="md"
            p="6"
            borderWidth="1px"
            borderColor="gray.200"
            _dark={{ bg: "gray.800", borderColor: "gray.600" }}
          >
            <SegmentScoresCard
              scores={scores[currentIndex] || null}
            />
          </Box>
        </GridItem>
      </Grid>
    </Box>
  );
}
