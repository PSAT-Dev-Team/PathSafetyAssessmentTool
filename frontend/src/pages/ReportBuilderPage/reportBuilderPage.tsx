import { useState, useRef, useEffect, useCallback } from "react";
import { Rnd } from "react-rnd";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useNavigate } from "react-router-dom";
import "./reportBuilderPage.css";

const CANVAS_W = 794;
const CANVAS_H = 1620;
const CANVAS_PAGE_H = 1123;

const RISK_COLORS: Record<number, string> = {
  1: "#87C424", 2: "#FFCC1A", 3: "#FF5B1A", 4: "#CD1AFF",
};
const RISK_LABELS: Record<number, string> = {
  1: "Low", 2: "Medium", 3: "High", 4: "Extreme",
};
const CRASH_TYPE_LABELS: Record<string, string> = {
  Overall: "Overall Risk", VB: "Vehicle–Bicycle", BB: "Bicycle–Bicycle",
  SB: "Single-Bicycle", BP: "Bicycle–Pedestrian",
};

type ElementType = "title" | "riskBands" | "map" | "summary" | "topRisk";
type ViewMode = "list" | "grid" | "tabular";

interface ElementState {
  id: string; type: ElementType; label: string;
  x: number; y: number; width: number; height: number;
  visible: boolean; viewMode?: ViewMode; topN?: number;
}

type BandDist = Record<number, number>;
interface Distributions {
  VB: BandDist; BB: BandDist; SB: BandDist; BP: BandDist; Overall: BandDist;
}

interface TopRiskRow {
  _project: string; _segIndex: number; _maxScore: number; _maxBand: number;
  VB: number; "VB Band": number; BB: number; "BB Band": number;
  SB: number; "SB Band": number; BP: number; "BP Band": number;
}

interface EnrichedDetail {
  imageUrl?: string;
  topAttributes: { name: string; multiplier: number }[];
}

const DEFAULT_ELEMENTS: ElementState[] = [
  { id: "title",     type: "title",     label: "Title",             x: 20, y: 20,   width: 754, height: 85,  visible: true },
  { id: "riskBands", type: "riskBands", label: "Risk Bands",        x: 20, y: 120,  width: 754, height: 400, visible: true },
  { id: "map",       type: "map",       label: "Map",               x: 20, y: 535,  width: 754, height: 260, visible: true },
  { id: "summary",   type: "summary",   label: "Summary",           x: 20, y: 808,  width: 754, height: 90,  visible: true },
  { id: "topRisk",   type: "topRisk",   label: "Top Risk Stretches",x: 20, y: 1155, width: 754, height: 435, visible: true, viewMode: "tabular", topN: 10 },
];

const thStyle: React.CSSProperties = {
  padding: "5px 8px", textAlign: "left", fontWeight: 600,
  fontSize: 10, color: "#555", borderBottom: "2px solid #e0d0f0", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "3px 6px", fontSize: 10, color: "#333" };

// ── Reusable image thumbnail ─────────────────────────────────────────────────
function SegmentImage({ src, width, height }: { src?: string; width: number; height: number }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div style={{ width, height, background: "#eee", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "#bbb" }}>No image</span>
      </div>
    );
  }
  return (
    <img
      src={src} alt="" onError={() => setErrored(true)}
      style={{ width, height, objectFit: "cover", borderRadius: 3, flexShrink: 0 }}
    />
  );
}

// ── Attribute tag ────────────────────────────────────────────────────────────
function AttrTag({ name, multiplier }: { name: string; multiplier: number }) {
  return (
    <span style={{ fontSize: 9, color: "#555", display: "block", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      • {name} <span style={{ color: "#cc2200", fontWeight: 700 }}>×{multiplier}</span>
    </span>
  );
}

export default function ReportBuilderPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<ElementState[]>(DEFAULT_ELEMENTS);
  const [loadedProjects, setLoadedProjects] = useState<string[]>([]);
  const [distributions, setDistributions] = useState<Distributions | null>(null);
  const [totalSegments, setTotalSegments] = useState(0);
  const [topRiskRows, setTopRiskRows] = useState<TopRiskRow[]>([]);
  const [enrichedMap, setEnrichedMap] = useState<Map<string, EnrichedDetail>>(new Map());
  const [exporting, setExporting] = useState<"pdf" | "word" | null>(null);

  // ── Load projects from session storage ──────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("pathAnalysis_loadedProjects");
    if (stored) setLoadedProjects(JSON.parse(stored));
  }, []);

  // ── Fetch score data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadedProjects.length === 0) return;
    const fetchAll = async () => {
      const results = await Promise.all(
        loadedProjects.map(async (name) => {
          try {
            const res = await fetch(`/api/projects/${encodeURIComponent(name)}/results`);
            const data = await res.json();
            if (!data.ok || !Array.isArray(data.result_rows)) return [];
            return data.result_rows.map((row: any, i: number) => ({
              ...row, _project: name, _segIndex: i + 1,
            }));
          } catch { return []; }
        })
      );
      const allRows: any[] = results.flat();
      setTotalSegments(allRows.length);
      if (allRows.length === 0) return;

      const dist: Distributions = {
        VB: { 1: 0, 2: 0, 3: 0, 4: 0 }, BB: { 1: 0, 2: 0, 3: 0, 4: 0 },
        SB: { 1: 0, 2: 0, 3: 0, 4: 0 }, BP: { 1: 0, 2: 0, 3: 0, 4: 0 },
        Overall: { 1: 0, 2: 0, 3: 0, 4: 0 },
      };
      allRows.forEach((row) => {
        if (row["VB Band"] >= 1 && row["VB Band"] <= 4) dist.VB[row["VB Band"]]++;
        if (row["BB Band"] >= 1 && row["BB Band"] <= 4) dist.BB[row["BB Band"]]++;
        if (row["SB Band"] >= 1 && row["SB Band"] <= 4) dist.SB[row["SB Band"]]++;
        if (row["BP Band"] >= 1 && row["BP Band"] <= 4) dist.BP[row["BP Band"]]++;
        const max = Math.max(row["VB"] || 0, row["BB"] || 0, row["SB"] || 0, row["BP"] || 0);
        const band = max < 10 ? 1 : max <= 25 ? 2 : max <= 60 ? 3 : 4;
        dist.Overall[band]++;
      });
      setDistributions(dist);

      const ranked = allRows
        .map((row) => {
          const maxScore = Math.max(row["VB"] || 0, row["BB"] || 0, row["SB"] || 0, row["BP"] || 0);
          const maxBand = maxScore < 10 ? 1 : maxScore <= 25 ? 2 : maxScore <= 60 ? 3 : 4;
          return { ...row, _maxScore: maxScore, _maxBand: maxBand } as TopRiskRow;
        })
        .sort((a, b) => b._maxScore - a._maxScore)
        .slice(0, 10);
      setTopRiskRows(ranked);
    };
    fetchAll();
  }, [loadedProjects]);

  // ── Enrich top-risk rows with images + contributing attributes ──────────────
  useEffect(() => {
    if (topRiskRows.length === 0) return;
    const fetchEnriched = async () => {
      try {
        const res = await fetch("/api/report/segment-details", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segments: topRiskRows.map((r) => ({ project: r._project, segIndex: r._segIndex })),
          }),
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.details)) {
          const map = new Map<string, EnrichedDetail>();
          data.details.forEach((d: any) => {
            map.set(`${d.project}_${d.segIndex}`, {
              imageUrl: d.imageUrl ?? undefined,
              topAttributes: d.topAttributes || [],
            });
          });
          setEnrichedMap(map);
        }
      } catch (err) {
        console.error("Failed to fetch segment details:", err);
      }
    };
    fetchEnriched();
  }, [topRiskRows]);

  // ── Element state helpers ────────────────────────────────────────────────────
  const updateElement = useCallback((id: string, changes: Partial<ElementState>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...changes } : el)));
  }, []);
  const hideElement = useCallback((id: string) => updateElement(id, { visible: false }), [updateElement]);
  const showElement  = useCallback((id: string) => updateElement(id, { visible: true }),  [updateElement]);

  const getEnriched = (row: TopRiskRow): EnrichedDetail =>
    enrichedMap.get(`${row._project}_${row._segIndex}`) ?? { topAttributes: [] };

  // ── PDF export (multi-page) ──────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (!canvasRef.current) return;
    setExporting("pdf");
    try {
      const captured = await html2canvas(canvasRef.current, {
        scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff",
      });
      const imgData = captured.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = 210, pdfH = 297;
      const imgH = (captured.height * pdfW) / captured.width;
      let remaining = imgH, yPos = 0;
      pdf.addImage(imgData, "PNG", 0, yPos, pdfW, imgH);
      remaining -= pdfH;
      while (remaining > 0) {
        yPos -= pdfH; pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, yPos, pdfW, imgH);
        remaining -= pdfH;
      }
      pdf.save("PSAT_Report.pdf");
    } catch (err) { console.error("PDF export failed:", err); }
    finally { setExporting(null); }
  };

  // ── Word export ──────────────────────────────────────────────────────────────
  const handleDownloadWord = async () => {
    setExporting("word");
    const topRiskEl = elements.find((e) => e.id === "topRisk");
    const topN = topRiskEl?.topN ?? 10;
    try {
      const res = await fetch("/api/report/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedProjects: loadedProjects,
          elements: elements.filter((el) => el.visible),
          scoreData: distributions,
          totalSegments,
          topRiskRows: topRiskRows.slice(0, topN),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "PSAT_Report.docx";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { console.error("Word export failed:", err); }
    finally { setExporting(null); }
  };

  // ── Shared renderers ─────────────────────────────────────────────────────────
  const renderBandBars = (dist: BandDist, total: number) => {
    if (total === 0) return <div style={{ color: "#888", fontSize: 11 }}>No data</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {[1, 2, 3, 4].map((band) => {
          const count = dist[band] || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={band} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 52, fontSize: 10, color: "#555", textAlign: "right", flexShrink: 0 }}>{RISK_LABELS[band]}</div>
              <div style={{ flex: 1, background: "#f0f0f0", borderRadius: 3, height: 13, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, background: RISK_COLORS[band], height: "100%" }} />
              </div>
              <div style={{ width: 60, fontSize: 10, color: "#555", flexShrink: 0 }}>
                {count} <span style={{ color: "#999" }}>({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBandBadge = (band: number, short = false) => (
    <span style={{
      display: "inline-block", padding: short ? "1px 4px" : "1px 6px", borderRadius: 3,
      fontSize: short ? 9 : 10, fontWeight: 600,
      background: RISK_COLORS[band] || "#eee", color: band === 2 ? "#333" : "#fff",
    }}>
      {short
        ? (RISK_LABELS[band]?.slice(0, 3).toUpperCase() ?? "—")
        : (RISK_LABELS[band] ?? "—")}
    </span>
  );

  // ── View-toggle bar inside topRisk element ───────────────────────────────────
  const renderViewToggle = (el: ElementState) => {
    const topN = el.topN ?? 10;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderBottom: "1px solid #ede8f5", background: "#faf8fd", flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#aaa", marginRight: 2 }}>View:</span>
        {(["list", "grid", "tabular"] as ViewMode[]).map((mode) => {
          const active = (el.viewMode || "tabular") === mode;
          return (
            <button key={mode} style={{ padding: "2px 9px", borderRadius: 10, border: `1px solid ${active ? "#a020d0" : "#ddd"}`, background: active ? "#f0e4f8" : "#fff", color: active ? "#a020d0" : "#777", cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 400 }}
              onClick={(e) => { e.stopPropagation(); updateElement(el.id, { viewMode: mode }); }}
              onMouseDown={(e) => e.stopPropagation()}>
              {mode === "list" ? "List" : mode === "grid" ? "Grid" : "Tabular"}
            </button>
          );
        })}
        <span style={{ marginLeft: 10, fontSize: 10, color: "#aaa" }}>Show:</span>
        {[3, 5, 7, 10].map((n) => {
          const active = topN === n;
          return (
            <button key={n} style={{ padding: "2px 7px", borderRadius: 10, border: `1px solid ${active ? "#a020d0" : "#ddd"}`, background: active ? "#f0e4f8" : "#fff", color: active ? "#a020d0" : "#777", cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 400 }}
              onClick={(e) => { e.stopPropagation(); updateElement(el.id, { topN: n }); }}
              onMouseDown={(e) => e.stopPropagation()}>
              {n}
            </button>
          );
        })}
        <input type="number" min={3} max={10} value={topN}
          style={{ width: 38, padding: "1px 4px", borderRadius: 4, border: "1px solid #ddd", fontSize: 10, color: "#555", textAlign: "center" }}
          onChange={(e) => { const v = Math.min(10, Math.max(3, parseInt(e.target.value) || 3)); updateElement(el.id, { topN: v }); }}
          onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
        <span style={{ fontSize: 10, color: "#ccc" }}>stretches</span>
      </div>
    );
  };

  // ── Top Risk views ───────────────────────────────────────────────────────────
  const renderTopRiskList = (rows: TopRiskRow[]) => (
    <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
      {rows.map((row, i) => {
        const enriched = getEnriched(row);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ width: 22, fontSize: 11, fontWeight: 700, color: "#888", flexShrink: 0 }}>#{i + 1}</span>

            <SegmentImage src={enriched.imageUrl} width={72} height={50} />

            <div style={{ width: 100, flexShrink: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row._project}</div>
              <div style={{ fontSize: 10, color: "#777" }}>Seg {row._segIndex}</div>
            </div>

            {/* Score */}
            <div style={{ width: 44, textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#222", lineHeight: 1 }}>{row._maxScore.toFixed(1)}</div>
              <div style={{ fontSize: 8, color: "#aaa" }}>score</div>
            </div>

            {/* Top 3 contributing attributes */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              {enriched.topAttributes.length > 0
                ? enriched.topAttributes.map((a, j) => <AttrTag key={j} name={a.name} multiplier={a.multiplier} />)
                : <span style={{ fontSize: 9, color: "#bbb" }}>—</span>}
            </div>

            {/* Band badges */}
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              {(["VB", "BB", "SB", "BP"] as const).map((ct) => (
                <div key={ct} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#aaa", marginBottom: 1 }}>{ct}</div>
                  {renderBandBadge(row[`${ct} Band` as keyof TopRiskRow] as number, true)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTopRiskGrid = (rows: TopRiskRow[]) => (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, alignContent: "start" }}>
      {rows.map((row, i) => {
        const enriched = getEnriched(row);
        return (
          <div key={i} style={{ border: `2px solid ${RISK_COLORS[row._maxBand] || "#ddd"}`, borderRadius: 6, background: "#fff", overflow: "hidden" }}>
            <SegmentImage src={enriched.imageUrl} width={999} height={85} />
            <div style={{ padding: "7px 9px" }}>
              <div style={{ fontSize: 9, color: "#bbb" }}>Rank #{i + 1}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row._project}</div>
              <div style={{ fontSize: 10, color: "#777", marginBottom: 5 }}>Segment {row._segIndex}</div>

              {/* Score + overall band */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#222" }}>{row._maxScore.toFixed(1)}</span>
                {renderBandBadge(row._maxBand)}
              </div>

              {/* Top 3 attributes */}
              <div style={{ marginBottom: 6 }}>
                {enriched.topAttributes.length > 0
                  ? enriched.topAttributes.map((a, j) => <AttrTag key={j} name={a.name} multiplier={a.multiplier} />)
                  : <span style={{ fontSize: 9, color: "#bbb" }}>No risk attributes</span>}
              </div>

              {/* Crash type bands 2×2 grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 4px" }}>
                {(["VB", "BB", "SB", "BP"] as const).map((ct) => (
                  <div key={ct} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 8, color: "#888", width: 16 }}>{ct}</span>
                    {renderBandBadge(row[`${ct} Band` as keyof TopRiskRow] as number, true)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTopRiskTabular = (rows: TopRiskRow[]) => (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
        <thead>
          <tr style={{ background: "#f5f0fa", position: "sticky", top: 0, zIndex: 1 }}>
            <th style={{ ...thStyle, width: 24 }}>#</th>
            <th style={{ ...thStyle, width: 60 }}>Image</th>
            <th style={{ ...thStyle, width: 110 }}>Project</th>
            <th style={{ ...thStyle, width: 32 }}>Seg</th>
            <th style={{ ...thStyle, width: 44 }}>Score</th>
            <th style={{ ...thStyle }}>Top 3 Contributing Attributes</th>
            <th style={{ ...thStyle, width: 36, textAlign: "center" }}>VB</th>
            <th style={{ ...thStyle, width: 36, textAlign: "center" }}>BB</th>
            <th style={{ ...thStyle, width: 36, textAlign: "center" }}>SB</th>
            <th style={{ ...thStyle, width: 36, textAlign: "center" }}>BP</th>
            <th style={{ ...thStyle, width: 44, textAlign: "center" }}>Overall</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const enriched = getEnriched(row);
            return (
              <tr key={i} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#888" }}>{i + 1}</td>
                <td style={{ padding: "4px 6px" }}>
                  <SegmentImage src={enriched.imageUrl} width={55} height={38} />
                </td>
                <td style={{ ...tdStyle, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row._project}</td>
                <td style={tdStyle}>{row._segIndex}</td>
                <td style={{ ...tdStyle, fontWeight: 700, fontSize: 12 }}>{row._maxScore.toFixed(1)}</td>
                <td style={{ ...tdStyle, maxWidth: 200 }}>
                  {enriched.topAttributes.length > 0
                    ? enriched.topAttributes.map((a, j) => <AttrTag key={j} name={a.name} multiplier={a.multiplier} />)
                    : <span style={{ color: "#bbb" }}>—</span>}
                </td>
                {(["VB", "BB", "SB", "BP"] as const).map((ct) => (
                  <td key={ct} style={{ ...tdStyle, textAlign: "center", padding: "3px 2px" }}>
                    {renderBandBadge(row[`${ct} Band` as keyof TopRiskRow] as number, true)}
                  </td>
                ))}
                <td style={{ ...tdStyle, textAlign: "center", padding: "3px 2px" }}>
                  {renderBandBadge(row._maxBand, true)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // ── Element content ──────────────────────────────────────────────────────────
  const renderContent = (el: ElementState) => {
    switch (el.type) {
      case "title":
        return (
          <div style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginBottom: 5 }}>Path Analysis Executive Summary</div>
            <div style={{ fontSize: 13, color: "#555" }}><strong>Projects:</strong> {loadedProjects.length > 0 ? loadedProjects.join(", ") : "—"}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
              Generated: {new Date().toLocaleDateString("en-SG", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </div>
        );

      case "riskBands":
        return (
          <div style={{ padding: "10px 14px", height: "calc(100% - 30px)", overflowY: "auto" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", marginBottom: 10 }}>Risk Band Distribution</div>
            {!distributions ? <div style={{ color: "#888", fontSize: 12 }}>Loading…</div> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px 20px" }}>
                {(["Overall", "VB", "BB", "SB", "BP"] as const).map((type) => {
                  const dist = distributions[type];
                  const total = Object.values(dist).reduce((s, v) => s + v, 0);
                  return (
                    <div key={type}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#444", marginBottom: 5, borderBottom: "1px solid #eee", paddingBottom: 3 }}>{CRASH_TYPE_LABELS[type]}</div>
                      {renderBandBars(dist, total)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case "map":
        return (
          <div style={{ height: "calc(100% - 30px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f7f7f7", border: "2px dashed #ccc", borderRadius: 4, margin: 4, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>Map View</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 6, maxWidth: 320, lineHeight: 1.5 }}>
              Screenshot the map from the Path Analysis page and paste it into your Word document, or insert a map image here.
            </div>
          </div>
        );

      case "summary":
        return (
          <div style={{ padding: "12px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", marginBottom: 10 }}>Summary</div>
            <div style={{ display: "flex", gap: 32 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#a020d0" }}>{loadedProjects.length}</div>
                <div style={{ fontSize: 11, color: "#666" }}>Projects</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#a020d0" }}>{totalSegments}</div>
                <div style={{ fontSize: 11, color: "#666" }}>Total Segments</div>
              </div>
            </div>
          </div>
        );

      case "topRisk": {
        const viewMode = el.viewMode || "tabular";
        const displayRows = topRiskRows.slice(0, el.topN ?? 10);
        const noData = displayRows.length === 0;

        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "8px 12px 2px", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>Top Risk Stretches</div>
              <div style={{ fontSize: 10, color: "#999" }}>Ranked highest to lowest · includes image, score and top 3 contributing attributes</div>
            </div>
            {renderViewToggle(el)}
            {noData
              ? <div style={{ padding: 14, color: "#888", fontSize: 12 }}>No segment score data. Run scoring first.</div>
              : viewMode === "list"    ? renderTopRiskList(displayRows)
              : viewMode === "grid"    ? renderTopRiskGrid(displayRows)
              :                          renderTopRiskTabular(displayRows)
            }
          </div>
        );
      }

      default: return null;
    }
  };

  // ── Page ─────────────────────────────────────────────────────────────────────
  return (
    <div className="rb-page">
      <div className="rb-toolbar">
        <button className="rb-btn rb-btn-secondary" onClick={() => navigate("/analysis/path")}>← Back</button>
        <div className="rb-toggle-group">
          <span className="rb-toggle-label">Elements:</span>
          {elements.map((el) => (
            <button key={el.id} className={`rb-toggle ${el.visible ? "rb-toggle-on" : ""}`}
              onClick={() => el.visible ? hideElement(el.id) : showElement(el.id)}>
              {el.visible ? "✓ " : ""}{el.label}
            </button>
          ))}
        </div>
        <div className="rb-export-group">
          <button className="rb-btn" onClick={handleDownloadPDF} disabled={!!exporting}>{exporting === "pdf" ? "Generating…" : "↓ PDF"}</button>
          <button className="rb-btn rb-btn-primary" onClick={handleDownloadWord} disabled={!!exporting}>{exporting === "word" ? "Generating…" : "↓ Word"}</button>
        </div>
      </div>

      <div className="rb-canvas-container">
        <div className="rb-canvas-hint">Drag elements by their purple handle · Resize from edges/corners · Toggle visibility above · Export when ready</div>
        <div ref={canvasRef} className="rb-canvas" style={{ width: CANVAS_W, height: CANVAS_H }}>
          {/* Page break indicator */}
          <div style={{ position: "absolute", top: CANVAS_PAGE_H, left: 0, right: 0, height: 1, background: "repeating-linear-gradient(90deg,#c090e0 0px,#c090e0 8px,transparent 8px,transparent 16px)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: CANVAS_PAGE_H + 3, right: 8, fontSize: 9, color: "#c090e0", pointerEvents: "none", zIndex: 0 }}>Page 2</div>

          {elements.filter((el) => el.visible).map((el) => (
            <Rnd key={el.id}
              size={{ width: el.width, height: el.height }}
              position={{ x: el.x, y: el.y }}
              onDragStop={(_e, d) => updateElement(el.id, { x: d.x, y: d.y })}
              onResizeStop={(_e, _dir, ref, _delta, pos) => updateElement(el.id, { width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
              bounds="parent"
              dragHandleClassName="rb-element-handle"
              minWidth={180} minHeight={80} style={{ zIndex: 1 }}>
              <div className="rb-element">
                <div className="rb-element-handle">
                  <span className="rb-element-handle-label">{el.label}</span>
                  <button className="rb-element-close" onClick={() => hideElement(el.id)} onMouseDown={(e) => e.stopPropagation()} title="Hide">×</button>
                </div>
                <div className="rb-element-body">{renderContent(el)}</div>
              </div>
            </Rnd>
          ))}
        </div>
      </div>
    </div>
  );
}
