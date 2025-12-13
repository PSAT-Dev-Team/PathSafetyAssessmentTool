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

const PANEL_HEIGHT = 500;
const CONTROLS_H = 56;
const MAP_HEIGHT = 500;

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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
        const [d, a, gjson] = await Promise.all([
          fetchProjectDetail(name),
          fetchProjectAttributes(name) as Promise<AttributesResponse>,
          fetchProjectGeoJSON(name) as Promise<FeatureCollection>,
        ]);
        if (cancelled) return;
        setDetail(d ?? null);
        setAttrs(a?.rows ?? []);
        setGeoFeatures(gjson?.features ?? []);
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
          <Text fontSize="lg" fontWeight="bold">{detail?.name ?? name}</Text>
          {detail?.latest && (
            <Text fontSize="sm" color="gray.600">
              Latest version: {detail.latest}
            </Text>
          )}
        </Box>

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

      {/* Main layout: Map (left) + Image (right) */}
      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="16px">
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
    </Box>
  );
}
