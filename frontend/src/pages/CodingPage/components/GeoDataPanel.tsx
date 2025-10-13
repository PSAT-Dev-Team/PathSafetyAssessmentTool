import { Card, CardHeader, CardBody, Heading, Text, Box, Kbd } from "@chakra-ui/react";
import { Tooltip } from "../../../components/ui/tooltip";
import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

type Props = {
  feature: Feature<LineString, any> | null; // 当前段（父组件已传）
  index: number;                             // 当前页（0-based by parent usage）
};

type GJ = FeatureCollection<LineString, any>;

const PADDING = 24;        // 画布留白
const INITIAL_SCALE = 1;   // 初始缩放
const MIN_SCALE = 0.5;
const MAX_SCALE = 10;

export default function GeoDataPanel({ feature, index }: Props) {
  // 从路由拿项目名（不改父组件）
  const { projectName } = useParams<{ projectName: string }>();
  const decodedName = useMemo(() => {
    if (!projectName) return null;
    try { return decodeURIComponent(projectName); } catch { return projectName; }
  }, [projectName]);

  const [fc, setFc] = useState<GJ | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  // 交互状态：缩放和平移（在画布坐标系中）
  const [scale, setScale] = useState<number>(INITIAL_SCALE);
  const [translate, setTranslate] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // 拉取整条 geodata（不改其它文件）
  useEffect(() => {
    if (!decodedName) return;
    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/projects/${encodeURIComponent(decodedName)}/geodata`);
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
        const data = (await res.json()) as GJ;
        if (!aborted) setFc(data);
      } catch (e: any) {
        if (!aborted) setErr(e?.message ?? "Failed to load geodata");
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [decodedName]);

  // 从 FeatureCollection 中提取每条 LineString 的「起点」
  const points = useMemo(() => {
    if (!fc) return [];
    const arr: { idx: number; p: Position; f: Feature<LineString, any> }[] = [];
    fc.features.forEach((f, i) => {
      if (f.geometry?.type === "LineString" && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length > 0) {
        arr.push({ idx: i, p: f.geometry.coordinates[0], f });
      }
    });
    return arr;
  }, [fc]);

  // 计算边界框（用于把 EPSG:3414 映射到 SVG 像素）
  const bbox = useMemo(() => {
    if (points.length === 0) return null;
    let minX = +Infinity, maxX = -Infinity, minY = +Infinity, maxY = -Infinity;
    for (const { p } of points) {
      const [x, y] = p;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }, [points]);

  // 把 geo 坐标映射到画布坐标（保持比例，Y 轴翻转到屏幕）
  const view = { w: 500, h: 320 }; // 固定面板高度，适配你当前卡片布局
  const projector = useMemo(() => {
    if (!bbox) return null;
    const spanX = Math.max(1, bbox.maxX - bbox.minX);
    const spanY = Math.max(1, bbox.maxY - bbox.minY);
    // 目标绘图区（去掉 padding）
    const targetW = view.w - PADDING * 2;
    const targetH = view.h - PADDING * 2;
    const base = Math.min(targetW / spanX, targetH / spanY);
    const sx = base; // 同比缩放
    const sy = base;

    // 注意：屏幕 y 向下；SVY21 y 向上 → 这里做翻转映射
    const project = (pos: Position) => {
      const [x, y] = pos;
      const px = (x - bbox.minX) * sx + PADDING;
      const py = targetH - (y - bbox.minY) * sy + PADDING; // y 翻转
      return { x: px, y: py };
    };
    return { project, baseScale: base };
  }, [bbox]);

  // 高亮的 current 点
  const highlightPt = useMemo(() => {
    if (!projector || points.length === 0) return null;
    const found = points.find(p => p.idx === index);
    if (!found) return null;
    return { idx: found.idx, ...projector.project(found.p), f: found.f };
  }, [projector, points, index]);

  // 缩放：基于鼠标位置进行缩放，并更新平移使得缩放以鼠标为中心
  const onWheel: React.WheelEventHandler<SVGSVGElement> = (e) => {
    if (!projector) return;
    e.preventDefault();
    const delta = -e.deltaY; // 向上滚 = 放大
    const factor = Math.exp(delta * 0.0015); // 平滑缩放
    setScale(s => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor));
      // 以鼠标位置为中心缩放：更新 translate
      const rect = (e.target as SVGSVGElement).getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setTranslate(t => ({
        x: cx - (cx - t.x) * (next / s),
        y: cy - (cy - t.y) * (next / s),
      }));
      return next;
    });
  };

  // 拖拽平移
  const onPointerDown: React.PointerEventHandler<SVGSVGElement> = (e) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove: React.PointerEventHandler<SVGSVGElement> = (e) => {
    if (!dragging.current || !last.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setTranslate(t => ({ x: t.x + dx, y: t.y + dy }));
  };
  const onPointerUp: React.PointerEventHandler<SVGSVGElement> = (e) => {
    dragging.current = false;
    last.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <Card.Root>
      <CardHeader>
        <Heading size="sm">Geodata Map (index #{index})</Heading>
        <Text mt="1" color="gray.500" fontSize="sm">
          {feature
            ? <>id: {feature.id ?? "-"} · Road: {feature.properties?.["Road Name"] ?? "-"} · Distance (m): {feature.properties?.["Distance (Metres)"] ?? "-"}</>
            : <>No current feature</>}
        </Text>
      </CardHeader>

      <CardBody>
        {loading && <Text color="gray.500">Loading map…</Text>}
        {err && <Text color="red.600">Failed: {err}</Text>}

        {!loading && !err && projector && (
          <Box
            border="1px solid"
            borderColor="gray.200"
            borderRadius="md"
            bg="white"
            w="100%"
            style={{ maxWidth: "100%" }}
          >
            <svg
              width="100%"
              height={view.h}
              viewBox={`0 0 ${view.w} ${view.h}`}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{ cursor: dragging.current ? "grabbing" : "grab", touchAction: "none", userSelect: "none", display: "block" }}
            >
              {/* 背景网格（淡淡的） */}
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect x="0" y="0" width={view.w} height={view.h} fill="url(#grid)" />

              {/* 平移缩放容器 */}
              <g transform={`translate(${translate.x},${translate.y}) scale(${scale})`}>
                {/* 所有点 */}
                {points.map(({ idx, p, f }) => {
                  const { x, y } = projector.project(p);
                  const isActive = idx === index;
                  const r = isActive ? 6 : 3;
                  const stroke = isActive ? "black" : "none";
                  const fill = isActive ? "#FF6B6B" : "#3B82F6"; // 高亮红/普通蓝（不改主题）
                  const title = `#${idx} ${f.properties?.["Image Reference"] ?? ""}`;
                  return (
                    <Tooltip key={idx} content={title}>
                      <circle cx={x} cy={y} r={r} stroke={stroke} strokeWidth={1} fill={fill} />
                    </Tooltip>
                  );
                })}

                {/* 当前段注记 */}
                {highlightPt && (
                  <>
                    <circle cx={highlightPt.x} cy={highlightPt.y} r={10} fill="none" stroke="#FF6B6B" strokeWidth={2} />
                    <text x={highlightPt.x + 12} y={highlightPt.y - 8} fontSize="10" fill="#1F2937" stroke="white" strokeWidth="2">
                      #{highlightPt.idx}
                    </text>
                    <text x={highlightPt.x + 12} y={highlightPt.y - 8} fontSize="10" fill="#1F2937">
                      #{highlightPt.idx}
                    </text>
                  </>
                )}
              </g>
            </svg>

            <Box p="2" display="flex" gap="3" alignItems="center">
              <Text fontSize="xs" color="gray.600">
                <Kbd>Wheel</Kbd> zoom · drag to pan
              </Text>
              <Text fontSize="xs" color="gray.500" ml="auto">
                Points = LineString start; CRS: EPSG:3414
              </Text>
            </Box>
          </Box>
        )}

        {!loading && !err && !projector && (
          <Text color="gray.500">No geodata to show.</Text>
        )}
      </CardBody>
    </Card.Root>
  );
}
