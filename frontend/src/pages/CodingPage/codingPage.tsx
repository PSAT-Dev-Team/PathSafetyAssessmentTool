import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
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
  CardBody,
} from "@chakra-ui/react";

import type { Feature, FeatureCollection, LineString } from "geojson";
import { toaster } from "../../components/ui/toaster";
import ExitConfirmationDialog from "../sidebar/components/ExitConfirmationDialog";


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
import { AnalysisPanel } from "../../components/visualization/AnalysisPanel";
import "../../components/visualization/AnalysisPanel.css";
import SegmentScoresCard from "../../components/visualization/scoreband/SegmentScoresCard";
import AutocodeValidation from "../PathAnalysisPage/components/AutocodeValidation";


type ProjectDetail = { name: string; versions: string[]; latest: string };
type AttributesResponse = { rows: AttributeRow[] };
type AttrMappings = Record<string, Record<string, string>>;

const PANEL_HEIGHT = 550;

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
  verifiedSegmentCount?: number;
  autocodedSegmentCount?: number;
  isDirty?: boolean;
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
  isDirty: false,
};

// Global cache for project data to prevent reloading when navigating away and back (e.g. to Help page)
const projectDataCache: Record<string, ProjectDataState> = {};

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

  // Current active tab (project name or "coding-guide")
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (projectNames) {
      try {
        const names = projectNames.split(',').map(name => {
          try {
            return decodeURIComponent(name);
          } catch {
            return name;
          }
        });
        return names[0] ?? "coding-guide";
      } catch {
        return "coding-guide";
      }
    }
    return "coding-guide";
  });
  const currentProjectName = activeTab === "coding-guide" ? null : activeTab;
  const isShowingCodingGuide = activeTab === "coding-guide";

  // State for each project: keyed by project name
  const [projectData, setProjectData] = useState<Record<string, ProjectDataState>>(projectDataCache);

  // Global state
  const [autoCoding, setAutoCoding] = useState(false);
  const [autoCodeMsg, setAutoCodeMsg] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [projectProgress, setProjectProgress] = useState<Record<string, { processed: number; total: number }>>({});
  const [attrMappings, setAttrMappings] = useState<AttrMappings>({});

  // Image preloading state
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [imageLoadingProgress, setImageLoadingProgress] = useState(0);


  // Refs for cleanup
  const cleanupTimeoutRef = useRef<number | null>(null);
  const scoreDebounceRef = useRef<Record<number, number>>({});
  const autoCodingRef = useRef(false);

  // Handle query params for deep linking (e.g. ?segment=5)
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialSegment = queryParams.get("segment");
  const hasInitializedSegmentRef = useRef(false);

  // Save confirmation dialog state
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!initialSegment || !currentProjectName || hasInitializedSegmentRef.current) return;

    const segmentIdx = parseInt(initialSegment, 10);
    if (!isNaN(segmentIdx) && segmentIdx > 0) {
      // We can only set the page if we know the total length, or at least we trust the input.
      // The actual clamping happens in updateProjectData or valid rendering,
      // but here we just blindly set the currentPage if it seems valid.
      // We'll trust the component to clamp it if it's out of bounds once data is loaded.
      updateProjectData(currentProjectName, { currentPage: segmentIdx });
      hasInitializedSegmentRef.current = true;
    }
  }, [initialSegment, currentProjectName]);

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
    setProjectData(prev => {
      const newState = {
        ...prev,
        [projectName]: {
          ...prev[projectName] || defaultProjectData,
          ...updates,
        },
      };
      projectDataCache[projectName] = newState[projectName];
      return newState;
    });
  };

  const refreshCurrentProject = useCallback(async () => {
    if (!currentProjectName) return;

    updateProjectData(currentProjectName, { loading: true, error: null });

    try {
      const [d, a, gjson, metadata, autoMeta] = await Promise.all([
        fetchProjectDetail(currentProjectName),
        fetchProjectAttributes(currentProjectName) as Promise<AttributesResponse>,
        fetchProjectGeoJSON(currentProjectName) as Promise<FeatureCollection>,
        fetchProjectMetadata(currentProjectName).catch(() => null),
        fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/autocode-metadata`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const attributes = a?.rows ?? [];

      updateProjectData(currentProjectName, {
        detail: d ?? null,
        attrs: attributes,
        geoFeatures: gjson?.features ?? [],
        editedRow: null,
        verified: metadata?.verified ?? false,
        verifiedSegmentCount: metadata?.verified_segment_count ?? 0,
        autocodedSegmentCount: metadata?.autocoded_segment_count ?? 0,
        changedFieldsByRow: autoMeta?.changedFieldsByRow || {},
        fieldSourcesByRow: autoMeta?.fieldSourcesByRow || {},
        loading: false,
        isDirty: false,
      });

    } catch (e: any) {
      updateProjectData(currentProjectName, {
        error: e?.message ?? "Unknown error",
        loading: false,
      });
    }
  }, [currentProjectName]);


  // Update verified segment count for a project
  const updateVerifiedSegmentCount = async (projectName: string | null, count: number) => {
    if (!projectName) return;
    try {
      const totalSegments = projectData[projectName]?.attrs?.length ?? 0;
      // Clamp the count to be between 0 and total segments
      const clampedCount = Math.max(0, Math.min(count, totalSegments));

      await updateProject(projectName, { verified_segment_count: clampedCount });
      updateProjectData(projectName, { verifiedSegmentCount: clampedCount });
      // Notify other pages of the change with segment count
      window.dispatchEvent(new CustomEvent("psat:verified:updated", {
        detail: { projectName, verifiedSegmentCount: clampedCount }
      }));
    } catch (e: any) {
      toaster.create({
        title: "Failed to update",
        description: e?.message ?? "Failed to update verified segment count",
        type: "error",
      });
    }
  };

  // Update autocoded segment count for a project
  const updateAutocodedSegmentCount = async (projectName: string | null, count: number) => {
    if (!projectName) return;
    try {
      const totalSegments = projectData[projectName]?.attrs?.length ?? 0;
      // Clamp the count to be between 0 and total segments
      const clampedCount = Math.max(0, Math.min(count, totalSegments));

      await updateProject(projectName, { autocoded_segment_count: clampedCount });
      updateProjectData(projectName, { autocodedSegmentCount: clampedCount });
      // Notify other pages of the change with segment count
      window.dispatchEvent(new CustomEvent("psat:autocoded:updated", {
        detail: { projectName, autocodedSegmentCount: clampedCount }
      }));
    } catch (e: any) {
      toaster.create({
        title: "Failed to update",
        description: e?.message ?? "Failed to update autocoded segment count",
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
  const [segmentInput, setSegmentInput] = useState(String(currentData.verifiedSegmentCount ?? 0));
  const [autocodedSegmentInput, setAutocodedSegmentInput] = useState(String(currentData.autocodedSegmentCount ?? 0));

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

  // Preload next images to improve user experience
  useEffect(() => {
    if (!currentProjectName || !attrs.length) return;

    const PRELOAD_COUNT = 5;
    const indicesToPreload = [];
    for (let i = 1; i <= PRELOAD_COUNT; i++) {
      if (currentIndex + i < attrs.length) {
        indicesToPreload.push(currentIndex + i);
      }
    }

    indicesToPreload.forEach(idx => {
      const row = attrs[idx];
      const feat = geoFeatures[idx] ?? null;

      const fromAttr =
        (row as any)?.["Image Reference"] ??
        (row as any)?.["image"] ??
        (row as any)?.["img"];

      const p = (feat?.properties as any) || {};
      const fromFeature =
        p?.["Image Reference"] ??
        p?.["Image_Reference"] ??
        p?.["image"] ??
        p?.["img"];

      const nextImgRef = (fromAttr ?? fromFeature) || undefined;

      if (nextImgRef) {
        const url = `/api/projects/${encodeURIComponent(currentProjectName)}/images/${encodeURIComponent(nextImgRef)}`;
        const img = new Image();
        img.src = url;
      }
    });
  }, [currentIndex, currentProjectName, attrs, geoFeatures]);

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
            isDirty: true,
            attrs: (prev[projName]?.attrs || []).map((row, i) =>
              i === currentIndex ? { ...row, ...updates } : row
            ),
          },
        };
      });
    },
    [currentIndex, currentProjectName]
  );

  // Normalize attribute values to consistent types (convert numeric strings to numbers)
  const normalizeAttributeValues = (attrs: AttributeRow[]): AttributeRow[] => {
    return attrs.map(row => {
      const normalized: AttributeRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined) {
          normalized[key] = value;
        } else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
          // Convert numeric strings to numbers
          normalized[key] = Number(value);
        } else {
          normalized[key] = value;
        }
      }
      return normalized;
    });
  };

  // Update the autocode baseline after autocode runs
  const updateAutocodeBaseline = useCallback(
    (updatedAttrs: AttributeRow[]) => {
      if (!currentProjectName) return;
      try {
        const normalized = normalizeAttributeValues(updatedAttrs);
        // Save updated baseline to server
        fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/baseline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: normalized })
        }).then(() => {
          // Dispatch event to notify AutocodeValidation to refetch baseline
          window.dispatchEvent(new CustomEvent("psat:baseline:updated", {
            detail: { projectName: currentProjectName }
          }));
        });
      } catch (e) {
      }
    },
    [currentProjectName]
  );

  // Helper to save autocode metadata
  const saveAutocodeMetadata = useCallback((projName: string, changedFields: any, fieldSources: any) => {
    fetch(`/api/projects/${encodeURIComponent(projName)}/autocode-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changedFieldsByRow: changedFields, fieldSourcesByRow: fieldSources })
    }).catch(e => console.error("Failed to save autocode metadata", e));
  }, []);

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

        // Save metadata immediately
        saveAutocodeMetadata(currentProjectName, {
          ...changedFieldsByRow,
          [currentIndex]: allChanged
        }, {
          ...fieldSourcesByRow,
          [currentIndex]: fieldSources
        });

        applyUpdatesToCurrentRow(merged);

        // Update autocode baseline with new values
        const updatedAttrs = attrs.map((row, i) =>
          i === currentIndex ? { ...row, ...merged } : row
        );
        updateAutocodeBaseline(updatedAttrs);

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
  }, [currentProjectName, imgRef, currentFeature, applyUpdatesToCurrentRow, updateAutocodeBaseline, currentIndex, attrs, scores, changedFieldsByRow, fieldSourcesByRow]);

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
              isDirty: true,
            });

            // Save metadata
            saveAutocodeMetadata(currentProjectName, allChangedFieldsByRow, allSourcesByRow);

            // Update autocode baseline with new values from all segments
            updateAutocodeBaseline(a.rows);

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
        }

        setProgress(100);
        setAutoCodeMsg("Completed");

        // Update autocoded segment count to total segments when autocode all completes
        if (totalOk > 0 && totalFail === 0) {
          // Only set to 100% if all segments were successfully autocoded
          const totalSegments = attrs.length;
          updateAutocodedSegmentCount(currentProjectName, totalSegments);
        }

        const totalProcessed = totalOk + totalFail;
        toaster.create({
          title: "Auto-code (all) done",
          description: `Total: ${totalProcessed}, OK: ${totalOk}, Failed: ${totalFail}${totalFail > 0 ? " (check console for details)" : ""}`,
          type: totalFail > 0 ? "warning" : "success",
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

    window.addEventListener("psat:autocode:all", handler);
    return () => window.removeEventListener("psat:autocode:all", handler);
  }, [currentProjectName, attrs.length, updateAutocodeBaseline, updateAutocodedSegmentCount]);

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
                  isDirty: true,
                });

                // Save metadata
                saveAutocodeMetadata(projectName, projectChangedFieldsByRow, projectSourcesByRow);


                // Update autocode baseline for this project
                try {
                  fetch(`/api/projects/${encodeURIComponent(projectName)}/baseline`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rows: a.rows })
                  });
                } catch (e) {
                }

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
            }

            // Update autocoded segment count for this project if autocode was successful
            if (projectOk > 0 && projectFail === 0) {
              updateAutocodedSegmentCount(projectName, projectAttrsLength);
            }

            totalProcessed += projectAttrsLength;
            totalSuccessful += projectOk;
            totalFailed += projectFail;
          } catch (e: any) {
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
  }, [projectList, projectData, updateAutocodedSegmentCount]);

  // Load project data
  useEffect(() => {
    if (!currentProjectName) return;

    // If already loaded, don't reload
    if (projectData[currentProjectName] && !projectData[currentProjectName].loading) {
      setImagesLoaded(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        updateProjectData(currentProjectName, { loading: true, error: null });

        const [d, a, gjson, metadata, autoMeta] = await Promise.all([
          fetchProjectDetail(currentProjectName),
          fetchProjectAttributes(currentProjectName) as Promise<AttributesResponse>,
          fetchProjectGeoJSON(currentProjectName) as Promise<FeatureCollection>,
          fetchProjectMetadata(currentProjectName).catch(() => null),
          fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/autocode-metadata`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        if (cancelled) return;


        const attributes = a?.rows ?? [];

        // Store original autocode values (baseline) for validation tracking
        // This is version 0 of the baseline - created when project is first loaded
        // IMPORTANT: Only create baseline if it doesn't exist - don't overwrite on subsequent loads
        try {
          const res = await fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/baseline`);
          const baselineData = await res.json();
          const baselineExists = baselineData?.rows && baselineData.rows.length > 0;

          // Only save baseline if it doesn't already exist
          if (!baselineExists) {
            const normalized = attributes.map(row => {
              const normalizedRow: AttributeRow = {};
              for (const [key, value] of Object.entries(row)) {
                if (value === null || value === undefined) {
                  normalizedRow[key] = value;
                } else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
                  normalizedRow[key] = Number(value);
                } else {
                  normalizedRow[key] = value;
                }
              }
              return normalizedRow;
            });

            // Save baseline to server (version 0 - default values) only on first load
            fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/baseline`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rows: normalized })
            });
          }
        } catch {
        }

        // Start image preloading
        const uniqueRefs = new Set<string>();
        attributes.forEach(row => {
          const r = row as any;
          const ref = r["Image Reference"] ?? r["image"] ?? r["img"];
          if (ref) uniqueRefs.add(ref);
        });

        // Also check geoFeatures for image refs if not in attributes
        const features = gjson?.features || [];
        features.forEach((f: any) => {
          const p = f.properties || {};
          const ref = p["Image Reference"] ?? p["Image_Reference"] ?? p["image"] ?? p["img"];
          if (ref) uniqueRefs.add(ref);
        });

        const refList = Array.from(uniqueRefs);

        if (refList.length === 0) {
          setImagesLoaded(true);
        } else {
          let loadedCount = 0;
          // Cap concurrent requests if needed, but browser handles queueing.
          // Loop and fetch
          refList.forEach(ref => {
            const img = new Image();
            img.src = `/api/projects/${encodeURIComponent(currentProjectName)}/images/${encodeURIComponent(ref)}`;

            const onFinish = () => {
              loadedCount++;
              const pct = Math.round((loadedCount / refList.length) * 100);
              setImageLoadingProgress(pct);
              if (loadedCount >= refList.length) {
                setImagesLoaded(true);
              }
            };

            img.onload = onFinish;
            img.onerror = onFinish; // Don't block on error
          });
        }

        updateProjectData(currentProjectName, {
          detail: d ?? null,
          attrs: attributes,
          geoFeatures: gjson?.features ?? [],
          editedRow: null,
          verified: metadata?.verified ?? false,
          verifiedSegmentCount: metadata?.verified_segment_count ?? 0,
          autocodedSegmentCount: metadata?.autocoded_segment_count ?? 0,
          changedFieldsByRow: autoMeta?.changedFieldsByRow || {},
          fieldSourcesByRow: autoMeta?.fieldSourcesByRow || {},
          loading: false,
          isDirty: false,
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

  // Store baseline rows fetched from server
  const [baselineRows, setBaselineRows] = useState<AttributeRow[]>([]);

  // Fetch baseline from server when project changes
  useEffect(() => {
    if (!currentProjectName) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/baseline`);
        if (!res.ok) {
          setBaselineRows([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setBaselineRows(data.rows || []);
        }
      } catch (e) {
        setBaselineRows([]);
      }
    })();

    return () => { cancelled = true; };
  }, [currentProjectName]);

  // Listen for baseline updates from autocode operations and refetch
  useEffect(() => {
    const handleBaselineUpdate = async () => {
      if (!currentProjectName) return;

      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(currentProjectName)}/baseline`);
        if (!res.ok) {
          setBaselineRows([]);
          return;
        }
        const data = await res.json();
        setBaselineRows(data.rows || []);
      } catch (e) {
      }
    };

    window.addEventListener("psat:baseline:updated", handleBaselineUpdate);
    return () => {
      window.removeEventListener("psat:baseline:updated", handleBaselineUpdate);
    };
  }, [currentProjectName]);

  // Get original autocode values for current row
  const originalCurrentAttr = useMemo<AttributeRow | null>(() => {
    if (currentIndex < 0 || currentIndex >= baselineRows.length) return null;
    return baselineRows[currentIndex] || null;
  }, [currentIndex, baselineRows]);

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
        }
      } catch (e: any) {
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
        // Ensure "Line of Sight" always has a dropdown even if the backend hasn't been restarted
        if (!map["Line of Sight"]) {
          map["Line of Sight"] = { "1": "Adequate", "2": "Inadequate" };
        }
        if (!cancelled) setAttrMappings(map);
      } catch {
        if (!cancelled) setAttrMappings({ "Line of Sight": { "1": "Adequate", "2": "Inadequate" } });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reusable save function
  const saveAllProjects = useCallback(async (): Promise<boolean> => {
    if (projectList.length === 0) return true;

    try {
      // Only save projects that actually have unsaved changes
      const dirtyProjects = projectList.filter(projName => projectData[projName]?.isDirty);

      if (dirtyProjects.length > 0) {
        const savePromises = dirtyProjects.map(projName => {
          const projData = projectData[projName];
          if (!projData?.attrs) return Promise.resolve();

          return Promise.all([
            saveAttributes(projName, projData.attrs),
            updateProject(projName, {
              autocoded_segment_count: projData.autocodedSegmentCount ?? 0,
              verified_segment_count: projData.verifiedSegmentCount ?? 0
            })
          ]);
        });

        await Promise.all(savePromises);

        // Mark saved projects as clean
        dirtyProjects.forEach(projName => {
          updateProjectData(projName, { isDirty: false });
        });

        // Re-fetch scores for saved projects to reflect backend updates
        for (const projName of dirtyProjects) {
          try {
            const res = await fetch(`/api/projects/${encodeURIComponent(projName)}/results`);
            if (res.ok) {
              const result = await res.json();
              if (result.ok && result.result_rows) {
                updateProjectData(projName, { scores: result.result_rows });
              }
            }
          } catch (e) {
            // Ignore fetch error, user just won't see updated scores immediately
          }
        }
      }

      // Dispatch events to update Projects page for all projects (counts may have changed)
      projectList.forEach(projName => {
        const projData = projectData[projName];
        if (projData) {
          window.dispatchEvent(new CustomEvent("psat:verified:updated", {
            detail: { projectName: projName, verifiedSegmentCount: projData.verifiedSegmentCount ?? 0 }
          }));
          window.dispatchEvent(new CustomEvent("psat:autocoded:updated", {
            detail: { projectName: projName, autocodedSegmentCount: projData.autocodedSegmentCount ?? 0 }
          }));
        }
      });

      toaster.create({
        title: "Saved",
        description: dirtyProjects.length > 0
          ? `${dirtyProjects.length} project(s) saved successfully.`
          : "Nothing to save.",
        type: "success"
      });
      return true;

    } catch (e: any) {
      toaster.create({
        title: "Save failed",
        description: String(e?.message ?? e),
        type: "error"
      });
      return false;
    }
  }, [projectList, projectData]);

  // Save handler - saves all loaded projects (attributes + metadata)
  useEffect(() => {
    function handleSaveEvent() {
      saveAllProjects();
    }

    window.addEventListener("psat:save", handleSaveEvent);
    return () => window.removeEventListener("psat:save", handleSaveEvent);
  }, [saveAllProjects]);

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
      isDirty: true,
    });

    // Dispatch event to notify validation component of attribute change
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
        const newScore = await calculateScoreForRow(currentProjectName, updatedRow);

        updateProjectData(currentProjectName, {
          scores: scores.map((score, i) =>
            i === currentIdx
              ? { ...score, ...newScore }
              : score
          ),
        });

        window.dispatchEvent(new CustomEvent("psat:scores:updated"));
      } catch (e: any) {
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

  useEffect(() => {
    setSegmentInput(String(currentData.verifiedSegmentCount ?? 0));
  }, [currentData.verifiedSegmentCount]);

  useEffect(() => {
    setAutocodedSegmentInput(String(currentData.autocodedSegmentCount ?? 0));
  }, [currentData.autocodedSegmentCount]);

  const commitPage = useCallback(
    (valStr: string) => {
      const raw = Number(valStr);
      if (!Number.isFinite(raw)) return;
      const clamped = Math.min(Math.max(1, len || 1), raw);
      gotoPage(clamped);
    },
    [gotoPage, len]
  );

  const commitSegment = useCallback(
    (valStr: string) => {
      const raw = Number(valStr);
      if (!Number.isFinite(raw)) return;
      const clamped = Math.max(0, Math.min(len || 0, raw));
      // Guard against infinite loop if value hasn't changed
      if (clamped === (currentData.verifiedSegmentCount ?? 0)) return;
      updateVerifiedSegmentCount(currentProjectName!, clamped);
    },
    [currentProjectName, len, updateVerifiedSegmentCount, currentData.verifiedSegmentCount]
  );

  const commitAutocodedSegment = useCallback(
    (valStr: string) => {
      const raw = Number(valStr);
      if (!Number.isFinite(raw)) return;
      const clamped = Math.max(0, Math.min(len || 0, raw));
      // Guard against infinite loop if value hasn't changed
      if (clamped === (currentData.autocodedSegmentCount ?? 0)) return;
      updateAutocodedSegmentCount(currentProjectName!, clamped);
    },
    [currentProjectName, len, updateAutocodedSegmentCount, currentData.autocodedSegmentCount]
  );

  useEffect(() => {
    const t = setTimeout(() => commitPage(pageInput), 300);
    return () => clearTimeout(t);
  }, [pageInput, commitPage]);

  useEffect(() => {
    const t = setTimeout(() => commitSegment(segmentInput), 300);
    return () => clearTimeout(t);
  }, [segmentInput, commitSegment]);

  useEffect(() => {
    const t = setTimeout(() => commitAutocodedSegment(autocodedSegmentInput), 300);
    return () => clearTimeout(t);
  }, [autocodedSegmentInput, commitAutocodedSegment]);

  // Warn user before leaving the page (browser close, refresh, etc.)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  if (projectList.length === 0) {
    return <Box p="4"><Text color="red.500">No projects selected.</Text></Box>;
  }

  if (!isShowingCodingGuide && (loading || !imagesLoaded)) {
    return (
      <Flex align="center" justify="center" h="60vh" direction="column" gap={4}>
        {loading ? (
          <>
            <Spinner size="lg" />
            <Text>Loading project data...</Text>
          </>
        ) : (
          <>
            <Text fontWeight="bold">Preloading Images...</Text>
            <Progress.Root value={imageLoadingProgress} maxW="300px" w="100%" colorPalette="blue">
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
              <Progress.ValueText>{imageLoadingProgress}%</Progress.ValueText>
            </Progress.Root>
            <Text fontSize="sm" color="gray.500">
              Please wait while we cache images for smooth navigation.
            </Text>
          </>
        )}
      </Flex>
    );
  }

  if (!isShowingCodingGuide && error) {
    return (
      <Box p="4">
        <Text color="red.500">Error: {error}</Text>
      </Box>
    );
  }

  // Show Coding Guide
  if (isShowingCodingGuide) {
    return (
      <Box p="4">
        <Flex gap="2" mb="4" wrap="wrap">
          {projectList.map((projectName) => {
            const projData = projectData[projectName];
            const projSegmentCount = projData?.attrs.length ?? 0;
            const isActive = activeTab === projectName;
            return (
              <Button
                key={projectName}
                onClick={() => setActiveTab(projectName)}
                variant={isActive ? "solid" : "outline"}
                colorPalette={isActive ? "blue" : "gray"}
                size="md"
              >
                {projectName} ({projSegmentCount})
              </Button>
            );
          })}
          <Button
            onClick={() => setActiveTab("coding-guide")}
            variant={isShowingCodingGuide ? "solid" : "outline"}
            colorPalette={isShowingCodingGuide ? "blue" : "gray"}
            size="md"
          >
            Coding Guide
          </Button>
        </Flex>
        <Box
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          overflow="hidden"
          h="calc(100vh - 150px)"
        >
          <iframe
            src="/PSAT coding sheetMar25v2.pdf"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
            title="Coding Guide PDF"
          />
        </Box>
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

      <Flex gap="2" mb="4" wrap="wrap">
        {projectList.map((projectName) => {
          const projData = projectData[projectName];
          const projSegmentCount = projData?.attrs.length ?? 0;
          const isActive = activeTab === projectName;
          return (
            <Button
              key={projectName}
              onClick={() => setActiveTab(projectName)}
              variant={isActive ? "solid" : "outline"}
              colorPalette={isActive ? "blue" : "gray"}
              size="md"
            >
              {projectName} ({projSegmentCount})
            </Button>
          );
        })}
        <Button
          onClick={() => setActiveTab("coding-guide")}
          variant={isShowingCodingGuide ? "solid" : "outline"}
          colorPalette={isShowingCodingGuide ? "blue" : "gray"}
          size="md"
        >
          Coding Guide
        </Button>

        {location.state?.returnToAnalysis && (
          <Button
            ml="auto"
            variant="ghost"
            colorPalette="blue"
            size="sm"
            onClick={() => {
              // Open save confirmation dialog instead of navigating immediately
              setIsSaveDialogOpen(true);
            }}
          >
            ← Back to Path Analysis
          </Button>
        )}

        <ExitConfirmationDialog
          open={isSaveDialogOpen}
          onCancel={() => setIsSaveDialogOpen(false)}
          onDiscardAndExit={() => {
            setIsSaveDialogOpen(false);
            window.history.back();
          }}
          onSaveAndExit={async () => {
            setIsSaving(true);
            const success = await saveAllProjects();
            setIsSaving(false);
            if (success) {
              setIsSaveDialogOpen(false);
              window.history.back();
            }
          }}
          isSaving={isSaving}
        />
      </Flex>

      <Flex justify="space-between" align="center" mb="3">
        <Flex align="center" gap="3">
          <Box>
            <Text fontSize="lg" fontWeight="bold">{detail?.name ?? currentProjectName}</Text>
            {detail?.latest && (
              <Text fontSize="sm" color="gray.600">Latest version: {detail.latest}</Text>
            )}
          </Box>
          <Flex align="center" gap="2">
            <Text fontSize="sm" fontWeight="bold">Segments Verified:</Text>
            <NumberInput.Root
              maxW="80px"
              min={0}
              max={len || 0}
              value={segmentInput}
              onValueChange={(e) => setSegmentInput(e.value)}
            >
              <NumberInput.Control />
              <NumberInput.Input
                placeholder="0"
                onBlur={() => commitSegment(segmentInput)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.currentTarget.blur();
                  }
                }}
              />
            </NumberInput.Root>
            <span style={{ fontSize: "18px", minWidth: "50px" }}>
              {len > 0
                ? `${((currentData.verifiedSegmentCount ?? 0) / len * 100).toFixed(1)}%`
                : "0%"}
            </span>
          </Flex>

          <Flex align="center" gap="2">
            <Text fontSize="sm" fontWeight="bold">Segments Autocoded:</Text>
            <NumberInput.Root
              maxW="80px"
              min={0}
              max={len || 0}
              value={autocodedSegmentInput}
              onValueChange={(e) => setAutocodedSegmentInput(e.value)}
            >
              <NumberInput.Control />
              <NumberInput.Input
                placeholder="0"
                onBlur={() => commitAutocodedSegment(autocodedSegmentInput)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.currentTarget.blur();
                  }
                }}
              />
            </NumberInput.Root>
            <span style={{ fontSize: "18px", minWidth: "50px" }}>
              {len > 0
                ? `${((currentData.autocodedSegmentCount ?? 0) / len * 100).toFixed(1)}%`
                : "0%"}
            </span>
          </Flex>
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
        templateColumns={{ base: "1fr", md: "2fr 1fr" }}
        gap="16px"
      >
        <GridItem
          display="flex"
          flexDirection="column"
          minH={`${PANEL_HEIGHT}px`}
          gap="4"
        >
          <Box
            bg="white"
            borderRadius="md"
            p="1"
            borderWidth="1px"
            borderColor="gray.200"
            _dark={{ bg: "gray.800", borderColor: "gray.600" }}
            flexShrink={0}
          >
            <SegmentScoresCard
              scores={scores[currentIndex] || null}
            />
          </Box>

          <Box flex="1" minH={0}>
            <ImagePanel
              projectName={currentProjectName!}
              imageRef={imgRef}
              panelHeight={PANEL_HEIGHT}
            />
          </Box>

          <Flex
            flex="0 0 auto"
            h="56px"
            w="100%"
            minW={0}
            align="center"
            gap="4"
            pt="0"
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

        <GridItem
          display="flex"
          flexDirection="column"
          gap="4"
        >
          <Box flex="1" minH={0} display="flex" flexDirection="column">
            <AttributesPanel
              row={editedRow}
              originalRow={originalCurrentAttr}
              mappings={attrMappings}
              panelHeight={undefined} // Let it fill the parent
              flex={1}
              onChange={onAttrChange}
              onEdit={editCurrentAttr}
              changedFields={changedFieldsByRow[currentIndex] || []}
              fieldSources={fieldSourcesByRow[currentIndex] || {}}
              highlightColor="yellow"
            />
          </Box>
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
            onDataChange={refreshCurrentProject}
          />
        </GridItem>

        {currentFeature?.geometry?.type === "LineString" && (
          <GridItem colSpan={{ base: 1, md: 2 }}>
            <AnalysisPanel
              projectName={currentProjectName!}
              coordinates={(currentFeature.geometry as LineString).coordinates as [number, number][]}
              segmentIndex={currentIndex}
              grade={currentAttr?.["Grade"] as number | null}
              gradientPct={currentAttr?.["Gradient %"] as number | null}
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
      </Grid>
    </Box>
  );
}
