import { useEffect, useMemo, useState, useCallback } from "react";
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
} from "@chakra-ui/react";
import { Switch } from "../../components/ui/switch";

import type { Feature, FeatureCollection, LineString } from "geojson";

import {
  fetchProjectDetail,
  fetchProjectAttributes,
  fetchProjectGeoJSON,
  applyTreatments,
  getSegmentTreatments,
  fetchAttributeMappings,
  previewTreatments,
} from "../../api";

import type { AttributeRow } from "../../api";
import ImagePanel from "../CodingPage/components/ImagePanel";
import AttributesPanel from "../CodingPage/components/AttributesPanel";
import GeoDataPanel from "../CodingPage/components/GeoDataPanel";
import SegmentScoresCard from "../../components/visualization/scoreband/SegmentScoresCard";
import OverallTreatmentAnalysis from "../../components/visualization/scoreband/OverallTreatmentAnalysis";

type ProjectDetail = { name: string; versions: string[]; latest: string };
type AttributesResponse = { rows: AttributeRow[] };
type ScoreType = {
  BB: number;
  BP: number;
  SB: number;
  VB: number;
  total: number;
};

const PANEL_HEIGHT = 400;
const CONTROLS_H = 32;
const MAP_HEIGHT = 500;

// Treatment definitions using application's native attribute names
type Treatment = {
  id: number;
  name: string;
  description?: string;
  // Attributes to check if treatment is applicable
  triggers: Record<string, number[]>[];
  // Attribute changes to apply when treatment is selected
  effects: Record<string, number>;
};

const TREATMENTS: Treatment[] = [
  {
    id: 1,
    name: "Upgrade to on-road bicycle lane with light segregation",
    triggers: [
      { "Facility Type": [5], "Light Segregation": [2] },
      { "Facility Type": [6], "Light Segregation": [2] },
      { "Facility Type": [1, 2], "Number of lanes – adjacent road": [1], "Peak pedestrian flow along or across facility": [3] },
      { "Facility Type": [1, 2], "Number of lanes – adjacent road": [1] },
    ],
    effects: { "Facility Type": 4, "Light Segregation": 1, "Facility access": 1 },
  },
  {
    id: 2,
    name: "Safety barrier (Adjacent road 0-1m)",
    triggers: [
      { "Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Intersection or Road Crossing": [2] },
      { "Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Curvature": [1], "Intersection or Road Crossing": [2] },
      { "Facility Type": [3, 4, 5, 6], "Adjacent Road Lane 0-1m": [1], "Intersection or Road Crossing": [2] },
    ],
    effects: { "Adjacent Road Lane 0-1m": 2, "Facility access": 1 },
  },
  {
    id: 3,
    name: "Safety barrier (Adjacent road 1-3m)",
    triggers: [
      { "Facility Type": [4, 5, 6], "Adjacent Road Lane 1-3m": [1], "Intersection or Road Crossing": [2] },
      { "Facility Type": [3, 4, 5, 6], "Adjacent Road Lane 1-3m": [1], "Intersection or Road Crossing": [2] },
    ],
    effects: { "Adjacent Road Lane 1-3m": 2, "Facility access": 1 },
  },
  {
    id: 4,
    name: "Upgrade to cycling-priority street",
    triggers: [
      { "Facility Type": [1, 2, 5, 6], "Property Access": [1] },
    ],
    effects: { "Facility access": 1 },
  },
  {
    id: 5,
    name: "Upgrade to multi-use path",
    triggers: [
      { "Facility Type": [1, 2, 5, 6], "Property Access": [1] },
    ],
    effects: { "Facility Type": 2, "Facility Width per Direction": 3, "Facility access": 1 },
  },
  {
    id: 6,
    name: "Upgrade to off-road bicycle path",
    triggers: [
      { "Facility Type": [1, 2, 5, 6], "Property Access": [1] },
    ],
    effects: { "Facility Type": 3, "Facility access": 1 },
  },
  {
    id: 7,
    name: "Convert to one-way facility",
    triggers: [
      { "Facility Type": [4, 5, 6], "Flow Direction": [2] },
    ],
    effects: { "Flow Direction": 1, "Facility access": 1 },
  },
  {
    id: 8,
    name: "Improve surface conditions",
    triggers: [
      { "Loose or slippery surface": [1] },
    ],
    effects: { "Loose or slippery surface": 2, "Major Surface Deformation or Drain Opening": 2 },
  },
  {
    id: 9,
    name: "Install light segregation",
    triggers: [
      { "Light Segregation": [2] },
    ],
    effects: { "Light Segregation": 1 },
  },
  {
    id: 10,
    name: "Install street lighting",
    triggers: [
      { "Street Lighting": [2] },
    ],
    effects: { "Street Lighting": 1 },
  },
  {
    id: 11,
    name: "Remove fixed obstacles",
    triggers: [
      { "Fixed Obstacle on Facility": [1] },
    ],
    effects: { "Fixed Obstacle on Facility": 2 },
  },
  {
    id: 12,
    name: "Remove non-fixed obstacles",
    triggers: [
      { "Non-Fixed Obstacle on Facility": [1] },
    ],
    effects: { "Non-Fixed Obstacle on Facility": 2 },
  },
  {
    id: 13,
    name: "Remove width restriction",
    triggers: [
      { "Width Restriction": [1] },
    ],
    effects: { "Width Restriction": 2 },
  },
  {
    id: 14,
    name: "Improve facility access",
    triggers: [
      { "Facility access": [2] },
    ],
    effects: { "Facility access": 1 },
  },
  {
    id: 15,
    name: "Redesign sharp curves",
    triggers: [
      { "Curvature": [1] },
    ],
    effects: { "Curvature": 2 },
  },
  {
    id: 16,
    name: "Widen the facility",
    triggers: [
      { "Facility Width per Direction": [1, 2] },
    ],
    effects: { "Facility Width per Direction": 3 },
  },
  {
    id: 17,
    name: "Install protective barrier",
    triggers: [
      { "Adjacent Severe Hazard 0-1m": [1] },
    ],
    effects: { "Adjacent Severe Hazard 0-1m": 2 },
  },
  {
    id: 18,
    name: "Improve delineation",
    triggers: [
      { "Delineation": [2] },
    ],
    effects: { "Delineation": 1 },
  },
  {
    id: 19,
    name: "Review intersection approach",
    triggers: [
      { "Intersection Approach": [1] },
    ],
    effects: { "Intersection Approach": 2 },
  },
  {
    id: 20,
    name: "Improve crossing facility",
    triggers: [
      { "Crossing Facility": [2] },
    ],
    effects: { "Crossing Facility": 1 },
  },
  {
    id: 21,
    name: "Evaluate grade separation",
    triggers: [
      { "Intersection or Road Crossing": [1] },
    ],
    effects: { "Intersection or Road Crossing": 2 },
  },
  {
    id: 22,
    name: "Reconfigure/remove parking",
    triggers: [
      { "Adjacent Vehicle Parking 0-1m": [1] },
    ],
    effects: { "Adjacent Vehicle Parking 0-1m": 2 },
  },
  {
    id: 23,
    name: "Review tram/train rails",
    triggers: [
      { "Tram or Train Rails": [1] },
    ],
    effects: { "Tram or Train Rails": 2 },
  },
  {
    id: 24,
    name: "Install traffic calming",
    triggers: [
      { "Facility Type": [4], "Intersection or Road Crossing": [2], "Adjacent Road Lane 0-1m": [1] },
    ],
    effects: {},
  },
  {
    id: 25,
    name: "Bicycle speed control",
    triggers: [
      { "Bicycle/LV speed – average": [2] },
    ],
    effects: { "Bicycle/LV speed – average": 1 },
  },
];

// Helper to check if treatment is applicable based on current attributes
const isTreatmentApplicable = (treatment: Treatment, attrs: Record<string, any>): boolean => {
  if (!treatment.triggers || treatment.triggers.length === 0) return false;
  // OR between trigger sets: at least one set must match
  return treatment.triggers.some(set =>
    // AND within a set: all attributes in the set must match
    Object.entries(set).every(([attrName, validValues]) => {
      const attrValue = attrs[attrName];
      // Convert to number if it's a string
      const numValue = typeof attrValue === 'string' ? parseInt(attrValue, 10) : attrValue;
      return validValues.includes(numValue);
    })
  );
};

// Helper to get all applicable treatments for current segment
const getApplicableTreatments = (attrs: Record<string, any>): Treatment[] => {
  return TREATMENTS.filter(t => isTreatmentApplicable(t, attrs));
};

// Apply treatment effects to attributes
const applyTreatmentEffects = (
  attrs: Record<string, any>,
  treatmentIds: number[]
): { modifiedRow: Record<string, any>; changedAttributes: Set<string> } => {
  const modified = { ...attrs };
  const changed = new Set<string>();

  treatmentIds.forEach((treatmentId) => {
    const treatment = TREATMENTS.find((t) => t.id === treatmentId);
    if (treatment) {
      Object.entries(treatment.effects).forEach(([attrName, newValue]) => {
        if (modified[attrName] !== newValue) {
          modified[attrName] = newValue;
          changed.add(attrName);
        }
      });
    }
  });

  return { modifiedRow: modified, changedAttributes: changed };
};

// extractScores REMOVED - unused

// calculatePreviewScores REMOVED - using backend previewTreatments API instead

// Convert score to band (1-4) based on crash type
const calculateBandFromScore = (score: number, type: 'BB' | 'BP' | 'SB' | 'VB' = 'VB'): number => {
  // BB, BP, SB thresholds: 5, 10, 20
  if (type === 'BB' || type === 'BP' || type === 'SB') {
    if (score < 5) return 1;
    if (score <= 10) return 2;
    if (score <= 20) return 3;
    return 4;
  }

  // VB and default thresholds: 10, 25, 60
  if (score < 10) return 1;
  if (score <= 25) return 2;
  if (score <= 60) return 3;
  return 4;
};

// Calculate band distributions for pie charts
const calculateBandDistributions = (scoreRows: any[]) => {
  const distributions = {
    VB: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    BB: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    SB: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    BP: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    Overall: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  scoreRows.forEach((row) => {
    const vbBand = row["VB Band"];
    const bbBand = row["BB Band"];
    const sbBand = row["SB Band"];
    const bpBand = row["BP Band"];

    // Overall might be stored as "Overall Risk Level Band" or calculated from "Overall Risk Level"
    let overallBand = row["Overall Risk Level Band"];
    if (!overallBand && row["Overall Risk Level"] !== undefined) {
      // Fallback if band is missing (should verify if this fallback logic is even needed or correct usually)
      // Actually, if we lack bands, we can't reliably calculate Overall Band without recalculating all components.
      // But assuming row usually has bands.
      // If we strictly need to recalc:
      const bb = calculateBandFromScore(row["BB"], 'BB');
      const bp = calculateBandFromScore(row["BP"], 'BP');
      const sb = calculateBandFromScore(row["SB"], 'SB');
      const vb = calculateBandFromScore(row["VB"], 'VB');
      overallBand = Math.max(bb, bp, sb, vb);
    }

    if (vbBand >= 1 && vbBand <= 4) distributions.VB[vbBand as keyof typeof distributions.VB]++;
    if (bbBand >= 1 && bbBand <= 4) distributions.BB[bbBand as keyof typeof distributions.BB]++;
    if (sbBand >= 1 && sbBand <= 4) distributions.SB[sbBand as keyof typeof distributions.SB]++;
    if (bpBand >= 1 && bpBand <= 4) distributions.BP[bpBand as keyof typeof distributions.BP]++;
    if (overallBand >= 1 && overallBand <= 4) distributions.Overall[overallBand as keyof typeof distributions.Overall]++;
  });

  return distributions;
};

export default function TreatmentDetailPage() {
  const { projectName } = useParams<{ projectName: string }>();

  // Parse project names
  const projectNames = useMemo(() => {
    if (!projectName) return [];
    try {
      return projectName.split(',').map(name => {
        try {
          return decodeURIComponent(name);
        } catch {
          return name;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }, [projectName]);

  const [projectMap, setProjectMap] = useState<Array<{
    name: string;
    startIndex: number;
    count: number;
    detail: ProjectDetail;
  }>>([]);

  const [attrs, setAttrs] = useState<AttributeRow[]>([]);
  const [geoFeatures, setGeoFeatures] = useState<Feature[]>([]);
  const [scores, setScores] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTreatments, setSelectedTreatments] = useState<Set<number>>(new Set());

  // Active project for tab navigation - initialize to first project
  const [activeProject, setActiveProject] = useState<string>(() => projectNames[0] ?? "");
  const [attrMappings, setAttrMappings] = useState<Record<string, Record<string, string>>>({});
  const [showPostTreatment, setShowPostTreatment] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Treatment application state
  const [treatmentState, setTreatmentState] = useState<Record<number, {
    applied: boolean;
    treatment_ids: number[];
    after_scores: ScoreType | null;
  }>>({});
  const [applyLoading, setApplyLoading] = useState(false);

  // Preview state
  const [previewScores, setPreviewScores] = useState<ScoreType | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const len = attrs.length;
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState(String(currentPage));

  const currentIndex = useMemo(
    () => Math.max(0, Math.min(len - 1, currentPage - 1)),
    [currentPage, len]
  );

  // Helper to resolve index
  const resolveIndex = useCallback((globalIndex: number) => {
    for (const p of projectMap) {
      if (globalIndex >= p.startIndex && globalIndex < p.startIndex + p.count) {
        return { name: p.name, localIndex: globalIndex - p.startIndex };
      }
    }
    return null;
  }, [projectMap]);

  // Get segment count for a specific project
  const getProjectSegmentCount = useCallback((projectName: string): number => {
    const project = projectMap.find(p => p.name === projectName);
    return project?.count ?? 0;
  }, [projectMap]);

  // Get the first segment index for a specific project
  const getProjectFirstSegmentIndex = useCallback((projectName: string): number => {
    const project = projectMap.find(p => p.name === projectName);
    return project?.startIndex ?? 0;
  }, [projectMap]);

  // Calculate before treatment band distributions (all segments)
  const beforeBandCounts = useMemo(() => {
    return calculateBandDistributions(scores);
  }, [scores]);

  // Calculate after treatment band distributions (only treated segments)
  const afterBandCounts = useMemo(() => {
    const treatedSegments = scores.map((scoreRow, index) => {
      const state = treatmentState[index];
      if (!state?.applied || !state.after_scores) {
        return scoreRow; // Not treated, return original
      }

      const bbBand = calculateBandFromScore(state.after_scores.BB, 'BB');
      const bpBand = calculateBandFromScore(state.after_scores.BP, 'BP');
      const sbBand = calculateBandFromScore(state.after_scores.SB, 'SB');
      const vbBand = calculateBandFromScore(state.after_scores.VB, 'VB');
      const overallBand = Math.max(bbBand, bpBand, sbBand, vbBand);

      // Create new row with after-treatment scores
      return {
        ...scoreRow,
        "BB": state.after_scores.BB,
        "BB Band": bbBand,
        "BP": state.after_scores.BP,
        "BP Band": bpBand,
        "SB": state.after_scores.SB,
        "SB Band": sbBand,
        "VB": state.after_scores.VB,
        "VB Band": vbBand,
        "Overall Risk Level": state.after_scores.total,
        "Overall Risk Level Band": overallBand,
      };
    });
    return calculateBandDistributions(treatedSegments);
  }, [scores, treatmentState]);

  // Create after-treatment scores for map visualization
  const afterTreatmentScores = useMemo(() => {
    return scores.map((scoreRow, index) => {
      const state = treatmentState[index];
      if (!state?.applied || !state.after_scores) {
        return scoreRow; // Not treated, return original
      }
      // Create new row with after-treatment scores
      return {
        ...scoreRow,
        "BB": state.after_scores.BB,
        "BP": state.after_scores.BP,
        "SB": state.after_scores.SB,
        "VB": state.after_scores.VB,
        "Overall Risk Level": state.after_scores.total,
      };
    });
  }, [scores, treatmentState]);

  // Compute modified attributes and changed attributes for current segment when treatments are applied
  const { modifiedAttrs, changedAttributes, changedFieldSources } = useMemo(() => {
    const state = treatmentState[currentIndex];
    if (!state?.applied || !state.treatment_ids) {
      return { modifiedAttrs: attrs[currentIndex] || null, changedAttributes: new Set<string>(), changedFieldSources: {} };
    }
    const { modifiedRow, changedAttributes: changed } = applyTreatmentEffects(
      attrs[currentIndex],
      state.treatment_ids
    );
    const sources: Record<string, string> = {};
    changed.forEach((attr) => {
      sources[attr] = "Treatment";
    });
    return { modifiedAttrs: modifiedRow, changedAttributes: changed, changedFieldSources: sources };
  }, [treatmentState, currentIndex, attrs]);

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

  // Fetch project data
  const fetchData = useCallback(async () => {
    if (projectNames.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(projectNames.map(async (name) => {
        const [d, a, gjson, resultsRes] = await Promise.all([
          fetchProjectDetail(name),
          fetchProjectAttributes(name) as Promise<AttributesResponse>,
          fetchProjectGeoJSON(name) as Promise<FeatureCollection>,
          fetch(`/api/projects/${encodeURIComponent(name)}/results`).then(res =>
            res.ok ? res.json() : { result_rows: [] }
          ).catch(() => ({ result_rows: [] })),
        ]);
        return { name, detail: d ?? null, attrs: a?.rows ?? [], geo: gjson?.features ?? [], scores: resultsRes?.result_rows ?? [] };
      }));

      // Aggregate
      const newMap: any[] = [];
      const newAttrs: any[] = [];
      const newGeo: any[] = [];
      const newScores: any[] = [];

      let start = 0;
      for (const res of results) {
        const count = res.attrs.length;
        newMap.push({ name: res.name, startIndex: start, count, detail: res.detail });
        newAttrs.push(...res.attrs);
        newGeo.push(...res.geo);
        newScores.push(...res.scores);
        start += count;
      }

      setProjectMap(newMap);
      setAttrs(newAttrs);
      setGeoFeatures(newGeo);
      setScores(newScores);

      // Load all treatments proactively for all segments
      await loadAllTreatments(newMap, projectNames);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectNames]);

  // Load all treatments for all segments proactively
  const loadAllTreatments = useCallback(async (map: typeof projectMap, projects: string[]) => {
    const newTreatmentState: Record<number, any> = {};

    for (const project of projects) {
      const projectInfo = map.find(p => p.name === project);
      if (!projectInfo) continue;

      // Load treatments for each segment in this project
      for (let i = 0; i < projectInfo.count; i++) {
        try {
          const state = await getSegmentTreatments(project, i);
          if (state.has_treatments) {
            const globalIndex = projectInfo.startIndex + i;
            newTreatmentState[globalIndex] = {
              applied: true,
              treatment_ids: state.treatments_applied,
              after_scores: state.after_scores ? {
                BB: state.after_scores.BB,
                BP: state.after_scores.BP,
                SB: state.after_scores.SB,
                VB: state.after_scores.VB,
                total: state.after_scores["Overall Risk Level"],
              } : null,
            };
          }
        } catch (e) {
          // Silently skip segments that fail to load
          console.error(`Failed to load treatments for ${project} segment ${i}:`, e);
        }
      }
    }

    if (Object.keys(newTreatmentState).length > 0) {
      setTreatmentState(newTreatmentState);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Listen for Treat All completion event
  useEffect(() => {
    const handleTreatAllCompleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      const details = customEvent.detail; // Array of treatment details (now with projectName)

      if (details && Array.isArray(details)) {
        // Map treatment details to global indices based on projectMap
        setTreatmentState((prevState) => {
          const newState = { ...prevState };

          details.forEach((detail: any) => {
            const projectName = detail.projectName;
            const localIndex = detail.segment_index;
            const afterScores = detail.after_scores;

            // Find the project in projectMap to get the start index
            const project = projectMap.find(p => p.name === projectName);
            if (project) {
              const globalIndex = project.startIndex + localIndex;
              newState[globalIndex] = {
                applied: true,
                treatment_ids: detail.treatments_applied || [],
                after_scores: afterScores ? {
                  BB: afterScores.BB,
                  BP: afterScores.BP,
                  SB: afterScores.SB,
                  VB: afterScores.VB,
                  total: afterScores["Overall Risk Level"],
                } : null,
              };
            }
          });

          return newState;
        });

        setRefreshTrigger(prev => prev + 1);
      } else {
        setRefreshTrigger(prev => prev + 1);
        setTreatmentState({});
      }
    };

    const handleResetAllCompleted = () => {
      fetchData();
      setRefreshTrigger(prev => prev + 1);
      setTreatmentState({}); // Clear all local treatment states
      setSelectedTreatments(new Set()); // Clear selection
      setPreviewScores(null); // Clear preview
    };

    window.addEventListener("psat:treat:all:completed", handleTreatAllCompleted);
    window.addEventListener("psat:reset:all:completed", handleResetAllCompleted);

    return () => {
      window.removeEventListener("psat:treat:all:completed", handleTreatAllCompleted);
      window.removeEventListener("psat:reset:all:completed", handleResetAllCompleted);
    };
  }, [projectMap]);

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

  // Load treatment state when segment changes
  useEffect(() => {
    const ctx = resolveIndex(currentIndex);
    if (!ctx) return;

    let cancelled = false;

    (async () => {
      try {
        const state = await getSegmentTreatments(ctx.name, ctx.localIndex);
        if (cancelled) return;

        if (state.has_treatments) {
          setTreatmentState((prev) => ({
            ...prev,
            [currentIndex]: {
              applied: true,
              treatment_ids: state.treatments_applied,
              after_scores: state.after_scores
                ? {
                  BB: state.after_scores.BB,
                  BP: state.after_scores.BP,
                  SB: state.after_scores.SB,
                  VB: state.after_scores.VB,
                  total: state.after_scores["Overall Risk Level"],
                }
                : null,
            },
          }));
          // Pre-select treatments that were applied
          setSelectedTreatments(new Set(state.treatments_applied));
        } else {
          // Clear selection for segments without treatments
          setSelectedTreatments(new Set());
        }
      } catch (e) {

      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolveIndex, currentIndex, refreshTrigger]);

  // Handle applying treatments
  const handleApplyTreatments = useCallback(async () => {
    const ctx = resolveIndex(currentIndex);
    if (!ctx || selectedTreatments.size === 0) return;

    setApplyLoading(true);

    try {
      const result = await applyTreatments(ctx.name, {
        segment_index: ctx.localIndex,
        treatment_ids: Array.from(selectedTreatments),
        image_ref: imgRef,
      });

      // Update local state
      setTreatmentState((prev) => ({
        ...prev,
        [currentIndex]: {
          applied: true,
          treatment_ids: result.treatments_applied.split(",").map((x) => Number(x.trim())).filter((x) => !isNaN(x)),
          after_scores: {
            BB: result.after_scores.BB,
            BP: result.after_scores.BP,
            SB: result.after_scores.SB,
            VB: result.after_scores.VB,
            total: result.after_scores["Overall Risk Level"],
          },
        },
      }));

    } catch (e: any) {
    } finally {
      setApplyLoading(false);
    }
  }, [resolveIndex, currentIndex, selectedTreatments, imgRef]);

  // Fetch preview scores when selection changes
  useEffect(() => {
    const ctx = resolveIndex(currentIndex);
    // If treatments are already applied, or no treatments selected, or no project/index, skip preview
    if (!ctx || currentIndex < 0 || treatmentState[currentIndex]?.applied || selectedTreatments.size === 0) {
      setPreviewScores(null);
      return;
    }

    // Debounce to avoid too many requests
    const timeoutId = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const result = await previewTreatments(ctx.name, {
          segment_index: ctx.localIndex,
          treatment_ids: Array.from(selectedTreatments),
        });

        if (result.ok) {
          setPreviewScores({
            BB: result.after_scores.BB,
            BP: result.after_scores.BP,
            SB: result.after_scores.SB,
            VB: result.after_scores.VB,
            total: result.after_scores["Overall Risk Level"],
          });
        }
      } catch (e) {

      } finally {
        setPreviewLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [resolveIndex, currentIndex, selectedTreatments, treatmentState]);

  // Handle resetting treatments
  const handleResetTreatments = useCallback(async () => {
    const ctx = resolveIndex(currentIndex);
    if (!ctx) return;

    setApplyLoading(true);

    try {
      // Apply with empty treatment list to reset
      await applyTreatments(ctx.name, {
        segment_index: ctx.localIndex,
        treatment_ids: [],
        image_ref: imgRef,
      });

      // Clear local state
      setTreatmentState((prev) => {
        const next = { ...prev };
        delete next[currentIndex];
        return next;
      });

      setSelectedTreatments(new Set());
      setPreviewScores(null); // Clear preview
    } catch (e: any) {
    } finally {
      setApplyLoading(false);
    }
  }, [resolveIndex, currentIndex, imgRef]);

  // Pagination
  const gotoPage = useCallback(
    (page: number) => {
      if (len === 0) return;
      const clamped = Math.min(Math.max(1, page), len);
      setCurrentPage(clamped);
      // Reset selected treatments and preview when navigating to a new segment
      setSelectedTreatments(new Set());
      setPreviewScores(null);
    },
    [len]
  );

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

  // Resolve current project name for UI display
  const currentCtx = resolveIndex(currentIndex);

  if (projectNames.length === 0) {
    return (
      <Box p="4">
        <Text color="red.500">Invalid project name.</Text>
      </Box>
    );
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
      {/* DEBUG INFO */}


      {/* Project Tabs - for navigating between loaded projects */}
      {projectNames.length > 1 && (
        <Flex gap="2" mb="4" wrap="wrap">
          {projectNames.map((proj) => {
            const isActive = activeProject === proj;
            const segmentCount = getProjectSegmentCount(proj);
            return (
              <Button
                key={proj}
                onClick={() => {
                  setActiveProject(proj);
                  // Navigate to first segment of this project
                  const firstSegmentPage = getProjectFirstSegmentIndex(proj) + 1;
                  setCurrentPage(firstSegmentPage);
                  setPageInput(String(firstSegmentPage));
                }}
                variant={isActive ? "solid" : "outline"}
                colorPalette={isActive ? "blue" : "gray"}
                size="md"
              >
                {proj} ({segmentCount})
              </Button>
            );
          })}
        </Flex>
      )}

      {/* Header with project info and pagination */}
      <Flex justify="space-between" align="center" mb="3">
        <Box>
          <Text fontSize="lg" fontWeight="bold" color="gray.900" _dark={{ color: "white" }}>
            {currentCtx ? currentCtx.name : "Unknown Project"}
          </Text>
          <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
            Loaded: {projectNames.length} project{projectNames.length > 1 ? 's' : ''}
          </Text>
        </Box>

        <Flex align="center" gap="3">
          <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
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

      {/* Map Previews: Before and After Treatment - Side by Side */}
      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="16px" mb="6">
        {/* Before Treatment Map */}
        <GridItem>
          <GeoDataPanel
            projectName={currentCtx ? currentCtx.name : ""}
            feature={
              geoFeatures[currentIndex]?.geometry?.type === "LineString"
                ? (geoFeatures[currentIndex] as any)
                : null
            }
            index={currentIndex}
            onJump={(i) => setCurrentPage(i + 1)}
            containerHeight={MAP_HEIGHT}
            subtitle="Before Treatment"
            geoFeatures={projectNames.length > 1 ? (geoFeatures as Feature<LineString, any>[]) : undefined}
            startIndex={0}
            scores={scores as any}
          />
        </GridItem>

        {/* After Treatment Map */}
        <GridItem>
          <GeoDataPanel
            projectName={currentCtx ? currentCtx.name : ""}
            feature={
              geoFeatures[currentIndex]?.geometry?.type === "LineString"
                ? (geoFeatures[currentIndex] as any)
                : null
            }
            index={currentIndex}
            onJump={(i) => setCurrentPage(i + 1)}
            containerHeight={MAP_HEIGHT}
            scores={afterTreatmentScores as any}
            subtitle="After Treatment"
            geoFeatures={projectNames.length > 1 ? (geoFeatures as Feature<LineString, any>[]) : undefined}
            startIndex={0}
          />
        </GridItem>
      </Grid>

      {/* Main layout: 3 Columns - Image | Treatments | Scores+Attributes */}
      <Grid templateColumns={{ base: "1fr", lg: "0.5fr 1.5fr 1.5fr" }} gap="16px" mb="6">
        {/* Left: Recommended Treatments (Vertical, Scrollable) */}
        <GridItem
          display="flex"
          flexDirection="column"
          bg="gray.50"
          _dark={{ bg: "gray.800" }}
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="md"
          overflow="hidden"
        >
          <Box p="3" borderBottomWidth="1px" borderColor="gray.200" _dark={{ borderColor: "gray.700" }}>
            <Text fontSize="sm" fontWeight="bold" color="gray.700" _dark={{ color: "gray.200" }}>
              Recommended Treatments
            </Text>
            <Text fontSize="xs" color="gray.500">Select to apply</Text>
          </Box>

          <Box flex="1" overflowY="auto" p="3">
            {(() => {
              const currentAttr = attrs[currentIndex] as any;
              if (!currentAttr) {
                return (
                  <Text fontSize="xs" color="gray.400">
                    No segment data
                  </Text>
                );
              }
              const applicable = getApplicableTreatments(currentAttr);
              return applicable.length > 0 ? (
                <Flex direction="column" gap="2">
                  {applicable.map((t) => {
                    const isApplied = treatmentState[currentIndex]?.applied &&
                      treatmentState[currentIndex]?.treatment_ids.includes(t.id);
                    const isDisabled = treatmentState[currentIndex]?.applied;

                    return (
                      <Flex
                        key={t.id}
                        gap="2"
                        align="flex-start"
                        p="2"
                        borderRadius="md"
                        bg={
                          isApplied
                            ? "green.50"
                            : selectedTreatments.has(t.id)
                              ? "blue.50"
                              : "white"
                        }
                        borderWidth="1px"
                        borderColor={
                          isApplied
                            ? "green.200"
                            : selectedTreatments.has(t.id)
                              ? "blue.200"
                              : "gray.200"
                        }
                        cursor={isDisabled ? "not-allowed" : "pointer"}
                        opacity={isDisabled ? 0.6 : 1}
                        transition="all 0.2s"
                        _hover={{
                          borderColor: isDisabled ? undefined : "blue.300",
                          shadow: isDisabled ? undefined : "sm"
                        }}
                        _dark={{
                          bg: isApplied
                            ? "green.900"
                            : selectedTreatments.has(t.id)
                              ? "blue.900"
                              : "gray.700",
                          borderColor: isApplied
                            ? "green.700"
                            : selectedTreatments.has(t.id)
                              ? "blue.700"
                              : "gray.600",
                        }}
                        onClick={() => {
                          if (isDisabled) return;
                          const newSelected = new Set(selectedTreatments);
                          if (newSelected.has(t.id)) {
                            newSelected.delete(t.id);
                          } else {
                            newSelected.add(t.id);
                          }
                          setSelectedTreatments(newSelected);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isApplied || selectedTreatments.has(t.id)}
                          disabled={isDisabled}
                          onChange={() => { }}
                          style={{ marginTop: '3px', cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                          aria-label={`Select treatment: ${t.name}`}
                        />
                        <Box flex="1">
                          <Text fontSize="xs" fontWeight="medium" color="gray.900" _dark={{ color: "white" }} lineHeight="1.2">
                            {t.name}
                            {isApplied && " ✓"}
                          </Text>
                          {t.description && (
                            <Text fontSize="2xs" color="gray.500" _dark={{ color: "gray.400" }} mt="1">
                              {t.description}
                            </Text>
                          )}
                        </Box>
                      </Flex>
                    );
                  })}
                </Flex>
              ) : (
                <Text fontSize="xs" color="gray.400" _dark={{ color: "gray.500" }}>
                  No treatments applicable
                </Text>
              );
            })()}
          </Box>

          {/* Action Buttons Footer */}
          <Box p="3" borderTopWidth="1px" borderColor="gray.200" bg="white" _dark={{ borderColor: "gray.700", bg: "gray.800" }}>
            <Flex direction="column" gap="2">
              <Flex gap="2">
                <Button
                  flex="1"
                  size="xs"
                  variant="outline"
                  colorScheme={selectedTreatments.size > 0 ? "red" : "blue"}
                  disabled={
                    (() => {
                      const currentAttr = attrs[currentIndex] as any;
                      if (!currentAttr) return true;
                      const applicable = getApplicableTreatments(currentAttr);
                      return applicable.length === 0 || treatmentState[currentIndex]?.applied;
                    })()
                  }
                  onClick={() => {
                    const currentAttr = attrs[currentIndex] as any;
                    if (!currentAttr) return;

                    if (selectedTreatments.size > 0) {
                      setSelectedTreatments(new Set());
                    } else {
                      const applicable = getApplicableTreatments(currentAttr);
                      setSelectedTreatments(new Set(applicable.map(t => t.id)));
                    }
                  }}
                >
                  {selectedTreatments.size > 0 ? "Clear" : "All"}
                </Button>
                {treatmentState[currentIndex]?.applied && (
                  <Button
                    flex="1"
                    size="xs"
                    variant="ghost"
                    colorScheme="red"
                    loading={applyLoading}
                    onClick={handleResetTreatments}
                  >
                    Reset
                  </Button>
                )}
              </Flex>

              <Button
                size="sm"
                width="full"
                variant="solid"
                colorScheme={treatmentState[currentIndex]?.applied ? "green" : "blue"}
                disabled={selectedTreatments.size === 0 || applyLoading}
                loading={applyLoading}
                onClick={handleApplyTreatments}
              >
                {treatmentState[currentIndex]?.applied
                  ? "Applied ✓"
                  : `Apply (${selectedTreatments.size})`}
              </Button>
            </Flex>
          </Box>

        </GridItem>

        {/* Middle: Image Panel + Navigation Controls */}
        <GridItem
          display="flex"
          flexDirection="column"
          minH={`${PANEL_HEIGHT}px`}
        >
          {/* Navigation Controls */}
          <Flex
            flex="0 0 auto"
            h={`${CONTROLS_H}px`}
            w="100%"
            minW={0}
            align="center"
            gap="2"
            mb="4"
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

          <Box flex="1 1 auto" minH={0}>
            <ImagePanel
              projectName={currentCtx?.name}
              imageRef={imgRef}
            />
          </Box>
        </GridItem>

        {/* Right: Crash Type Scores + Attributes Panel */}
        <GridItem
          display="flex"
          flexDirection="column"
          gap="4"
        >
          <Box
            bg="white"
            borderRadius="md"
            p="1"
            borderWidth="1px"
            borderColor="gray.200"
            _dark={{ bg: "gray.800", borderColor: "gray.600" }}
          >
            <SegmentScoresCard
              scores={(() => {
                if (!showPostTreatment) {
                  // Pre-treatment: always show original scores
                  return scores[currentIndex] as any || null;
                }

                // Post-treatment toggle is on
                if (treatmentState[currentIndex]?.applied) {
                  // Treatments have been applied: show real after-treatment scores
                  return { ...scores[currentIndex], BB: treatmentState[currentIndex]!.after_scores!.BB, BP: treatmentState[currentIndex]!.after_scores!.BP, SB: treatmentState[currentIndex]!.after_scores!.SB, VB: treatmentState[currentIndex]!.after_scores!.VB, "Overall Risk Level": treatmentState[currentIndex]!.after_scores!.total } as any;
                }

                if (selectedTreatments.size > 0) {
                  // Treatments are selected but not applied: show preview scores (if loaded)
                  if (previewLoading || !previewScores) {
                    // Fallback to original scores while loading, or maybe keep previous preview?
                    // For now, let's keep showing original scores until preview arrives to avoid jumping
                    return scores[currentIndex] as any || null;
                  }

                  return {
                    ...scores[currentIndex],
                    BB: previewScores.BB,
                    BP: previewScores.BP,
                    SB: previewScores.SB,
                    VB: previewScores.VB,
                    "Overall Risk Level": previewScores.total
                  } as any;
                }

                // No treatments selected or applied: show original scores
                return scores[currentIndex] as any || null;
              })()}
              beforeScores={
                showPostTreatment && (treatmentState[currentIndex]?.applied || selectedTreatments.size > 0)
                  ? {
                    BB: scores[currentIndex]?.["BB"] ?? 0,
                    BP: scores[currentIndex]?.["BP"] ?? 0,
                    SB: scores[currentIndex]?.["SB"] ?? 0,
                    VB: scores[currentIndex]?.["VB"] ?? 0,
                    "Overall Risk Level": scores[currentIndex]?.["Overall Risk Level"] ?? 0,
                  }
                  : undefined
              }
              showPreviewBackground={
                showPostTreatment && selectedTreatments.size > 0 && !treatmentState[currentIndex]?.applied
              }
            />
          </Box>

          <Box
            flex="1"
            minH="0"
            overflow="hidden"
            bg="white"
            borderRadius="md"
            borderWidth="1px"
            borderColor="gray.200"
            _dark={{ bg: "gray.800", borderColor: "gray.600" }}
            display="flex"
            flexDirection="column"
          >
            <Flex
              p="2"
              borderBottomWidth="1px"
              borderColor="gray.200"
              _dark={{ borderColor: "gray.700" }}
              align="center"
              justify="space-between"
            >
              <Text fontSize="sm" fontWeight="bold">
                Attributes
              </Text>
              <Flex align="center" gap="2">
                <Text fontSize="xs">Show Post-Treatment</Text>
                <Switch
                  checked={showPostTreatment}
                  onCheckedChange={(e: any) => setShowPostTreatment(e.checked)}
                />
              </Flex>
            </Flex>
            <Box flex="1" minH="0">
              <AttributesPanel
                row={
                  showPostTreatment && (treatmentState[currentIndex]?.applied || selectedTreatments.size > 0)
                    ? modifiedAttrs
                    : attrs[currentIndex]
                }
                mappings={attrMappings}
                changedFields={
                  showPostTreatment ? Array.from(changedAttributes) : []
                }
                // changedFieldSources prop name was redundant? AttributesPanel accepts fieldSources
                fieldSources={
                  showPostTreatment ? changedFieldSources : {}
                }
                highlightMessage="Modified by treatment"
                readOnly={true}
              />
            </Box>
          </Box>
        </GridItem>
      </Grid>

      {/* Overall Analysis Footer */}
      <Box mt="6">
        <OverallTreatmentAnalysis
          beforeBandCounts={beforeBandCounts}
          afterBandCounts={afterBandCounts}
        />
      </Box>
    </Box>
  );
}
