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
  Portal,
  Progress,
  Card,
  CardBody
} from "@chakra-ui/react";

import type { Feature, FeatureCollection, LineString, Geometry } from "geojson";
import { toaster } from "../../components/ui/toaster";


import {
  fetchProjectDetail,
  fetchProjectAttributes,
  fetchProjectGeoJSON,
  fetchAttributeMappings,
} from "../../api";

import type { AttributeRow } from "../../api";
import { autocodeImage, autocodeGIS, autocodeAll } from "../../api";


import ImagePanel from "./components/ImagePanel";
import AttributesPanel from "./components/AttributesPanel";
import GeoDataPanel from "./components/GeoDataPanel"; // ← 用你之前的组件（保持文件名/路径）
import { saveAttributes } from "../../api";


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

  const [autoCoding, setAutoCoding] = useState(false);
  const [autoCodeMsg, setAutoCodeMsg] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  // Track which fields were changed by auto-coding for each row
  const [changedFieldsByRow, setChangedFieldsByRow] = useState<Record<number, string[]>>({});
  // Track the source (CV/GIS) for each changed field
  const [fieldSourcesByRow, setFieldSourcesByRow] = useState<Record<number, Record<string, string>>>({});

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

  // ✅ 补：当前要素（LineString），便于统一读取
  const currentFeature = useMemo<Feature | null>(() => {
    return geoFeatures[currentIndex] ?? null;
  }, [geoFeatures, currentIndex]);

  // ✅ 补：当前图片引用（多兜底：优先 attrs，其次 feature.properties）
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

    // 关键：返回 undefined（而不是 null）
    return (fromAttr ?? fromFeature) || undefined;
  }, [attrs, currentIndex, currentFeature]);

  // ✅ 补：把 { 字段名: 数值代码 } 合并到“当前行”
  const applyUpdatesToCurrentRow = useCallback(
    (updates: Record<string, number | string | boolean | null>) => {
      if (!updates || Object.keys(updates).length === 0) return;
      setAttrs((prev) => {
        const copy = [...prev];
        if (copy[currentIndex]) {
          copy[currentIndex] = { ...copy[currentIndex], ...updates };
        }
        return copy;
      });
    },
    [setAttrs, currentIndex]
  );

  // ✅ 监听：仅对当前记录进行自动编码（先 CV 后 GIS，再合并）
  useEffect(() => {
    // 这里假设你已有 `name`（项目名）。如果变量名不同，请替换。
    // 需要保证：name、imgRef、currentFeature（LineString）都准备好。
    if (!name) return;

    const handler = async () => {
      if (autoCoding) return; // ✅ guard: already running

      try {
        setAutoCoding(true);
        setAutoCodeMsg("Starting…");
        setProgress(5);

        if (!imgRef) throw new Error("Missing imageRef");
        if (!currentFeature || currentFeature.geometry?.type !== "LineString") {
          throw new Error("Missing LineString geometry");
        }
        const line = (currentFeature.geometry as LineString).coordinates;

        setAutoCodeMsg("Running Computer Vision…");
        setProgress(35);
        const cvPromise = autocodeImage(name, imgRef);

        setAutoCodeMsg("Running GIS rules…");
        setProgress(65);
        const gisPromise = autocodeGIS(name, line);

        const [cv, g] = await Promise.all([cvPromise, gisPromise]);

        setAutoCodeMsg("Merging updates…");
        setProgress(85);
        const merged = { ...(cv?.updates ?? {}), ...(g?.updates ?? {}) };

        // Track changed fields from both CV and GIS
        const cvChanged = cv?.changed_fields ?? [];
        const gisChanged = g?.changed_fields ?? [];
        const allChanged = [...new Set([...cvChanged, ...gisChanged])];

        // Build field sources mapping
        const fieldSources: Record<string, string> = {};
        cvChanged.forEach(field => { fieldSources[field] = "CV"; });
        gisChanged.forEach(field => { fieldSources[field] = "GIS"; }); // GIS overrides CV

        // Update changed fields tracking for current row
        setChangedFieldsByRow(prev => ({
          ...prev,
          [currentIndex]: allChanged
        }));

        // Update field sources tracking for current row
        setFieldSourcesByRow(prev => ({
          ...prev,
          [currentIndex]: fieldSources
        }));

        applyUpdatesToCurrentRow(merged);

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
        // 稍微停 300ms 让 100% 有个完成感
        setTimeout(() => { setAutoCoding(false); setAutoCodeMsg(""); setProgress(0); }, 300);
      }
    };



    // 事件名：你可以在别处 window.dispatchEvent(new Event("psat:autocode:one"))
    window.addEventListener("psat:autocode:one", handler);
    return () => window.removeEventListener("psat:autocode:one", handler);
  }, [name, imgRef, currentFeature, applyUpdatesToCurrentRow, currentIndex, autoCoding]);

  // ✅ 监听：一键（可让后端顺带保存）。
  // 如果你暂时不想后端保存，把 autocodeAll 改成前端串行调用 image+gis 即可。
  useEffect(() => {
    if (!name) return;

    const handler = async () => {
      if (autoCoding) return;
      try {
        setAutoCoding(true);
        setAutoCodeMsg("CV + GIS for all records…");
        setProgress(10);

        // ✅ 批量模式：让后端对整个项目逐行处理并保存
        const r = await autocodeAll(name, { all: true, save: true });

        // r 是 bulk 结果：{ saved, total, ok, fail, errors, changed_by_row, sources_by_row }
        setProgress(90);

        // Update changed fields tracking if available
        if ("changed_by_row" in r && r.changed_by_row) {
          setChangedFieldsByRow(r.changed_by_row);
        }

        // Update field sources tracking if available
        if ("sources_by_row" in r && r.sources_by_row) {
          setFieldSourcesByRow(r.sources_by_row);
        }

        // 批量后一般需要重拉 attributes 才能看到更新
        try {
          const a = (await fetchProjectAttributes(name)) as { rows: AttributeRow[] };
          setAttrs(a?.rows ?? []);
        } catch {
          // 可忽略，UI 仍然会提示
        }

        setProgress(100);
        setAutoCodeMsg("Completed");
        // 结果提示
        if ("total" in r) {
          // Log errors to console for debugging
          if (r.fail > 0 && r.errors && r.errors.length > 0) {
            console.error("Auto-coding errors:", r.errors);
          }

          toaster.create({
            title: "Auto-code (all) done",
            description: `Total: ${r.total}, OK: ${r.ok}, Failed: ${r.fail}${r.fail > 0 ? " (check console for details)" : ""}`,
            type: r.fail > 0 ? "warning" : "success",
          });
        } else {
          // （防守分支，几乎不会走到）
          toaster.create({
            title: "Auto-code (all) done",
            description: r?.saved ? "Updated & saved." : "Updated (unsaved).",
            type: "success",
          });
        }
      } catch (e: any) {
        toaster.create({
          title: "Auto-code failed",
          description: String(e?.message ?? e),
          type: "error",
        });
      } finally {
        setTimeout(() => { setAutoCoding(false); setAutoCodeMsg(""); setProgress(0); }, 300);
      }
    };

    // 事件名：window.dispatchEvent(new Event("psat:autocode:all"))
    window.addEventListener("psat:autocode:all", handler);
    return () => window.removeEventListener("psat:autocode:all", handler);
  }, [name, autoCoding]);



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

  // 保存
  useEffect(() => {
    function handleSave() {
      if (!name || !attrs) return;
      saveAttributes(name, attrs)
        .then(() => toaster.create({ title: "Saved", description: "Attributes persisted.", type: "success" }))
        .catch((e) => toaster.create({ title: "Save failed", description: String(e?.message ?? e), type: "error" }));
    }

    window.addEventListener("psat:save", handleSave);
    return () => window.removeEventListener("psat:save", handleSave);
  }, [name, attrs]);

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

  const editCurrentAttr = (field: string, value: string | number | boolean | null) => {
    if (!attrs) return;
    setAttrs(prev => {
      if (!prev) return prev;
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], [field]: value };
      return next;
    });
  };

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
          {/* 顶部可控进度条（Chakra v3 语法） */}
          <Progress.Root
            value={progress}         // 受控
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
            {/* 可选：右上角展示百分比 */}
            {/* <Progress.ValueText /> */}
          </Progress.Root>


          {/* 中央卡片 */}
          <Flex minH="100vh" align="center" justify="center" p="4">
            <Card.Root shadow="lg" borderRadius="2xl" maxW="sm" w="full">
              <CardBody>
                <Flex align="center" gap="3">
                  <Spinner />
                  <Box>
                    <Text fontWeight="bold">Auto-coding…</Text>
                    <Text fontSize="sm" color="gray.600">
                      {autoCodeMsg || "Please wait while models run."}
                    </Text>
                  </Box>
                </Flex>
              </CardBody>
            </Card.Root>
          </Flex>
        </Box>
      </Portal>
    )}

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
        <GridItem
          display="flex"
          flexDirection="column"
          minH={`${PANEL_HEIGHT}px`} // 右侧总高度至少与左侧面板一致
        >
          {/* 面板容器：占据剩余空间，允许内部滚动 */}
          <Box flex="1 1 auto" minH={0} >
            <AttributesPanel
              row={editedRow}
              mappings={attrMappings}
              panelHeight={PANEL_HEIGHT - CONTROLS_H} // 保持你原来的传值
              onChange={onAttrChange}
              onEdit={editCurrentAttr}
              changedFields={changedFieldsByRow[currentIndex] || []}
              fieldSources={fieldSourcesByRow[currentIndex] || {}}
            />
          </Box>

          {/* 底部按钮条：固定在列底，避免被内容覆盖 */}
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
            bg="bg"              // Chakra v3 语义色，防止半透明内容“透”下来
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
            onJump={(i) => setCurrentPage(i + 1)}  
          />
        </GridItem>
      </Grid>
    </Box>
  );
}
