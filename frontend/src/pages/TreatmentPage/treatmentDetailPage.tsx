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
  Card,
  Heading,
} from "@chakra-ui/react";

import type { Feature, FeatureCollection } from "geojson";

import {
  fetchProjectDetail,
  fetchProjectAttributes,
  fetchProjectGeoJSON,
  applyTreatments,
  getSegmentTreatments,
} from "../../api";

import type { AttributeRow } from "../../api";
import ImagePanel from "../CodingPage/components/ImagePanel";
import GeoDataPanel from "../CodingPage/components/GeoDataPanel";

type ProjectDetail = { name: string; versions: string[]; latest: string };
type AttributesResponse = { rows: AttributeRow[] };
type ScoreType = {
  BB: number;
  BP: number;
  SB: number;
  VB: number;
  total: number;
};

const PANEL_HEIGHT = 500;
const CONTROLS_H = 56;
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


// Extract crash scores from result row
const extractScores = (scoreRow: any): ScoreType => {
  if (!scoreRow) {
    return { BB: 0, BP: 0, SB: 0, VB: 0, total: 0 };
  }
  return {
    BB: scoreRow["BB"] ?? 0,
    BP: scoreRow["BP"] ?? 0,
    SB: scoreRow["SB"] ?? 0,
    VB: scoreRow["VB"] ?? 0,
    total: scoreRow["CycleRAP score"] ?? 0,
  };
};

const getScoreColor = (score: number): string => {
  if (score <= 3) return "#22c55e";      // green
  if (score <= 6) return "#84cc16";      // lime
  if (score <= 10) return "#eab308";     // yellow
  if (score <= 20) return "#f97316";     // orange
  return "#ef4444";                       // red
};

// Calculate estimated preview scores based on selected treatments
const calculatePreviewScores = (beforeScores: ScoreType, selectedTreatmentIds: Set<number>): ScoreType => {
  if (selectedTreatmentIds.size === 0) {
    return beforeScores;
  }

  // Calculate impact based on number of attributes modified by selected treatments
  const affectedAttributeCount = Array.from(selectedTreatmentIds).reduce((count, treatmentId) => {
    const treatment = TREATMENTS.find(t => t.id === treatmentId);
    return count + (treatment ? Object.keys(treatment.effects).length : 0);
  }, 0);

  // Heuristic: reduce score by 5% per treatment attribute modified (max 50% reduction)
  const reductionFactor = Math.max(0.5, 1 - (affectedAttributeCount * 0.05));

  return {
    BB: beforeScores.BB * reductionFactor,
    BP: beforeScores.BP * reductionFactor,
    SB: beforeScores.SB * reductionFactor,
    VB: beforeScores.VB * reductionFactor,
    total: beforeScores.total * reductionFactor,
  };
};

export default function TreatmentDetailPage() {
  const { projectName } = useParams<{ projectName: string }>();

  const name = useMemo(() => {
    if (!projectName) return null;
    try {
      return decodeURIComponent(projectName);
    } catch {
      return projectName;
    }
  }, [projectName]);

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [attrs, setAttrs] = useState<AttributeRow[]>([]);
  const [geoFeatures, setGeoFeatures] = useState<Feature[]>([]);
  const [scores, setScores] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTreatments, setSelectedTreatments] = useState<Set<number>>(new Set());

  // Treatment application state
  const [treatmentState, setTreatmentState] = useState<Record<number, {
    applied: boolean;
    treatment_ids: number[];
    after_scores: ScoreType | null;
  }>>({});
  const [applyLoading, setApplyLoading] = useState(false);

  const len = attrs.length;
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState(String(currentPage));

  const currentIndex = useMemo(
    () => Math.max(0, Math.min(len - 1, currentPage - 1)),
    [currentPage, len]
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

  // Fetch project data
  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [d, a, gjson, resultsRes] = await Promise.all([
          fetchProjectDetail(name),
          fetchProjectAttributes(name) as Promise<AttributesResponse>,
          fetchProjectGeoJSON(name) as Promise<FeatureCollection>,
          fetch(`/api/projects/${encodeURIComponent(name)}/results`).then(res =>
            res.ok ? res.json() : { result_rows: [] }
          ).catch(() => ({ result_rows: [] })),
        ]);
        if (cancelled) return;
        setDetail(d ?? null);
        setAttrs(a?.rows ?? []);
        setGeoFeatures(gjson?.features ?? []);
        setScores(resultsRes?.result_rows ?? []);
        setCurrentPage(1);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Load treatment state when segment changes
  useEffect(() => {
    if (!name || currentIndex < 0) return;

    let cancelled = false;

    (async () => {
      try {
        const state = await getSegmentTreatments(name, currentIndex);
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
                    total: state.after_scores["CycleRAP score"],
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
        console.error("Failed to load treatment state:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [name, currentIndex]);

  // Handle applying treatments
  const handleApplyTreatments = useCallback(async () => {
    if (!name || selectedTreatments.size === 0) return;

    setApplyLoading(true);

    try {
      const result = await applyTreatments(name, {
        segment_index: currentIndex,
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
            total: result.after_scores["CycleRAP score"],
          },
        },
      }));

      console.log("Treatments applied successfully:", result);
    } catch (e: any) {
      console.error("Failed to apply treatments:", e);
      alert(`Error: ${e.message}`);
    } finally {
      setApplyLoading(false);
    }
  }, [name, currentIndex, selectedTreatments, imgRef]);

  // Handle resetting treatments
  const handleResetTreatments = useCallback(async () => {
    if (!name) return;

    setApplyLoading(true);

    try {
      // Apply with empty treatment list to reset
      await applyTreatments(name, {
        segment_index: currentIndex,
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
    } catch (e: any) {
      console.error("Failed to reset treatments:", e);
      alert(`Error: ${e.message}`);
    } finally {
      setApplyLoading(false);
    }
  }, [name, currentIndex, imgRef]);

  // Pagination
  const gotoPage = useCallback(
    (page: number) => {
      if (len === 0) return;
      const clamped = Math.min(Math.max(1, page), len);
      setCurrentPage(clamped);
      // Reset selected treatments when navigating to a new segment
      setSelectedTreatments(new Set());
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

  if (!name) {
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
      {/* Header with project info and pagination */}
      <Flex justify="space-between" align="center" mb="3">
        <Box>
          <Text fontSize="lg" fontWeight="bold" color="gray.900" _dark={{ color: "white" }}>
            {detail?.name ?? name}
          </Text>
          {detail?.latest && (
            <Text fontSize="sm" color="gray.600" _dark={{ color: "gray.400" }}>
              Latest version: {detail.latest}
            </Text>
          )}
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

      {/* Main layout: Map (left) + Image (right) */}
      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="16px" mb="6">
        {/* Left: Map Preview */}
        <GridItem>
          <GeoDataPanel
            feature={
              geoFeatures[currentIndex]?.geometry?.type === "LineString"
                ? (geoFeatures[currentIndex] as any)
                : null
            }
            index={currentIndex}
            onJump={(i) => setCurrentPage(i + 1)}
            containerHeight={MAP_HEIGHT}
          />
        </GridItem>

        {/* Right: Image + Controls */}
        <GridItem
          display="flex"
          flexDirection="column"
          minH={`${PANEL_HEIGHT}px`}
        >
          {/* Image Panel */}
          <Box flex="1 1 auto" minH={0}>
            <ImagePanel
              projectName={name}
              imageRef={imgRef}
              panelHeight={PANEL_HEIGHT - CONTROLS_H}
            />
          </Box>

          {/* Navigation Controls */}
          <Flex
            flex="0 0 auto"
            h={`${CONTROLS_H}px`}
            w="100%"
            minW={0}
            align="center"
            gap="4"
            pt="4"
            mt="2"
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
      </Grid>

      {/* Treatment Section: 3 columns */}
      <Card.Root bg="white" _dark={{ bg: "gray.800" }}>
        <Card.Header>
          <Heading size="md" color="gray.900" _dark={{ color: "white" }}>
            Treatment Analysis
          </Heading>
        </Card.Header>
        <Card.Body>
          <Grid templateColumns={{ base: "1fr", md: "1fr 1fr 1fr" }} gap="6">
            {/* Column 1: Recommended Treatment */}
            <GridItem>
              <Box
                borderWidth="1px"
                borderColor="gray.200"
                borderRadius="md"
                p="4"
                bg="gray.50"
                _dark={{ bg: "gray.700", borderColor: "gray.600" }}
              >
                <Text
                  fontSize="sm"
                  fontWeight="bold"
                  mb="3"
                  color="gray.600"
                  _dark={{ color: "gray.300" }}
                >
                  Recommended Treatment
                </Text>
                <Box>
                  <Text
                    fontSize="xs"
                    color="gray.500"
                    _dark={{ color: "gray.400" }}
                    mb="3"
                  >
                    Select treatments to apply for this section
                  </Text>
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
                      <Flex direction="column" gap="3">
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
                                    : "transparent"
                              }
                              borderWidth="1px"
                              borderColor={
                                isApplied
                                  ? "green.200"
                                  : selectedTreatments.has(t.id)
                                    ? "blue.200"
                                    : "transparent"
                              }
                              cursor={isDisabled ? "not-allowed" : "pointer"}
                              opacity={isDisabled ? 0.6 : 1}
                              transition="all 0.2s"
                              _hover={{
                                bg: isDisabled
                                  ? undefined
                                  : selectedTreatments.has(t.id)
                                    ? "blue.100"
                                    : "gray.100"
                              }}
                              _dark={{
                                bg: isApplied
                                  ? "green.900"
                                  : selectedTreatments.has(t.id)
                                    ? "blue.900"
                                    : "transparent",
                                borderColor: isApplied
                                  ? "green.700"
                                  : selectedTreatments.has(t.id)
                                    ? "blue.700"
                                    : "transparent",
                                _hover: {
                                  bg: isDisabled
                                    ? undefined
                                    : selectedTreatments.has(t.id)
                                      ? "blue.800"
                                      : "gray.600"
                                },
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
                                onChange={() => {}} // Handled by parent Flex onClick
                                style={{ marginTop: '2px', cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                                aria-label={`Select treatment: ${t.name}`}
                              />
                              <Box flex="1">
                                <Text fontSize="xs" fontWeight="medium" color="gray.900" _dark={{ color: "white" }}>
                                  {t.name}
                                  {isApplied && " ✓"}
                                </Text>
                                <Text fontSize="2xs" color="gray.500" _dark={{ color: "gray.400" }}>
                                  {t.description}
                                </Text>
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
                  {/* Treatment Action Buttons */}
                  <Flex direction="column" gap="2" mt="4" pt="4" borderTopWidth="1px" borderColor="gray.200" _dark={{ borderColor: "gray.600" }}>
                    {/* Select All / Clear All Button */}
                    <Button
                      size="sm"
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
                          // Clear all selected treatments
                          setSelectedTreatments(new Set());
                        } else {
                          // Select all applicable treatments
                          const applicable = getApplicableTreatments(currentAttr);
                          setSelectedTreatments(new Set(applicable.map(t => t.id)));
                        }
                      }}
                    >
                      {selectedTreatments.size > 0 ? (
                        <>Clear All ({selectedTreatments.size})</>
                      ) : (
                        <>
                          Select All ({(() => {
                            const currentAttr = attrs[currentIndex] as any;
                            if (!currentAttr) return 0;
                            const applicable = getApplicableTreatments(currentAttr);
                            return applicable.length;
                          })()})
                        </>
                      )}
                    </Button>

                    {/* Apply Treatment Button */}
                    <Button
                      size="sm"
                      variant="solid"
                      colorScheme={treatmentState[currentIndex]?.applied ? "green" : "blue"}
                      disabled={selectedTreatments.size === 0 || applyLoading}
                      loading={applyLoading}
                      onClick={handleApplyTreatments}
                    >
                      {treatmentState[currentIndex]?.applied
                        ? "Treatment Applied ✓"
                        : `Apply Treatment (${selectedTreatments.size})`}
                    </Button>

                    {/* Reset Button (optional) */}
                    {treatmentState[currentIndex]?.applied && (
                      <Button
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        loading={applyLoading}
                        onClick={handleResetTreatments}
                      >
                        Reset
                      </Button>
                    )}
                  </Flex>
                </Box>
              </Box>
            </GridItem>

            {/* Column 2: Before Treatment Scores */}
            <GridItem>
              <Box
                borderWidth="1px"
                borderColor="gray.200"
                borderRadius="md"
                p="4"
                bg="gray.50"
                _dark={{ bg: "gray.700", borderColor: "gray.600" }}
              >
                <Text
                  fontSize="sm"
                  fontWeight="bold"
                  mb="3"
                  color="gray.600"
                  _dark={{ color: "gray.300" }}
                >
                  Before Treatment
                </Text>
                <Flex direction="column" gap="2">
                  {(() => {
                    const scoreRow = scores[currentIndex] ?? null;
                    const scoreData = extractScores(scoreRow);
                    return ["BB", "BP", "SB", "VB", "total"].map((k) => {
                      const value = scoreData[k as keyof ScoreType];
                      const color = getScoreColor(value);
                      return (
                        <Flex key={k} justify="space-between" align="center">
                          <Text fontSize="xs" fontWeight="medium" color="gray.900" _dark={{ color: "white" }}>
                            {k === "total" ? "Total" : k}:
                          </Text>
                          <Box
                            px="2"
                            py="1"
                            borderRadius="md"
                            bg="white"
                            borderWidth="1px"
                            borderColor="gray.200"
                            _dark={{ bg: "gray.600", borderColor: "gray.500" }}
                          >
                            <Text fontSize="sm" fontWeight="bold" style={{ color }}>
                              {value.toFixed(2)}
                            </Text>
                          </Box>
                        </Flex>
                      );
                    });
                  })()}
                </Flex>
              </Box>
            </GridItem>

            {/* Column 3: After Treatment Scores */}
            <GridItem>
              <Box
                borderWidth="1px"
                borderColor="gray.200"
                borderRadius="md"
                p="4"
                bg="gray.50"
                _dark={{ bg: "gray.700", borderColor: "gray.600" }}
              >
                <Flex direction="column" gap="1" mb="3">
                  <Text
                    fontSize="sm"
                    fontWeight="bold"
                    color="gray.600"
                    _dark={{ color: "gray.300" }}
                  >
                    After Treatment
                  </Text>
                  {selectedTreatments.size > 0 && (
                    <Text fontSize="2xs" color="blue.600" _dark={{ color: "blue.300" }}>
                      ({selectedTreatments.size} treatment{selectedTreatments.size !== 1 ? 's' : ''} selected)
                    </Text>
                  )}
                </Flex>
                <Flex direction="column" gap="2">
                  {(() => {
                    const beforeScores = extractScores(scores[currentIndex] ?? null);

                    // If treatments are applied, use real scores; otherwise use preview
                    let afterScores: ScoreType;
                    let isPreview = false;

                    if (treatmentState[currentIndex]?.after_scores) {
                      // Real calculated scores from backend
                      afterScores = treatmentState[currentIndex]!.after_scores;
                    } else if (selectedTreatments.size > 0) {
                      // Preview scores based on selected treatments
                      afterScores = calculatePreviewScores(beforeScores, selectedTreatments);
                      isPreview = true;
                    } else {
                      // No treatments selected, show original scores
                      afterScores = beforeScores;
                    }

                    return ["BB", "BP", "SB", "VB", "total"].map((k) => {
                      const beforeValue = beforeScores[k as keyof ScoreType];
                      const afterValue = afterScores[k as keyof ScoreType];
                      const improved = afterValue < beforeValue;
                      const color = getScoreColor(afterValue);

                      return (
                        <Flex key={k} justify="space-between" align="center">
                          <Text fontSize="xs" fontWeight="medium" color="gray.900" _dark={{ color: "white" }}>
                            {k === "total" ? "Total" : k}:
                          </Text>
                          <Box
                            px="2"
                            py="1"
                            borderRadius="md"
                            bg={
                              treatmentState[currentIndex]?.applied
                                ? (improved ? "green.50" : "white")
                                : isPreview
                                  ? "blue.50"
                                  : "white"
                            }
                            borderWidth="1px"
                            borderColor={
                              treatmentState[currentIndex]?.applied
                                ? (improved ? "green.200" : "gray.200")
                                : isPreview
                                  ? "blue.200"
                                  : "gray.200"
                            }
                            _dark={{
                              bg: treatmentState[currentIndex]?.applied
                                ? (improved ? "green.900" : "gray.600")
                                : isPreview
                                  ? "blue.900"
                                  : "gray.600",
                              borderColor: treatmentState[currentIndex]?.applied
                                ? (improved ? "green.700" : "gray.500")
                                : isPreview
                                  ? "blue.700"
                                  : "gray.500"
                            }}
                          >
                            <Flex direction="row" align="center" gap="1" justify="flex-end">
                              {improved && (
                                <Text
                                  fontSize="2xs"
                                  color={treatmentState[currentIndex]?.applied ? "green.600" : "blue.600"}
                                  _dark={{ color: treatmentState[currentIndex]?.applied ? "green.300" : "blue.300" }}
                                  whiteSpace="nowrap"
                                >
                                  ↓ {(beforeValue - afterValue).toFixed(2)}
                                </Text>
                              )}
                              <Text fontSize="sm" fontWeight="bold" style={{ color }}>
                                {afterValue.toFixed(2)}
                              </Text>
                            </Flex>
                          </Box>
                        </Flex>
                      );
                    });
                  })()}
                </Flex>
                {treatmentState[currentIndex]?.applied && (
                  <Text fontSize="2xs" color="green.600" _dark={{ color: "green.300" }} mt="2">
                    ✓ Calculated with CycleRAP v2.11
                  </Text>
                )}
                {selectedTreatments.size > 0 && !treatmentState[currentIndex]?.applied && (
                  <Text fontSize="2xs" color="blue.600" _dark={{ color: "blue.300" }} mt="2">
                    ℹ Preview based on {selectedTreatments.size} selected treatment{selectedTreatments.size !== 1 ? 's' : ''}
                  </Text>
                )}
              </Box>
            </GridItem>
          </Grid>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}
