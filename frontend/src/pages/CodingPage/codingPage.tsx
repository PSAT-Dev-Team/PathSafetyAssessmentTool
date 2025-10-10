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
} from "@chakra-ui/react";
import type { Feature, FeatureCollection, LineString } from "geojson";
import { fetchProjectDetail, fetchProjectAttributes, fetchProjectGeoJSON } from "../../api";

import ImagePanel from "./components/ImagePanel";
import AttributesPanel from "./components/AttributesPanel";
import GeoDataPanel from "./components/GeoDataPanel";

// ==== 类型兜底 ====
type ProjectDetail = { name: string; versions: string[]; latest: string };
type AttributeRow = Record<string, string | number | boolean | null>;
type AttributesResponse = { rows: AttributeRow[] };

const PANEL_HEIGHT = 420; // 让图片和属性面板同高（px）

export default function CodingPage() {
  const { projectName } = useParams<{ projectName: string }>();

  const name = useMemo(() => {
    if (!projectName) return null;
    try { return decodeURIComponent(projectName); } catch { return projectName; }
  }, [projectName]);

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [attrs, setAttrs] = useState<AttributeRow[] | null>(null);
  const [geoFeatures, setGeoFeatures] = useState<Feature<LineString, any>[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 单条查看：页码从 1 开始
  const [currentPage, setCurrentPage] = useState<number>(1);

  // 拉数据
  useEffect(() => {
    if (!name) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [d, a, gjson] = await Promise.all([
          fetchProjectDetail(name),
          fetchProjectAttributes(name) as Promise<AttributesResponse>,
          fetchProjectGeoJSON(name) as Promise<FeatureCollection>,
        ]);
        if (cancelled) return;

        setDetail(d ?? null);
        setAttrs(a?.rows ?? []);
        setGeoFeatures((gjson?.features ?? []) as Feature<LineString, any>[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [name]);

  // 长度 & 当前 index
  const len = useMemo(
    () => Math.min(attrs?.length ?? 0, geoFeatures?.length ?? 0),
    [attrs, geoFeatures]
  );

  useEffect(() => {
    if (len === 0) return;
    setCurrentPage(p => Math.min(Math.max(1, p), len));
  }, [len]);

  const currentIndex = Math.max(0, Math.min(len - 1, currentPage - 1));

  const currentAttr: AttributeRow | null = useMemo(() => {
    if (!attrs || len === 0) return null;
    return attrs[currentIndex] ?? null;
  }, [attrs, currentIndex, len]);

  const currentFeature: Feature<LineString, any> | null = useMemo(() => {
    if (!geoFeatures || len === 0) return null;
    return geoFeatures[currentIndex] ?? null;
  }, [geoFeatures, currentIndex, len]);

  // 图片 URL 规则（按你的静态资源路径替换）
  const getImageUrl = useCallback((ref?: string) => {
    if (!ref) return undefined;
    return `/static/images/${detail?.name ?? "project"}/${detail?.latest ?? "latest"}/${encodeURIComponent(ref)}`;
  }, [detail?.name, detail?.latest]);

  const imgRef = currentFeature?.properties?.["Image Reference"] as string | undefined;
  const imgUrl = getImageUrl(imgRef);

  if (loading) {
    return (
      <Flex h="60vh" align="center" justify="center">
        <Spinner />
      </Flex>
    );
  }
  if (error) {
    return <Box color="red.500" p="4">{error}</Box>;
  }
  if (!len) {
    return <Box p="4">No data.</Box>;
  }

  return (
    <Box p="4" display="grid" gap="16px">
      {/* 顶部：页码跳转 */}
      <Flex justify="space-between" align="center">
        <Text fontSize="sm">
          {currentPage} / {len}
        </Text>

        <NumberInput.Root
          maxW="120px"
          min={1}
          max={len}
          defaultValue={String(currentPage)}
          onValueChange={(e) => {
            const v = Number(e.value);
            if (Number.isFinite(v)) {
              const clamped = Math.min(Math.max(1, v), len);
              setCurrentPage(clamped);
            }
          }}
        >
          <NumberInput.Control />
          <NumberInput.Input aria-label="Jump to index" />
        </NumberInput.Root>
      </Flex>

      {/* 上半：左图右属性（等高，属性超出可滚动） */}
      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="16px">
        <GridItem>
          <ImagePanel projectName={projectName} imageUrl={imgUrl} imageRef={imgRef} panelHeight={PANEL_HEIGHT} />
        </GridItem>
        <GridItem>
          <AttributesPanel row={currentAttr} index={currentIndex} panelHeight={PANEL_HEIGHT} />
        </GridItem>
      </Grid>

      {/* 下半：GeoData 详情 */}
      <GeoDataPanel feature={currentFeature} index={currentIndex} />
    </Box>
  );
}
