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
import type { Feature, FeatureCollection, LineString, Geometry } from "geojson";

import {
  fetchProjectDetail,
  fetchProjectAttributes,
  fetchProjectGeoJSON,
  fetchAttributeMappings
} from "../../api";
import type { AttributeRow } from "../../api";

import ImagePanel from "./components/ImagePanel";
import AttributesPanel from "./components/AttributesPanel";
import GeoDataPanel from "./components/GeoDataPanel"; // ← 用你之前的组件（保持文件名/路径）

// 兜底类型
type ProjectDetail = { name: string; versions: string[]; latest: string };
type AttributesResponse = { rows: AttributeRow[] };
type AttrMappings = Record<string, Record<string, string>>;

const PANEL_HEIGHT = 500;
const CONTROLS_H = 56; // 翻页按钮条高度（可按需微调）



export default function CodingPage() {
  const { projectName } = useParams<{ projectName: string }>();

  const name = useMemo(() => {
    if (!projectName) return null;
    try { return decodeURIComponent(projectName); } catch { return projectName; }
  }, [projectName]);

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [attrs, setAttrs] = useState<AttributeRow[]>([]);
  const [geoFeatures, setGeoFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [attrMappings, setAttrMappings] = useState<AttrMappings>({});
  const len = attrs.length;
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState(String(currentPage));

  const currentIndex = useMemo(
    () => Math.max(0, Math.min(len - 1, currentPage - 1)),
    [currentPage, len]
  );

  const currentAttr = useMemo<AttributeRow | null>(
    () => (len > 0 ? attrs[currentIndex] : null),
    [attrs, currentIndex]
  );
  const [editedRow, setEditedRow] = useState<AttributeRow | null>(null);

  // 取当前行的图片引用（按你数据列名兜底）
  // 根据当前行推导图片引用（优先 editedRow，其次 currentAttr）
  function isLineStringFeature(
    f: Feature<Geometry, any> | undefined | null
  ): f is Feature<LineString, any> {
    return !!f && f.geometry?.type === "LineString";
  }

  const currentFeature = useMemo<Feature<LineString, any> | null>(() => {
    if (!geoFeatures || len === 0) return null;
    const f = geoFeatures[currentIndex];
    return isLineStringFeature(f) ? f : null;
  }, [geoFeatures, currentIndex, len]);

  // 如果你要从 feature 里拿图片引用，建议也把 undefined/null 处理好
  const imgRef = useMemo<string | undefined>(() => {
    const v = currentFeature?.properties?.["Image Reference"];
    const s = typeof v === "string" ? v : v != null ? String(v) : "";
    return s.trim() ? s.trim() : undefined;
  }, [currentFeature]);


  // 拉数据
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
    return () => { cancelled = true; };
  }, [name]);

  // 映射
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

  // 编辑副本
  useEffect(() => {
    setEditedRow(currentAttr ? { ...currentAttr } : null);
  }, [currentAttr]);

  // 子面板回调：某个字段改变
  const onAttrChange = useCallback(
    (key: string, value: string | number | boolean | null) => {
      setEditedRow(prev => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  // 翻页
  const gotoPage = useCallback((page: number) => {
    if (len === 0) return;
    const clamped = Math.min(Math.max(1, page), len);
    setCurrentPage(clamped);
  }, [len]);

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
    return <Box p="4"><Text color="red.500">Invalid project name.</Text></Box>;
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
      {/* 顶部信息与分页 */}
      <Flex justify="space-between" align="center" mb="3">
        <Box>
          <Text fontSize="lg" fontWeight="bold">{detail?.name ?? name}</Text>
          {detail?.latest && (
            <Text fontSize="sm" color="gray.600">Latest version: {detail.latest}</Text>
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
            value={pageInput}                    // ← 受控
            onValueChange={(e) => setPageInput(e.value)}
          >
            <NumberInput.Control />
            <NumberInput.Input
              onBlur={() => commitPage(pageInput)}        // 失焦立刻提交
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.currentTarget.blur();                // 触发 onBlur 提交
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
        {/* 第一行：Image */}
        <GridItem>
          <ImagePanel
            projectName={name}
            imageRef={imgRef}
            panelHeight={PANEL_HEIGHT}
          />
        </GridItem>

        {/* 第一行：Attributes */}
        <GridItem>
          <AttributesPanel
            row={editedRow}
            mappings={attrMappings}
            panelHeight={PANEL_HEIGHT - CONTROLS_H}
            onChange={onAttrChange}
          />
          {/* 下半：翻页按钮条（贴底） */}
          <Flex
            h={`${CONTROLS_H}px`}
            w="100%"
            minW={0}
            align="center"
            gap="4"
            pt="2"
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

        {/* 第二行：GeoData 跨两列（在 md 及以上），在手机上一列自然会排在下面 */}
        <GridItem colSpan={{ base: 1, md: 2 }}>
          <GeoDataPanel
            feature={
              geoFeatures[currentIndex]?.geometry?.type === "LineString"
                ? (geoFeatures[currentIndex] as any) // 已做类型守卫
                : null
            }
            index={currentIndex}
          />
        </GridItem>
      </Grid>
    </Box>
  );
}
