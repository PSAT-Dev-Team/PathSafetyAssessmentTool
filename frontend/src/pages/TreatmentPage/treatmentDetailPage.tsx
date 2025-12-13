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
  description: string;
  // Attributes to check if treatment is applicable
  triggers: Record<string, number[]>[];
  // Attribute changes to apply when treatment is selected
  effects: Record<string, number>;
};

const TREATMENTS: Treatment[] = [
  {
    id: 1,
    name: "Upgrade to on-road bicycle lane with light segregation",
    description: "Improve facility type and add light segregation",
    triggers: [{ "Facility Type": [5, 6], "Light Segregation": [2] }],
    effects: { "Facility Type": 4, "Light Segregation": 1, "Facility access": 1 },
  },
  {
    id: 2,
    name: "Install safety barrier (Adjacent road 0-1m)",
    description: "Reduce risk from adjacent road hazards",
    triggers: [{ "Facility Type": [4, 5, 6], "Adjacent Road Lane 0-1m": [1] }],
    effects: { "Adjacent Road Lane 0-1m": 2, "Facility access": 1 },
  },
  {
    id: 3,
    name: "Install safety barrier (Adjacent road 1-3m)",
    description: "Protect from hazards 1-3m away",
    triggers: [{ "Facility Type": [4, 5, 6], "Adjacent Road Lane 1-3m": [1] }],
    effects: { "Adjacent Road Lane 1-3m": 2 },
  },
  {
    id: 4,
    name: "Upgrade to cycling-priority street",
    description: "Reduce vehicle speed and improve access",
    triggers: [{ "Facility Type": [6], "Light Segregation": [2] }],
    effects: { "Facility access": 1 },
  },
  {
    id: 5,
    name: "Upgrade to multi-use path",
    description: "Convert to dedicated multi-use facility",
    triggers: [{ "Facility Type": [6], "Facility access": [2] }],
    effects: { "Facility Type": 2, "Facility Width per Direction": 3, "Facility access": 1 },
  },
  {
    id: 6,
    name: "Upgrade to off-road bicycle path",
    description: "Create dedicated off-road facility",
    triggers: [{ "Facility Type": [5, 6], "Facility access": [2] }],
    effects: { "Facility Type": 3, "Facility access": 1 },
  },
  {
    id: 7,
    name: "Convert to one-way facility",
    description: "Change to one-directional traffic flow",
    triggers: [{ "Flow Direction": [2] }],
    effects: { "Flow Direction": 1 },
  },
  {
    id: 8,
    name: "Improve surface conditions",
    description: "Fix loose/slippery surfaces and deformations",
    triggers: [{ "Loose or slippery surface": [1] }],
    effects: { "Loose or slippery surface": 2, "Major Surface Deformation or Drain Opening": 2 },
  },
  {
    id: 9,
    name: "Install light segregation",
    description: "Add physical separation from traffic",
    triggers: [{ "Light Segregation": [2] }],
    effects: { "Light Segregation": 1 },
  },
  {
    id: 10,
    name: "Install street lighting",
    description: "Improve visibility and safety at night",
    triggers: [{ "Street Lighting": [2] }],
    effects: { "Street Lighting": 1 },
  },
  {
    id: 11,
    name: "Remove fixed obstacles",
    description: "Clear permanent barriers and hazards",
    triggers: [{ "Fixed Obstacle on Facility": [1] }],
    effects: { "Fixed Obstacle on Facility": 2 },
  },
  {
    id: 12,
    name: "Remove non-fixed obstacles",
    description: "Clear temporary barriers and hazards",
    triggers: [{ "Non-Fixed Obstacle on Facility": [1] }],
    effects: { "Non-Fixed Obstacle on Facility": 2 },
  },
  {
    id: 13,
    name: "Remove width restriction",
    description: "Expand facility width",
    triggers: [{ "Width Restriction": [1] }],
    effects: { "Width Restriction": 2 },
  },
  {
    id: 14,
    name: "Improve facility access",
    description: "Address inadequate facility access",
    triggers: [{ "Facility access": [2] }],
    effects: { "Facility access": 1 },
  },
  {
    id: 15,
    name: "Redesign sharp curves",
    description: "Address dangerous curvature",
    triggers: [{ "Curvature": [1] }],
    effects: { "Curvature": 2 },
  },
  {
    id: 16,
    name: "Widen the facility",
    description: "Expand facility width to improve safety",
    triggers: [{ "Facility Width per Direction": [1, 2] }],
    effects: { "Facility Width per Direction": 3 },
  },
  {
    id: 17,
    name: "Install protective barrier",
    description: "Shield from adjacent hazards",
    triggers: [{ "Adjacent Severe Hazard 0-1m": [1] }],
    effects: { "Adjacent Severe Hazard 0-1m": 2 },
  },
  {
    id: 18,
    name: "Improve delineation",
    description: "Add or improve lane delineation",
    triggers: [{ "Delineation": [2] }],
    effects: { "Delineation": 1 },
  },
  {
    id: 19,
    name: "Review intersection approach",
    description: "Improve intersection design",
    triggers: [{ "Intersection Approach": [1] }],
    effects: { "Intersection Approach": 2 },
  },
  {
    id: 20,
    name: "Improve crossing facility",
    description: "Enhance crossing design and safety",
    triggers: [{ "Crossing Facility": [2] }],
    effects: { "Crossing Facility": 1 },
  },
  {
    id: 21,
    name: "Evaluate grade separation",
    description: "Consider grade-separated crossing",
    triggers: [{ "Intersection or Road Crossing": [1] }],
    effects: { "Intersection or Road Crossing": 2 },
  },
  {
    id: 22,
    name: "Reconfigure/remove parking",
    description: "Remove or relocate adjacent parking",
    triggers: [{ "Adjacent Vehicle Parking 0-1m": [1] }],
    effects: { "Adjacent Vehicle Parking 0-1m": 2 },
  },
  {
    id: 23,
    name: "Review tram/train rails",
    description: "Address tram or train rail hazards",
    triggers: [{ "Tram or Train Rails": [1] }],
    effects: { "Tram or Train Rails": 2 },
  },
  {
    id: 24,
    name: "Install traffic calming",
    description: "Reduce vehicle speeds through physical measures",
    triggers: [{ "Facility Type": [4], "Light Segregation": [2], "Adjacent Road Lane 0-1m": [1] }],
    effects: {},
  },
  {
    id: 25,
    name: "Bicycle speed control",
    description: "Manage bicycle speeds in high-speed areas",
    triggers: [{ "Bicycle/LV speed – average": [2] }],
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
                        {applicable.map((t) => (
                          <Flex
                            key={t.id}
                            gap="2"
                            align="flex-start"
                            p="2"
                            borderRadius="md"
                            bg={selectedTreatments.has(t.id) ? "blue.50" : "transparent"}
                            borderWidth="1px"
                            borderColor={selectedTreatments.has(t.id) ? "blue.200" : "transparent"}
                            cursor="pointer"
                            transition="all 0.2s"
                            _hover={{ bg: selectedTreatments.has(t.id) ? "blue.100" : "gray.100" }}
                            _dark={{
                              bg: selectedTreatments.has(t.id) ? "blue.900" : "transparent",
                              borderColor: selectedTreatments.has(t.id) ? "blue.700" : "transparent",
                              _hover: { bg: selectedTreatments.has(t.id) ? "blue.800" : "gray.600" },
                            }}
                            onClick={() => {
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
                              checked={selectedTreatments.has(t.id)}
                              onChange={() => {}} // Handled by parent Flex onClick
                              style={{ marginTop: '2px', cursor: 'pointer' }}
                              aria-label={`Select treatment: ${t.name}`}
                            />
                            <Box flex="1">
                              <Text fontSize="xs" fontWeight="medium" color="gray.900" _dark={{ color: "white" }}>
                                {t.name}
                              </Text>
                              <Text fontSize="2xs" color="gray.500" _dark={{ color: "gray.400" }}>
                                {t.description}
                              </Text>
                            </Box>
                          </Flex>
                        ))}
                      </Flex>
                    ) : (
                      <Text fontSize="xs" color="gray.400" _dark={{ color: "gray.500" }}>
                        No treatments applicable
                      </Text>
                    );
                  })()}
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
                <Text
                  fontSize="sm"
                  fontWeight="bold"
                  mb="3"
                  color="gray.600"
                  _dark={{ color: "gray.300" }}
                >
                  After Treatment
                  {selectedTreatments.size > 0 && (
                    <Text fontSize="2xs" color="blue.600" _dark={{ color: "blue.300" }} mt="1">
                      ({selectedTreatments.size} treatment{selectedTreatments.size !== 1 ? 's' : ''} selected)
                    </Text>
                  )}
                </Text>
                <Flex direction="column" gap="2">
                  {(() => {
                    if (selectedTreatments.size === 0) {
                      // No treatments selected, show original scores
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
                    } else {
                      // Treatments selected - show estimated scores based on treatment effects
                      const scoreRow = scores[currentIndex] ?? null;
                      const scoreData = extractScores(scoreRow);

                      // Calculate impact based on number of attributes modified
                      // Apply a simple heuristic: reduce score by 5% per treatment attribute modified
                      // In a real implementation, this would call the backend score calculator
                      const affectedAttributeCount = Array.from(selectedTreatments).reduce((count, treatmentId) => {
                        const treatment = TREATMENTS.find(t => t.id === treatmentId);
                        return count + (treatment ? Object.keys(treatment.effects).length : 0);
                      }, 0);

                      const reductionFactor = Math.max(0.5, 1 - (affectedAttributeCount * 0.05));

                      return ["BB", "BP", "SB", "VB", "total"].map((k) => {
                        const originalValue = scoreData[k as keyof ScoreType];
                        const estimatedValue = originalValue * reductionFactor;
                        const color = getScoreColor(estimatedValue);
                        return (
                          <Flex key={k} justify="space-between" align="center">
                            <Text fontSize="xs" fontWeight="medium" color="gray.900" _dark={{ color: "white" }}>
                              {k === "total" ? "Total" : k}:
                            </Text>
                            <Box
                              px="2"
                              py="1"
                              borderRadius="md"
                              bg="blue.50"
                              borderWidth="1px"
                              borderColor="blue.200"
                              _dark={{ bg: "blue.900", borderColor: "blue.700" }}
                            >
                              <Flex direction="column" align="flex-end" gap="0">
                                <Text fontSize="sm" fontWeight="bold" style={{ color }}>
                                  {estimatedValue.toFixed(2)}
                                </Text>
                                <Text fontSize="2xs" color="gray.500" _dark={{ color: "gray.400" }}>
                                  ↓ {(originalValue - estimatedValue).toFixed(2)}
                                </Text>
                              </Flex>
                            </Box>
                          </Flex>
                        );
                      });
                    }
                  })()}
                </Flex>
                {selectedTreatments.size > 0 && (
                  <Text fontSize="2xs" color="gray.500" _dark={{ color: "gray.400" }} mt="2">
                    * Scores are estimated based on treatment effects
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
