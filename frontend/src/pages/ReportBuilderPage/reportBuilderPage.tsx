import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Rnd } from "react-rnd";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import proj4 from "proj4";
import type { FeatureCollection, Position } from "geojson";
import {
  PieChart, Pie, Cell, Tooltip as RechartTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";
import "leaflet/dist/leaflet.css";
import "./reportBuilderPage.css";

// ── SVY21 (EPSG:3414) → WGS84 ───────────────────────────────────────────────
proj4.defs(
  "EPSG:3414",
  "+proj=tmerc +lat_0=1.366666666666667 +lon_0=103.8333333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs"
);
const to4326 = (p: Position): [number, number] => {
  const [lon, lat] = proj4("EPSG:3414", "EPSG:4326", [p[0], p[1]]) as [number, number];
  return [lat, lon];
};

// ── Constants ────────────────────────────────────────────────────────────────
const CANVAS_W   = 794;
const PAGE_H     = 1123;
const LAYOUT_KEY = "psat_report_layout";

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
const TREATMENT_NAMES: Record<number, string> = {
  1:  "Upgrade to on-road bicycle lane with light segregation",
  2:  "Safety barrier (Adjacent road 0-1m)",
  3:  "Safety barrier (Adjacent road 1-3m)",
  4:  "Upgrade to cycling-priority street",
  5:  "Upgrade to multi-use path",
  6:  "Upgrade to off-road bicycle path",
  7:  "Convert to one-way facility",
  8:  "Improve surface conditions",
  9:  "Install light segregation",
  10: "Install street lighting",
  11: "Remove fixed obstacles",
  12: "Remove non-fixed obstacles",
  13: "Remove width restriction",
  14: "Improve facility access",
  15: "Redesign sharp curves",
  16: "Widen the facility",
  17: "Install protective barrier",
  18: "Improve delineation",
  19: "Review intersection approach",
  20: "Improve crossing facility",
  21: "Evaluate grade separation",
  22: "Reconfigure/remove parking",
  23: "Review tram/train rails",
  24: "Install traffic calming",
  25: "Bicycle speed control",
};

const METHODOLOGY_TEXT = `This report uses the CycleRAP (Cycling Road Assessment Programme) methodology to assess the safety of cycling infrastructure. Each segment is evaluated against a set of risk attributes covering facility design, surface quality, hazards, intersections, and usage patterns. A risk multiplier is computed for each attribute based on its coded value, and the combined score determines the segment's risk band (Low / Medium / High / Extreme) for four crash types: Vehicle–Bicycle (VB), Bicycle–Bicycle (BB), Single-Bicycle (SB), and Bicycle–Pedestrian (BP). Higher scores and bands indicate greater risk exposure and a greater need for intervention.`;

// ── Types ────────────────────────────────────────────────────────────────────
type ElementType =
  | "title" | "riskBands" | "map" | "summary" | "topRisk" | "treatmentSummary"
  | "projectDetails" | "riskStats" | "topAttributes" | "recommendations" | "methodology" | "segmentGallery"
  | "deepDive" | "filterAnalysis";

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
interface ProjectTreatmentSummary {
  project: string;
  treatedSegments: number;
  treatmentCounts: Record<number, number>;
}
interface GeoEntry { name: string; data: FeatureCollection }
interface StatEntry { min: string; max: string; avg: string }
interface ScoreStats {
  VB: StatEntry; BB: StatEntry; SB: StatEntry; BP: StatEntry; Overall: StatEntry;
}

// ── Default layout ───────────────────────────────────────────────────────────
// Page 1: title, summary (with filters), map
// Page 2: risk bands, top risk stretches
// Page 3+: treatments, supplementary (off by default)
// Auto-fit corrects positions on first load.
const DEFAULT_ELEMENTS: ElementState[] = [
  // — Page 1 —
  { id: "title",            type: "title",            label: "Title",              x: 20, y: 20,   width: 754, height: 205, visible: true  },
  { id: "summary",          type: "summary",          label: "Summary",            x: 20, y: 240,  width: 754, height: 150, visible: true  },
  { id: "map",              type: "map",              label: "Map",                x: 20, y: 405,  width: 754, height: 350, visible: true  },
  // — Page 2 —
  { id: "riskBands",        type: "riskBands",        label: "Risk Bands",         x: 20, y: 1163, width: 754, height: 450, visible: true  },
  { id: "topRisk",          type: "topRisk",          label: "Top Risk Stretches", x: 20, y: 1633, width: 754, height: 730, visible: true,  viewMode: "tabular", topN: 10 },
  // — Page 3 —
  { id: "treatmentSummary", type: "treatmentSummary", label: "Treatments",         x: 20, y: 2386, width: 754, height: 360, visible: true  },
  // — Supplementary (off by default) —
  { id: "projectDetails",   type: "projectDetails",   label: "Project Details",    x: 20, y: 2790, width: 754, height: 220, visible: false },
  { id: "riskStats",        type: "riskStats",        label: "Risk Statistics",    x: 20, y: 3030, width: 754, height: 190, visible: false },
  { id: "topAttributes",    type: "topAttributes",    label: "Risk Factors",       x: 20, y: 3240, width: 754, height: 210, visible: false },
  { id: "recommendations",  type: "recommendations",  label: "Recommendations",    x: 20, y: 3470, width: 754, height: 160, visible: false },
  { id: "methodology",      type: "methodology",      label: "Methodology",        x: 20, y: 3650, width: 754, height: 210, visible: false },
  { id: "segmentGallery",   type: "segmentGallery",   label: "Image Gallery",      x: 20, y: 3880, width: 754, height: 110, visible: false },
  { id: "deepDive",         type: "deepDive",         label: "Deep-Dive Analytics",x: 20, y: 2790, width: 754, height: 340, visible: false },
  { id: "filterAnalysis",   type: "filterAnalysis",   label: "Filter Analysis",    x: 20, y: 3150, width: 754, height: 340, visible: false },
];

// ── Shared table styles ──────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  padding: "5px 8px", textAlign: "left", fontWeight: 600,
  fontSize: 10, color: "#555", borderBottom: "2px solid #e0d0f0", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "3px 6px", fontSize: 10, color: "#333" };

// ── Small components ─────────────────────────────────────────────────────────
function SegmentImage({ src, width, height }: { src?: string; width: number; height: number }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div style={{ width, height, background: "#eee", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "#bbb" }}>No image</span>
      </div>
    );
  }
  return <img src={src} alt="" onError={() => setErrored(true)} style={{ width, height, objectFit: "cover", borderRadius: 3, flexShrink: 0 }} />;
}

function AttrTag({ name, multiplier }: { name: string; multiplier: number }) {
  return (
    <span style={{ fontSize: 9, color: "#555", display: "block", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      • {name} <span style={{ color: "#cc2200", fontWeight: 700 }}>×{multiplier}</span>
    </span>
  );
}

function TreatmentBadge({ ids }: { ids: number[] }) {
  if (ids.length === 0) return null;
  return (
    <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #d0e8d0" }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: "#228833", letterSpacing: 0.3, display: "block", marginBottom: 2 }}>
        TREATMENTS APPLIED ({ids.length})
      </span>
      {ids.map((id) => (
        <span key={id} style={{ fontSize: 9, color: "#226633", display: "block", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          ✓ {id}. {TREATMENT_NAMES[id] ?? `Treatment ${id}`}
        </span>
      ))}
    </div>
  );
}

// ── Inline editable text ─────────────────────────────────────────────────────
function EditableText({ value, onChange, style, placeholder }: {
  value: string; onChange: (v: string) => void;
  style?: React.CSSProperties; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        defaultValue={value}
        onBlur={(e) => { onChange(e.target.value.trim() || value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onChange((e.target as HTMLInputElement).value.trim() || value); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        autoFocus
        style={{ ...style, border: "1px solid #a020d0", borderRadius: 3, outline: "none", background: "#fff", padding: "1px 6px", fontFamily: "inherit", minWidth: 80, boxSizing: "border-box" }}
      />
    );
  }
  return (
    <span
      style={{ ...style, cursor: "text", borderRadius: 2 }}
      title="Click to edit"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {value || <span style={{ color: "#ccc", fontStyle: "italic" }}>{placeholder ?? "—"}</span>}
      <span style={{ marginLeft: 3, fontSize: "0.65em", color: "#a020d0", opacity: 0.45, verticalAlign: "middle" }}>✎</span>
    </span>
  );
}

// ── Leaflet map sub-components ───────────────────────────────────────────────
function FitAllBounds({ geoEntries }: { geoEntries: GeoEntry[] }) {
  const map = useMap();
  useEffect(() => {
    if (geoEntries.length === 0) return;
    const pts: L.LatLngExpression[] = [];
    geoEntries.forEach(({ data }) => {
      data.features?.forEach((f) => {
        if (f.geometry?.type === "LineString") {
          f.geometry.coordinates.forEach((p) => pts.push(to4326(p)));
        }
      });
    });
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts), { padding: [20, 20] });
  }, [geoEntries, map]);
  return null;
}

function ReportMiniMap({ projects, bandMap }: { projects: string[]; bandMap: Map<string, number> }) {
  const [geoEntries, setGeoEntries] = useState<GeoEntry[]>([]);
  useEffect(() => {
    if (projects.length === 0) return;
    setGeoEntries([]);
    Promise.all(
      projects.map(async (name) => {
        try {
          const res = await fetch(`/api/projects/${encodeURIComponent(name)}/geodata`);
          return { name, data: await res.json() } as GeoEntry;
        } catch { return null; }
      })
    ).then((r) => setGeoEntries(r.filter(Boolean) as GeoEntry[]));
  }, [projects]);

  return (
    <MapContainer style={{ width: "100%", height: "100%" }} center={[1.35, 103.82]} zoom={12} scrollWheelZoom zoomControl>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {geoEntries.map(({ name, data }) =>
        data.features?.map((f, i) => {
          if (f.geometry?.type !== "LineString") return null;
          const segIndex = ((f.properties as Record<string, unknown>)?.index as number ?? i) + 1;
          const band = bandMap.get(`${name}_${segIndex}`) ?? 1;
          const positions: L.LatLngExpression[] = f.geometry.coordinates.map((p) => to4326(p));
          return <Polyline key={`${name}_${i}`} positions={positions} pathOptions={{ color: RISK_COLORS[band] ?? "#6644aa", weight: 4, opacity: 0.85 }} />;
        })
      )}
      <FitAllBounds geoEntries={geoEntries} />
    </MapContainer>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ReportBuilderPage() {
  const navigate = useNavigate();
  const canvasRef          = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const hasAutoFit         = useRef(false);
  const [elements, setElements] = useState<ElementState[]>(DEFAULT_ELEMENTS);
  const [currentPage, setCurrentPage] = useState(0);

  // ── Editable metadata ────────────────────────────────────────────────────
  const [reportTitle,          setReportTitle]          = useState("Path Analysis Executive Summary");
  const [projectNameOverrides, setProjectNameOverrides] = useState<Record<string, string>>({});
  const [sectionTitles,        setSectionTitles]        = useState<Record<string, string>>({});
  const [oicName,              setOicName]              = useState("");
  const [purpose,              setPurpose]              = useState("");
  const [recommendations,      setRecommendations]      = useState("");
  const [reportDate,           setReportDate]           = useState(() => new Date().toISOString().split("T")[0]);
  const [imageDate,            setImageDate]            = useState("");
  const [auditDate,            setAuditDate]            = useState("");

  // ── Projects ─────────────────────────────────────────────────────────────
  const [loadedProjects,    setLoadedProjects]    = useState<string[]>([]);
  const [treatmentProjects, setTreatmentProjects] = useState<string[]>([]);

  // ── Score data ────────────────────────────────────────────────────────────
  const [distributions,        setDistributions]        = useState<Distributions | null>(null);
  const [totalSegments,        setTotalSegments]         = useState(0);
  const [projectSegmentCounts, setProjectSegmentCounts]  = useState<Record<string, number>>({});
  const [topRiskRows,          setTopRiskRows]           = useState<TopRiskRow[]>([]);
  const [allScoreRows,         setAllScoreRows]          = useState<TopRiskRow[]>([]);
  const [allBandMap,           setAllBandMap]            = useState<Map<string, number>>(new Map());
  const [enrichedMap,          setEnrichedMap]           = useState<Map<string, EnrichedDetail>>(new Map());

  // ── Treatment data ────────────────────────────────────────────────────────
  const [treatmentSummaries,  setTreatmentSummaries]  = useState<ProjectTreatmentSummary[]>([]);
  const [segmentTreatmentMap, setSegmentTreatmentMap] = useState<Map<string, number[]>>(new Map());

  // ── Project metadata (name, dates, length) ────────────────────────────────
  const [projectMeta, setProjectMeta] = useState<Record<string, { dateCreated?: string; lastUpdated?: string; lengthKm?: number }>>({});

  // ── Path Analysis filter sync ─────────────────────────────────────────────
  const [activeFilterNames, setActiveFilterNames] = useState<string[]>([]);
  const [allAttributeRows,  setAllAttributeRows]  = useState<Record<string, Record<string, unknown>[]>>({});

  const [exporting, setExporting] = useState<"pdf" | "word" | null>(null);
  const [hasSaved, setHasSaved] = useState(() => { try { return !!localStorage.getItem(LAYOUT_KEY); } catch { return false; } });

  // ── Project picker (shown when no projects in session storage) ────────────
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [pickerSelected,    setPickerSelected]    = useState<Set<string>>(new Set());
  const [pickerLoading,     setPickerLoading]     = useState(false);

  // ── Session storage ───────────────────────────────────────────────────────
  useEffect(() => {
    const pa      = sessionStorage.getItem("pathAnalysis_loadedProjects");
    const tr      = sessionStorage.getItem("treatment_loadedProjects");
    const filters = sessionStorage.getItem("pathAnalysis_activeFilters");
    const paP: string[] = pa      ? JSON.parse(pa)      : [];
    const trP: string[] = tr      ? JSON.parse(tr)      : [];
    const flt: string[] = filters ? JSON.parse(filters) : [];
    const combined = [...new Set([...paP, ...trP])];
    setLoadedProjects(combined);
    setTreatmentProjects(trP);
    setActiveFilterNames(flt);
    if (combined.length === 0) {
      setPickerLoading(true);
      fetch("/api/projects")
        .then((r) => r.json())
        .then((d) => {
          const names: string[] = (d.projects ?? []).map((p: { name: string }) => p.name).sort();
          setAvailableProjects(names);
          setShowProjectPicker(true);
        })
        .catch(() => setShowProjectPicker(true))
        .finally(() => setPickerLoading(false));
    }
  }, []);

  // ── Attribute data fetch (for filter analysis) ────────────────────────────
  useEffect(() => {
    if (loadedProjects.length === 0 || activeFilterNames.length === 0) return;
    const go = async () => {
      const entries = await Promise.all(
        loadedProjects.map(async (name) => {
          try {
            const res = await fetch(`/api/projects/${encodeURIComponent(name)}/versions/latest/attributes`);
            const json = await res.json();
            const rows: Record<string, unknown>[] = (json.rows ?? []).map(
              (r: Record<string, unknown>) => ({ ...r, _project: name })
            );
            return { name, rows };
          } catch { return { name, rows: [] }; }
        })
      );
      const map: Record<string, Record<string, unknown>[]> = {};
      entries.forEach(({ name, rows }) => { map[name] = rows; });
      setAllAttributeRows(map);
    };
    go();
  }, [loadedProjects, activeFilterNames]);

  // ── Project metadata fetch (dates + route length) ────────────────────────
  useEffect(() => {
    if (loadedProjects.length === 0) return;
    const fetchMeta = async () => {
      const entries = await Promise.all(
        loadedProjects.map(async (name) => {
          try {
            const [metaRes, geoRes] = await Promise.all([
              fetch(`/api/projects/${encodeURIComponent(name)}/metadata`),
              fetch(`/api/projects/${encodeURIComponent(name)}/geodata`),
            ]);
            const meta = await metaRes.json();
            const geo  = await geoRes.json();

            // Compute total route length from SVY21 (metre) coordinates
            let totalM = 0;
            (geo.features ?? []).forEach((f: { geometry?: { type: string; coordinates: number[][] } }) => {
              if (f.geometry?.type === "LineString") {
                const c = f.geometry.coordinates;
                for (let i = 1; i < c.length; i++) {
                  const dx = c[i][0] - c[i - 1][0], dy = c[i][1] - c[i - 1][1];
                  totalM += Math.sqrt(dx * dx + dy * dy);
                }
              }
            });

            return {
              name,
              dateCreated: meta.date_created ?? undefined,
              lastUpdated: meta.last_updated ?? undefined,
              lengthKm:    totalM > 0 ? totalM / 1000 : undefined,
            };
          } catch { return null; }
        })
      );
      const map: Record<string, { dateCreated?: string; lastUpdated?: string; lengthKm?: number }> = {};
      entries.forEach((e) => { if (e) map[e.name] = { dateCreated: e.dateCreated, lastUpdated: e.lastUpdated, lengthKm: e.lengthKm }; });
      setProjectMeta(map);
    };
    fetchMeta();
  }, [loadedProjects]);

  // ── Score data fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (loadedProjects.length === 0) return;
    const fetchAll = async () => {
      const results = await Promise.all(
        loadedProjects.map(async (name) => {
          try {
            const res = await fetch(`/api/projects/${encodeURIComponent(name)}/results`);
            const data = await res.json();
            if (!data.ok || !Array.isArray(data.result_rows)) return { name, rows: [] };
            return { name, rows: data.result_rows.map((row: Record<string, unknown>, i: number) => ({ ...row, _project: name, _segIndex: i + 1 })) };
          } catch { return { name, rows: [] as unknown[] }; }
        })
      );
      const counts: Record<string, number> = {};
      const allRows: TopRiskRow[] = [];
      results.forEach(({ name, rows }) => { counts[name] = (rows as TopRiskRow[]).length; allRows.push(...(rows as TopRiskRow[])); });
      setProjectSegmentCounts(counts);
      setTotalSegments(allRows.length);
      if (allRows.length === 0) return;

      const dist: Distributions = {
        VB: { 1: 0, 2: 0, 3: 0, 4: 0 }, BB: { 1: 0, 2: 0, 3: 0, 4: 0 },
        SB: { 1: 0, 2: 0, 3: 0, 4: 0 }, BP: { 1: 0, 2: 0, 3: 0, 4: 0 },
        Overall: { 1: 0, 2: 0, 3: 0, 4: 0 },
      };
      const bMap = new Map<string, number>();
      allRows.forEach((row) => {
        if (row["VB Band"] >= 1 && row["VB Band"] <= 4) dist.VB[row["VB Band"]]++;
        if (row["BB Band"] >= 1 && row["BB Band"] <= 4) dist.BB[row["BB Band"]]++;
        if (row["SB Band"] >= 1 && row["SB Band"] <= 4) dist.SB[row["SB Band"]]++;
        if (row["BP Band"] >= 1 && row["BP Band"] <= 4) dist.BP[row["BP Band"]]++;
        const max = Math.max(row["VB"] || 0, row["BB"] || 0, row["SB"] || 0, row["BP"] || 0);
        const overall = max < 10 ? 1 : max <= 25 ? 2 : max <= 60 ? 3 : 4;
        dist.Overall[overall]++;
        bMap.set(`${row._project}_${row._segIndex}`, overall);
      });
      setDistributions(dist);
      setAllBandMap(bMap);

      const withMax = allRows.map((row) => {
        const maxScore = Math.max(row["VB"] || 0, row["BB"] || 0, row["SB"] || 0, row["BP"] || 0);
        return { ...row, _maxScore: maxScore, _maxBand: maxScore < 10 ? 1 : maxScore <= 25 ? 2 : maxScore <= 60 ? 3 : 4 };
      }).sort((a, b) => b._maxScore - a._maxScore);

      setAllScoreRows(withMax);
      setTopRiskRows(withMax.slice(0, 10));
    };
    fetchAll();
  }, [loadedProjects]);

  // ── Enrichment fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (topRiskRows.length === 0) return;
    const go = async () => {
      try {
        const res = await fetch("/api/report/segment-details", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments: topRiskRows.map((r) => ({ project: r._project, segIndex: r._segIndex })) }),
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.details)) {
          const map = new Map<string, EnrichedDetail>();
          data.details.forEach((d: { project: string; segIndex: number; imageUrl?: string; topAttributes?: { name: string; multiplier: number }[] }) => {
            map.set(`${d.project}_${d.segIndex}`, { imageUrl: d.imageUrl ?? undefined, topAttributes: d.topAttributes || [] });
          });
          setEnrichedMap(map);
        }
      } catch (err) { console.error("Enrichment failed:", err); }
    };
    go();
  }, [topRiskRows]);

  // ── Treatment fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (treatmentProjects.length === 0) return;
    const go = async () => {
      const newSegTreatMap = new Map<string, number[]>();
      const summaries = await Promise.all(
        treatmentProjects.map(async (name) => {
          try {
            const res = await fetch(`/api/projects/${encodeURIComponent(name)}/treatments/all`);
            const data = await res.json();
            if (!data.ok) return null;
            const segments = (data.segments || {}) as Record<string, { treatments_applied?: number[] }>;
            const treatmentCounts: Record<number, number> = {};
            Object.entries(segments).forEach(([idx, seg]) => {
              const ids = seg.treatments_applied || [];
              if (ids.length > 0) {
                newSegTreatMap.set(`${name}_${parseInt(idx) + 1}`, ids);
                ids.forEach((id) => { treatmentCounts[id] = (treatmentCounts[id] || 0) + 1; });
              }
            });
            return { project: name, treatedSegments: Object.keys(segments).length, treatmentCounts } as ProjectTreatmentSummary;
          } catch { return null; }
        })
      );
      setSegmentTreatmentMap(newSegTreatMap);
      setTreatmentSummaries(summaries.filter(Boolean) as ProjectTreatmentSummary[]);
    };
    go();
  }, [treatmentProjects]);

  // ── Auto-fit on first data load ───────────────────────────────────────────
  // Triggered once when score data arrives; subsequent toggles trigger it too.
  useEffect(() => {
    if (!distributions || hasAutoFit.current) return;
    hasAutoFit.current = true;
    setTimeout(autoFitElements, 150);
  }, [distributions, autoFitElements]);

  // ── Derived / computed ────────────────────────────────────────────────────
  const scoreStats = useMemo((): ScoreStats | null => {
    if (allScoreRows.length === 0) return null;
    const stat = (vals: number[]): StatEntry => {
      const sorted = [...vals].sort((a, b) => a - b);
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      return { min: sorted[0].toFixed(1), max: sorted[sorted.length - 1].toFixed(1), avg: avg.toFixed(1) };
    };
    return {
      VB:      stat(allScoreRows.map((r) => r.VB || 0)),
      BB:      stat(allScoreRows.map((r) => r.BB || 0)),
      SB:      stat(allScoreRows.map((r) => r.SB || 0)),
      BP:      stat(allScoreRows.map((r) => r.BP || 0)),
      Overall: stat(allScoreRows.map((r) => r._maxScore || 0)),
    };
  }, [allScoreRows]);

  const attributeFrequency = useMemo(() => {
    const count = new Map<string, number>();
    enrichedMap.forEach(({ topAttributes }) => {
      topAttributes.forEach(({ name }) => count.set(name, (count.get(name) || 0) + 1));
    });
    return [...count.entries()].sort(([, a], [, b]) => b - a).slice(0, 10);
  }, [enrichedMap]);

  const totalKm = useMemo(
    () => Object.values(projectMeta).reduce((sum, m) => sum + (m.lengthKm ?? 0), 0),
    [projectMeta]
  );

  // ── Ideal height per element type (based on current data) ────────────────
  const computeIdealHeight = useCallback((el: ElementState): number => {
    const H = 30; // handle
    switch (el.type) {
      case "title":          return H + 175;
      case "riskBands":      return H + (distributions ? 450 : 60);
      case "map":            return H + 350;
      case "summary":        return H + 100 + (activeFilterNames.length > 0 ? 46 : 0);
      case "topRisk": {
        const n = el.topN ?? 10;
        const header = 56;  // title + subtitle
        const toggle = 58;  // view toggle (may wrap to 2 lines)
        if (!el.viewMode || el.viewMode === "tabular") return H + header + toggle + 34 + n * 56 + 20;
        if (el.viewMode === "grid")  return H + header + toggle + Math.ceil(n / 3) * 232 + 20;
        return H + header + toggle + n * 72 + 20; // list
      }
      case "treatmentSummary": {
        if (treatmentSummaries.length === 0) return H + 100;
        let h = H + 36;
        treatmentSummaries.forEach((ts) => { h += 54 + Object.keys(ts.treatmentCounts).length * 38 + 18; });
        return h + 16;
      }
      case "projectDetails": {
        if (loadedProjects.length === 0) return H + 60;
        let h = H + 36;
        loadedProjects.forEach((name, i) => {
          const meta = projectMeta[name] ?? {};
          h += 34 + (2 + (meta.lengthKm !== undefined ? 1 : 0) + 1) * 26 + (i < loadedProjects.length - 1 ? 18 : 0);
        });
        return h + 16;
      }
      case "riskStats":       return H + 36 + (scoreStats ? 5 * 32 + 20 : 50);
      case "topAttributes":   return H + 36 + (attributeFrequency.length > 0 ? attributeFrequency.length * 34 + 16 : 50);
      case "recommendations": return H + 36 + 120;
      case "methodology":     return H + 36 + 130;
      case "segmentGallery":  return H + 36 + Math.max(1, Math.ceil(topRiskRows.length / 6)) * 92 + 16;
      case "deepDive":        return H + 36 + 300;
      case "filterAnalysis":
        return activeFilterNames.length === 0 ? H + 100 : H + 36 + activeFilterNames.length * 148 + 16;
      default: return el.height;
    }
  }, [distributions, treatmentSummaries, loadedProjects, projectMeta, scoreStats, attributeFrequency, topRiskRows, activeFilterNames]);

  // ── Auto-fit: resize all visible elements + restack with no gaps ─────────
  // Elements that would straddle a page break are pushed to the next page.
  const autoFitElements = useCallback(() => {
    setElements((prev) => {
      const visible = prev.filter((e) => e.visible).sort((a, b) => a.y - b.y);
      let cursor = 20;
      const updates = new Map<string, { height: number; y: number }>();
      visible.forEach((el) => {
        const h = computeIdealHeight(el);
        if (h < PAGE_H) {
          const pageAtStart = Math.floor(cursor / PAGE_H);
          const pageAtEnd   = Math.floor((cursor + h - 1) / PAGE_H);
          if (pageAtEnd > pageAtStart) {
            cursor = (pageAtStart + 1) * PAGE_H + 20;
          }
        }
        updates.set(el.id, { height: h, y: cursor });
        cursor += h + 10;
      });
      return prev.map((el) => {
        const u = updates.get(el.id);
        return u ? { ...el, ...u } : el;
      });
    });
  }, [computeIdealHeight]);

  // ── Element helpers ───────────────────────────────────────────────────────
  const updateElement = useCallback((id: string, changes: Partial<ElementState>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...changes } : el)));
  }, []);
  const hideElement = useCallback((id: string) => updateElement(id, { visible: false }), [updateElement]);
  const showElement = useCallback((id: string) => {
    updateElement(id, { visible: true });
    // Scroll the canvas container so the element comes into view
    setElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (el && canvasContainerRef.current) {
        setTimeout(() => {
          canvasContainerRef.current?.scrollTo({ top: Math.max(0, el.y - 60), behavior: "smooth" });
        }, 30);
      }
      return prev;
    });
  }, [updateElement]);
  const getEnriched  = (row: TopRiskRow): EnrichedDetail =>
    enrichedMap.get(`${row._project}_${row._segIndex}`) ?? { topAttributes: [] };
  const getSegmentTreatments = (row: TopRiskRow): number[] =>
    segmentTreatmentMap.get(`${row._project}_${row._segIndex}`) ?? [];

  // ── Display-name helpers ──────────────────────────────────────────────────
  const dispName = useCallback(
    (name: string) => projectNameOverrides[name] ?? name,
    [projectNameOverrides]
  );
  const setProjectName = useCallback(
    (orig: string, display: string) =>
      setProjectNameOverrides((prev) => ({ ...prev, [orig]: display })),
    []
  );
  const secTitle = useCallback(
    (id: string, defaultTitle: string) => sectionTitles[id] ?? defaultTitle,
    [sectionTitles]
  );
  const setSecTitle = useCallback(
    (id: string, title: string) =>
      setSectionTitles((prev) => ({ ...prev, [id]: title })),
    []
  );

  // ── Save / Restore layout ─────────────────────────────────────────────────
  const saveLayout = useCallback(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({
        elements, reportTitle, oicName, purpose, recommendations,
        reportDate, imageDate, auditDate, projectNameOverrides, sectionTitles,
      }));
      setHasSaved(true);
    } catch (e) { console.error("Save layout failed:", e); }
  }, [elements, reportTitle, oicName, purpose, recommendations, reportDate, imageDate, auditDate, projectNameOverrides, sectionTitles]);

  const restoreLayout = useCallback(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (!saved) return;
      const l = JSON.parse(saved);
      if (l.elements)              setElements(l.elements);
      if (l.reportTitle !== undefined)          setReportTitle(l.reportTitle);
      if (l.oicName !== undefined)              setOicName(l.oicName);
      if (l.purpose !== undefined)              setPurpose(l.purpose);
      if (l.recommendations !== undefined)      setRecommendations(l.recommendations);
      if (l.reportDate !== undefined)           setReportDate(l.reportDate);
      if (l.imageDate !== undefined)            setImageDate(l.imageDate);
      if (l.auditDate !== undefined)            setAuditDate(l.auditDate);
      if (l.projectNameOverrides !== undefined) setProjectNameOverrides(l.projectNameOverrides);
      if (l.sectionTitles !== undefined)        setSectionTitles(l.sectionTitles);
    } catch (e) { console.error("Restore layout failed:", e); }
  }, []);

  // ── Page navigation ───────────────────────────────────────────────────────
  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    if (!canvasContainerRef.current || !canvasRef.current) return;
    const canvasTop = canvasRef.current.offsetTop;
    canvasContainerRef.current.scrollTo({ top: canvasTop + page * PAGE_H, behavior: "smooth" });
  }, []);

  const handleCanvasScroll = useCallback(() => {
    if (!canvasContainerRef.current || !canvasRef.current) return;
    const scrolled = canvasContainerRef.current.scrollTop;
    const canvasTop = canvasRef.current.offsetTop;
    const scrollInCanvas = Math.max(0, scrolled - canvasTop);
    setCurrentPage(Math.floor(scrollInCanvas / PAGE_H));
  }, []);

  // ── Project picker: confirm selection and load ────────────────────────────
  const loadSelectedProjects = useCallback(() => {
    const selected = [...pickerSelected];
    setLoadedProjects(selected);
    setShowProjectPicker(false);
  }, [pickerSelected]);

  // ── PDF export ────────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (!canvasRef.current) return;
    setExporting("pdf");
    try {
      const captured = await html2canvas(canvasRef.current, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
      const imgData = captured.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = 210, pdfH = 297;
      const imgH = (captured.height * pdfW) / captured.width;
      let remaining = imgH, yPos = 0;
      pdf.addImage(imgData, "PNG", 0, yPos, pdfW, imgH);
      remaining -= pdfH;
      while (remaining > 0) { yPos -= pdfH; pdf.addPage(); pdf.addImage(imgData, "PNG", 0, yPos, pdfW, imgH); remaining -= pdfH; }
      pdf.save("PSAT_Report.pdf");
    } catch (err) { console.error("PDF export failed:", err); }
    finally { setExporting(null); }
  };

  // ── Capture a canvas element body as a base64 PNG ────────────────────────
  const captureElementImage = async (elementId: string): Promise<string | null> => {
    const el = canvasRef.current?.querySelector(`[data-element-id="${elementId}"] .rb-element-body`) as HTMLElement | null;
    if (!el) return null;
    await new Promise((r) => setTimeout(r, 800)); // let map tiles finish loading
    try {
      const captured = await html2canvas(el, {
        useCORS: true, allowTaint: false, scale: 1.5, logging: false, backgroundColor: "#ffffff",
        imageTimeout: 20000,
      });
      return captured.toDataURL("image/png").split(",")[1];
    } catch { return null; }
  };

  // ── Word export ───────────────────────────────────────────────────────────
  const handleDownloadWord = async () => {
    setExporting("word");
    const topN = elements.find((e) => e.id === "topRisk")?.topN ?? 10;
    const topRows = topRiskRows.slice(0, topN).map((row) => ({ ...row, _treatments: getSegmentTreatments(row) }));

    // Capture visual sections as images for Word embed
    const visibleIds = new Set(elements.filter((e) => e.visible).map((e) => e.id));
    const [mapImageB64, deepDiveImageB64, filterAnalysisImageB64] = await Promise.all([
      visibleIds.has("map")            ? captureElementImage("map")            : Promise.resolve(null),
      visibleIds.has("deepDive")       ? captureElementImage("deepDive")       : Promise.resolve(null),
      visibleIds.has("filterAnalysis") ? captureElementImage("filterAnalysis") : Promise.resolve(null),
    ]);

    try {
      const res = await fetch("/api/report/generate-docx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedProjects: loadedProjects,
          elements: elements.filter((el) => el.visible),
          scoreData: distributions,
          totalSegments,
          topRiskRows: topRows,
          treatmentSummaries,
          treatmentNames: TREATMENT_NAMES,
          reportTitle,
          oicName,
          purpose,
          reportDate,
          imageDate,
          auditDate,
          recommendations,
          scoreStats,
          attributeFrequency: Object.fromEntries(attributeFrequency),
          projectSegmentCounts,
          projectMeta,
          activeFilterNames,
          allAttributeRows,
          projectDisplayNames: projectNameOverrides,
          sectionTitles,
          mapImageB64,
          deepDiveImageB64,
          filterAnalysisImageB64,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "PSAT_Report.docx";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { console.error("Word export failed:", err); }
    finally { setExporting(null); }
  };

  // ── Shared renderers ──────────────────────────────────────────────────────
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
              <div style={{ width: 60, fontSize: 10, color: "#555", flexShrink: 0 }}>{count} <span style={{ color: "#999" }}>({pct}%)</span></div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBandBadge = (band: number, short = false) => (
    <span style={{ display: "inline-block", padding: short ? "1px 4px" : "1px 6px", borderRadius: 3, fontSize: short ? 9 : 10, fontWeight: 600, background: RISK_COLORS[band] || "#eee", color: band === 2 ? "#333" : "#fff" }}>
      {short ? (RISK_LABELS[band]?.slice(0, 3).toUpperCase() ?? "—") : (RISK_LABELS[band] ?? "—")}
    </span>
  );

  const renderViewToggle = (el: ElementState) => {
    const topN = el.topN ?? 10;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderBottom: "1px solid #ede8f5", background: "#faf8fd", flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#aaa", marginRight: 2 }}>View:</span>
        {(["list", "grid", "tabular"] as ViewMode[]).map((mode) => {
          const active = (el.viewMode || "tabular") === mode;
          return (
            <button key={mode}
              style={{ padding: "2px 9px", borderRadius: 10, border: `1px solid ${active ? "#a020d0" : "#ddd"}`, background: active ? "#f0e4f8" : "#fff", color: active ? "#a020d0" : "#777", cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 400 }}
              onClick={(e) => { e.stopPropagation(); updateElement(el.id, { viewMode: mode }); setTimeout(autoFitElements, 50); }}
              onMouseDown={(e) => e.stopPropagation()}>
              {mode === "list" ? "List" : mode === "grid" ? "Grid" : "Tabular"}
            </button>
          );
        })}
        <span style={{ marginLeft: 8, fontSize: 10, color: "#aaa" }}>Show top:</span>
        {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
          const active = topN === n;
          return (
            <button key={n}
              style={{ padding: "2px 6px", borderRadius: 10, border: `1px solid ${active ? "#a020d0" : "#ddd"}`, background: active ? "#f0e4f8" : "#fff", color: active ? "#a020d0" : "#777", cursor: "pointer", fontSize: 10, fontWeight: active ? 700 : 400, minWidth: 24 }}
              onClick={(e) => { e.stopPropagation(); updateElement(el.id, { topN: n }); setTimeout(autoFitElements, 50); }}
              onMouseDown={(e) => e.stopPropagation()}>{n}
            </button>
          );
        })}
        <span style={{ fontSize: 10, color: "#ccc" }}>stretches</span>
      </div>
    );
  };

  // ── Top Risk renderers ────────────────────────────────────────────────────
  const renderTopRiskList = (rows: TopRiskRow[]) => (
    <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
      {rows.map((row, i) => {
        const e = getEnriched(row); const t = getSegmentTreatments(row);
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 4px", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ width: 22, fontSize: 11, fontWeight: 700, color: "#888", flexShrink: 0, paddingTop: 2 }}>#{i + 1}</span>
            <SegmentImage src={e.imageUrl} width={72} height={50} />
            <div style={{ width: 100, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dispName(row._project)}</div>
              <div style={{ fontSize: 10, color: "#777" }}>Seg {row._segIndex}</div>
            </div>
            <div style={{ width: 44, textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#222", lineHeight: 1 }}>{row._maxScore.toFixed(1)}</div>
              <div style={{ fontSize: 8, color: "#aaa" }}>score</div>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 0.3, marginBottom: 2 }}>BEFORE</div>
              {e.topAttributes.length > 0 ? e.topAttributes.map((a, j) => <AttrTag key={j} {...a} />) : <span style={{ fontSize: 9, color: "#bbb" }}>—</span>}
              <TreatmentBadge ids={t} />
            </div>
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
        const e = getEnriched(row); const t = getSegmentTreatments(row);
        return (
          <div key={i} style={{ border: `2px solid ${RISK_COLORS[row._maxBand] || "#ddd"}`, borderRadius: 6, background: "#fff", overflow: "hidden" }}>
            <SegmentImage src={e.imageUrl} width={999} height={85} />
            <div style={{ padding: "7px 9px" }}>
              <div style={{ fontSize: 9, color: "#bbb" }}>Rank #{i + 1}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dispName(row._project)}</div>
              <div style={{ fontSize: 10, color: "#777", marginBottom: 4 }}>Segment {row._segIndex}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: "#222" }}>{row._maxScore.toFixed(1)}</span>
                {renderBandBadge(row._maxBand)}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#888", letterSpacing: 0.3, marginBottom: 2 }}>CONTRIBUTING FACTORS</div>
              <div style={{ marginBottom: 5 }}>
                {e.topAttributes.length > 0 ? e.topAttributes.map((a, j) => <AttrTag key={j} {...a} />) : <span style={{ fontSize: 9, color: "#bbb" }}>—</span>}
              </div>
              <TreatmentBadge ids={t} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 4px", marginTop: 5 }}>
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
            <th style={thStyle}>Top 3 Risk Factors (Before)</th>
            <th style={thStyle}>Applied Treatments (After)</th>
            <th style={{ ...thStyle, width: 36, textAlign: "center" }}>VB</th>
            <th style={{ ...thStyle, width: 36, textAlign: "center" }}>BB</th>
            <th style={{ ...thStyle, width: 36, textAlign: "center" }}>SB</th>
            <th style={{ ...thStyle, width: 36, textAlign: "center" }}>BP</th>
            <th style={{ ...thStyle, width: 44, textAlign: "center" }}>Overall</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const e = getEnriched(row); const t = getSegmentTreatments(row);
            return (
              <tr key={i} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#888" }}>{i + 1}</td>
                <td style={{ padding: "4px 6px" }}><SegmentImage src={e.imageUrl} width={55} height={38} /></td>
                <td style={{ ...tdStyle, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dispName(row._project)}</td>
                <td style={tdStyle}>{row._segIndex}</td>
                <td style={{ ...tdStyle, fontWeight: 700, fontSize: 12 }}>{row._maxScore.toFixed(1)}</td>
                <td style={{ ...tdStyle, maxWidth: 160 }}>
                  {e.topAttributes.length > 0 ? e.topAttributes.map((a, j) => <AttrTag key={j} {...a} />) : <span style={{ color: "#bbb" }}>—</span>}
                </td>
                <td style={{ ...tdStyle, maxWidth: 160 }}>
                  {t.length > 0
                    ? t.map((id) => <span key={id} style={{ fontSize: 9, color: "#226633", display: "block", lineHeight: 1.5 }}>✓ {id}. {TREATMENT_NAMES[id] ?? `Treatment ${id}`}</span>)
                    : <span style={{ color: "#ccc", fontSize: 9 }}>None</span>}
                </td>
                {(["VB", "BB", "SB", "BP"] as const).map((ct) => (
                  <td key={ct} style={{ ...tdStyle, textAlign: "center", padding: "3px 2px" }}>
                    {renderBandBadge(row[`${ct} Band` as keyof TopRiskRow] as number, true)}
                  </td>
                ))}
                <td style={{ ...tdStyle, textAlign: "center", padding: "3px 2px" }}>{renderBandBadge(row._maxBand, true)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // ── Treatment Summary renderer ────────────────────────────────────────────
  const renderTreatmentSummary = () => {
    if (treatmentProjects.length === 0) return (
      <div style={{ padding: "12px 14px", color: "#888", fontSize: 12 }}>
        No treatment data loaded.
        <div style={{ marginTop: 6, fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>
          Open the Report Builder from the <strong>Treatment page</strong> sidebar after applying treatments.
        </div>
      </div>
    );
    if (treatmentSummaries.length === 0) return <div style={{ padding: "12px 14px", color: "#888", fontSize: 12 }}>Loading treatment data…</div>;
    return (
      <div style={{ padding: "6px 12px", overflowY: "auto", height: "100%" }}>
        {treatmentSummaries.map((summary) => {
          const total = projectSegmentCounts[summary.project] ?? 0;
          const sorted = Object.entries(summary.treatmentCounts).sort(([, a], [, b]) => b - a);
          return (
            <div key={summary.project} style={{ marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #ede8f5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", flex: 1 }}>
                  <EditableText value={dispName(summary.project)} onChange={(v) => setProjectName(summary.project, v)} style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }} />
                </div>
                <div style={{ fontSize: 11, color: "#a020d0", fontWeight: 600, background: "#f0e4f8", padding: "2px 8px", borderRadius: 10 }}>
                  {summary.treatedSegments} / {total || "?"} segments treated
                </div>
              </div>
              {sorted.length === 0 ? <div style={{ fontSize: 11, color: "#aaa" }}>No treatments applied yet.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {sorted.map(([idStr, count]) => {
                    const id = parseInt(idStr);
                    const name = TREATMENT_NAMES[id] ?? `Treatment ${id}`;
                    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : null;
                    return (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 11, background: "#a020d0", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{id}</span>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: 11, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>{name}</div>
                          {total > 0 && <div style={{ height: 5, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, background: "#a020d0", height: "100%", opacity: 0.7 }} /></div>}
                        </div>
                        <span style={{ fontSize: 11, color: "#a020d0", fontWeight: 600, flexShrink: 0, width: 60, textAlign: "right" }}>
                          {count} seg{count !== 1 ? "s" : ""}{pct ? ` (${pct}%)` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Section header helper ─────────────────────────────────────────────────
  const SectionHeader = ({ title, subtitle, onTitleChange }: { title: string; subtitle?: string; onTitleChange?: (t: string) => void }) => (
    <div style={{ padding: "8px 14px 6px", flexShrink: 0, borderBottom: "1px solid #ede8f5" }}>
      {onTitleChange
        ? <EditableText value={title} onChange={onTitleChange} style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }} />
        : <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>{title}</div>
      }
      {subtitle && <div style={{ fontSize: 10, color: "#999" }}>{subtitle}</div>}
    </div>
  );

  // ── Element content ───────────────────────────────────────────────────────
  const renderContent = (el: ElementState) => {
    switch (el.type) {

      // ── Title ──────────────────────────────────────────────────────────────
      case "title":
        return (
          <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            <EditableText value={reportTitle} onChange={setReportTitle} style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }} placeholder="Report Title" />
            <div style={{ fontSize: 12, color: "#555" }}>
              <strong>Projects:</strong>{" "}
              {loadedProjects.length > 0
                ? loadedProjects.map((name, i) => (
                    <span key={name}>
                      {i > 0 && ", "}
                      <EditableText
                        value={dispName(name)}
                        onChange={(v) => setProjectName(name, v)}
                        style={{ fontSize: 12, color: "#555" }}
                        placeholder={name}
                      />
                    </span>
                  ))
                : "—"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
              {[
                { label: "OIC In-charge", value: oicName, setter: setOicName, placeholder: "Enter name…", type: "text" },
                { label: "Purpose", value: purpose, setter: setPurpose, placeholder: "Enter purpose of report…", type: "text" },
              ].map(({ label, value, setter, placeholder, type }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#a020d0", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                  <input type={type} value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder}
                    onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
                    style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 12, color: "#222", background: "#fafafa", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 14px" }}>
              {[
                { label: "Report Date", value: reportDate, setter: setReportDate },
                { label: "Image Date",  value: imageDate,  setter: setImageDate  },
                { label: "Audit Date",  value: auditDate,  setter: setAuditDate  },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#a020d0", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                  <input type="date" value={value} onChange={(e) => setter(e.target.value)}
                    onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
                    style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 11, color: "#222", background: "#fafafa", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>
          </div>
        );

      // ── Risk Bands ─────────────────────────────────────────────────────────
      case "riskBands":
        return (
          <div style={{ padding: "10px 14px", height: "calc(100% - 30px)", overflowY: "auto" }}>
            <EditableText value={secTitle(el.id, "Risk Band Distribution")} onChange={(t) => setSecTitle(el.id, t)} style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", display: "block", marginBottom: 10 }} />
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

      // ── Map ────────────────────────────────────────────────────────────────
      case "map":
        return (
          <div style={{ height: "calc(100% - 30px)", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 4, margin: 2 }}>
            {loadedProjects.length === 0
              ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, background: "#f7f7f7", border: "2px dashed #ccc", borderRadius: 4 }}><span style={{ fontSize: 12, color: "#aaa" }}>No projects loaded</span></div>
              : <div style={{ flex: 1, overflow: "hidden" }}><ReportMiniMap projects={loadedProjects} bandMap={allBandMap} /></div>}
            {loadedProjects.length > 0 && (
              <div style={{ display: "flex", gap: 18, padding: "4px 10px", background: "#faf8fd", borderTop: "1px solid #ede8f5", flexShrink: 0, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#555" }}>
                  <strong style={{ color: "#a020d0" }}>{totalSegments}</strong> segments
                </span>
                {totalKm > 0 && (
                  <span style={{ fontSize: 11, color: "#555" }}>
                    <strong style={{ color: "#a020d0" }}>{totalKm.toFixed(1)} km</strong> total length
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#555" }}>
                  {loadedProjects.length} project{loadedProjects.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        );

      // ── Summary ────────────────────────────────────────────────────────────
      case "summary":
        return (
          <div style={{ padding: "12px 18px" }}>
            <EditableText value={secTitle(el.id, "Summary")} onChange={(t) => setSecTitle(el.id, t)} style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", display: "block", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 32, marginBottom: activeFilterNames.length > 0 ? 10 : 0 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#a020d0" }}>{loadedProjects.length}</div>
                <div style={{ fontSize: 11, color: "#666" }}>Projects</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#a020d0" }}>{totalSegments}</div>
                <div style={{ fontSize: 11, color: "#666" }}>Total Segments</div>
              </div>
              {totalKm > 0 && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#a020d0" }}>{totalKm.toFixed(1)}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>km Total Length</div>
                </div>
              )}
            </div>
            {activeFilterNames.length > 0 && (
              <div style={{ padding: "6px 10px", background: "#f5f0fa", borderRadius: 6, border: "1px solid #e8d8f8", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#a020d0", textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>Active Filters:</span>
                {activeFilterNames.map((f) => (
                  <span key={f} style={{ fontSize: 11, color: "#555", background: "#ede8f8", borderRadius: 10, padding: "1px 8px" }}>{f}</span>
                ))}
              </div>
            )}
          </div>
        );

      // ── Top Risk Stretches ─────────────────────────────────────────────────
      case "topRisk": {
        const viewMode = el.viewMode || "tabular";
        const displayRows = topRiskRows.slice(0, el.topN ?? 10);
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "8px 12px 2px", flexShrink: 0 }}>
              <EditableText value={secTitle(el.id, "Top Risk Stretches")} onChange={(t) => setSecTitle(el.id, t)} style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }} />
              <div style={{ fontSize: 10, color: "#999" }}>Ranked highest to lowest · Before risk factors & after treatments applied</div>
            </div>
            {renderViewToggle(el)}
            {displayRows.length === 0
              ? <div style={{ padding: 14, color: "#888", fontSize: 12 }}>No score data. Run scoring first.</div>
              : viewMode === "list"   ? renderTopRiskList(displayRows)
              : viewMode === "grid"   ? renderTopRiskGrid(displayRows)
              :                         renderTopRiskTabular(displayRows)}
          </div>
        );
      }

      // ── Treatment Summary ──────────────────────────────────────────────────
      case "treatmentSummary":
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Treatment Summary")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle={treatmentProjects.length > 0 ? `Data from: ${treatmentProjects.map(dispName).join(", ")}` : "Open from the Treatment page to include this data"} />
            <div style={{ flex: 1, overflow: "hidden" }}>{renderTreatmentSummary()}</div>
          </div>
        );

      // ── Project Details ────────────────────────────────────────────────────
      case "projectDetails": {
        const fmtDate = (iso?: string) => {
          if (!iso) return "—";
          try { return new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }); }
          catch { return iso; }
        };
        const row = (label: string, value: string) => (
          <div key={label} style={{ display: "flex", gap: 6, fontSize: 13, color: "#333", lineHeight: 1.8 }}>
            <span style={{ color: "#555" }}>{label}:</span>
            <span style={{ fontWeight: 500 }}>{value}</span>
          </div>
        );
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Project Details")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle={loadedProjects.length > 1 ? `${loadedProjects.length} projects` : undefined} />
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
              {loadedProjects.length === 0
                ? <div style={{ color: "#888", fontSize: 12 }}>No projects loaded.</div>
                : loadedProjects.map((name, pi) => {
                    const meta  = projectMeta[name] ?? {};
                    const count = projectSegmentCounts[name] ?? 0;
                    return (
                      <div key={name} style={{ marginBottom: pi < loadedProjects.length - 1 ? 18 : 0, paddingBottom: pi < loadedProjects.length - 1 ? 14 : 0, borderBottom: pi < loadedProjects.length - 1 ? "1px solid #ede8f5" : "none" }}>
                        <EditableText value={dispName(name)} onChange={(v) => setProjectName(name, v)} style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", display: "block", marginBottom: 6 }} />
                        {row("Segments",  String(count))}
                        {meta.lengthKm !== undefined && row("Length", `${meta.lengthKm.toFixed(1)} km`)}
                        {row("Survey",   fmtDate(meta.dateCreated))}
                        {row("Analysis", fmtDate(meta.lastUpdated))}
                      </div>
                    );
                  })
              }
            </div>
          </div>
        );
      }

      // ── Risk Statistics ────────────────────────────────────────────────────
      case "riskStats":
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Risk Score Statistics")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle="Min / max / average scores across all segments" />
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
              {!scoreStats
                ? <div style={{ color: "#888", fontSize: 12, padding: 8 }}>No score data available.</div>
                : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: "#f5f0fa" }}>
                        {["Crash Type", "Min Score", "Max Score", "Avg Score"].map((h) => (
                          <th key={h} style={{ ...thStyle, textAlign: h === "Crash Type" ? "left" : "center" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(["Overall", "VB", "BB", "SB", "BP"] as const).map((ct, i) => (
                        <tr key={ct} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{CRASH_TYPE_LABELS[ct]}</td>
                          <td style={{ ...tdStyle, textAlign: "center", color: "#87C424", fontWeight: 700 }}>{scoreStats[ct].min}</td>
                          <td style={{ ...tdStyle, textAlign: "center", color: "#CD1AFF", fontWeight: 700 }}>{scoreStats[ct].max}</td>
                          <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600 }}>{scoreStats[ct].avg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        );

      // ── Top Contributing Attributes ────────────────────────────────────────
      case "topAttributes":
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Top Risk Factors")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle="Most frequently contributing attributes among top-risk segments" />
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {attributeFrequency.length === 0
                ? <div style={{ color: "#888", fontSize: 12 }}>No attribute data yet. Score data must be loaded first.</div>
                : (() => {
                    const maxCount = attributeFrequency[0]?.[1] ?? 1;
                    return attributeFrequency.map(([name, count], i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 22, fontSize: 10, fontWeight: 700, color: "#888", textAlign: "right", flexShrink: 0 }}>#{i + 1}</div>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: 11, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>{name}</div>
                          <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${(count / maxCount) * 100}%`, background: "#a020d0", height: "100%", opacity: 0.7 }} />
                          </div>
                        </div>
                        <div style={{ width: 50, fontSize: 11, color: "#a020d0", fontWeight: 700, textAlign: "right", flexShrink: 0 }}>
                          {count} seg{count !== 1 ? "s" : ""}
                        </div>
                      </div>
                    ));
                  })()}
            </div>
          </div>
        );

      // ── Recommendations ────────────────────────────────────────────────────
      case "recommendations":
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Recommendations")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle="Enter recommended actions or observations for this report" />
            <div style={{ flex: 1, padding: "6px 12px" }}>
              <textarea
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                placeholder="Enter recommendations, observations, or next steps here…"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ width: "100%", height: "100%", resize: "none", border: "1px solid #e0d0f0", borderRadius: 4, padding: "8px 10px", fontSize: 12, color: "#222", fontFamily: "inherit", background: "#fafcff", boxSizing: "border-box", outline: "none", lineHeight: 1.6 }}
              />
            </div>
          </div>
        );

      // ── Methodology ────────────────────────────────────────────────────────
      case "methodology":
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Methodology")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle="CycleRAP v2 — Cycling Road Assessment Programme" />
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
              <p style={{ fontSize: 11, color: "#444", lineHeight: 1.75, margin: 0 }}>{METHODOLOGY_TEXT}</p>
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[1, 2, 3, 4].map((band) => (
                  <div key={band} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: RISK_COLORS[band], flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: "#555" }}>{RISK_LABELS[band]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      // ── Segment Image Gallery ──────────────────────────────────────────────
      case "segmentGallery":
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Segment Image Gallery")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle="Images for top-risk segments, ordered by rank" />
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
              {topRiskRows.length === 0
                ? <div style={{ color: "#888", fontSize: 12 }}>No segments loaded.</div>
                : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {topRiskRows.map((row, i) => {
                      const e = getEnriched(row);
                      return (
                        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={{ position: "relative" }}>
                            <SegmentImage src={e.imageUrl} width={90} height={65} />
                            <div style={{ position: "absolute", top: 2, left: 2, background: "rgba(0,0,0,0.55)", borderRadius: 3, padding: "1px 5px", fontSize: 9, color: "#fff", fontWeight: 700 }}>#{i + 1}</div>
                            {renderBandBadge(row._maxBand, true) && (
                              <div style={{ position: "absolute", bottom: 2, right: 2 }}>{renderBandBadge(row._maxBand, true)}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 8, color: "#666", textAlign: "center", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {dispName(row._project)} · S{row._segIndex}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>
        );

      // ── Deep-Dive Risk Analytics ───────────────────────────────────────────
      case "deepDive": {
        const BAR_COLORS = ["#4472C4","#C0504D","#9BBB59","#8064A2","#4BACC6","#F79646","#2C4770","#E46C0A","#A9D18E","#7030A0"];

        const pieData = distributions
          ? [
              { name: "Low",     value: distributions.Overall[1] || 0, color: RISK_COLORS[1] },
              { name: "Medium",  value: distributions.Overall[2] || 0, color: RISK_COLORS[2] },
              { name: "High",    value: distributions.Overall[3] || 0, color: RISK_COLORS[3] },
              { name: "Extreme", value: distributions.Overall[4] || 0, color: RISK_COLORS[4] },
            ].filter((d) => d.value > 0)
          : [];

        const barData = attributeFrequency.slice(0, 8).map(([name, count]) => ({
          name: name.length > 16 ? name.slice(0, 14) + "…" : name,
          count,
        }));

        const noData = (msg: string) => (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80%", color: "#bbb", fontSize: 11 }}>{msg}</div>
        );

        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Deep-Dive Risk Analytics")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle="Overall risk distribution · Top contributing attributes across all loaded projects" />
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, overflow: "hidden" }}>

              {/* Left: Pie chart */}
              <div style={{ display: "flex", flexDirection: "column", padding: "8px 6px 4px 12px", borderRight: "1px solid #f0eaf8", overflow: "hidden" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#444", marginBottom: 4, textAlign: "center" }}>Overall Risk Distribution</div>
                {pieData.length === 0
                  ? noData("No score data yet")
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="72%" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <RechartTooltip formatter={(val: number) => [`${val} segments`, ""]} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
              </div>

              {/* Right: Bar chart */}
              <div style={{ display: "flex", flexDirection: "column", padding: "8px 8px 4px 6px", overflow: "hidden" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#444", marginBottom: 4, textAlign: "center" }}>Top Contributing Attributes Across Project</div>
                {barData.length === 0
                  ? noData("No attribute data yet")
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} margin={{ top: 4, right: 8, left: -18, bottom: 50 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-40} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                        <RechartTooltip formatter={(val: number) => [`${val} segments`, "Segments"]} />
                        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                          {barData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </div>

            </div>
          </div>
        );
      }

      // ── Filter Analysis ────────────────────────────────────────────────────
      case "filterAnalysis": {
        const allRows = Object.values(allAttributeRows).flat();
        if (activeFilterNames.length === 0) {
          return (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <SectionHeader title={secTitle(el.id, "Filter Analysis")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle="Reflects active filters from Path Analysis" />
              <div style={{ padding: "12px 14px", color: "#888", fontSize: 12 }}>
                No filters active in Path Analysis.
                <div style={{ marginTop: 4, fontSize: 11, color: "#aaa", lineHeight: 1.6 }}>
                  Go to Path Analysis, enable attribute filters, then return here to see their distributions.
                </div>
              </div>
            </div>
          );
        }
        const BAR_COLORS_F = ["#a020d0","#4472C4","#C0504D","#9BBB59","#4BACC6","#F79646"];
        return (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SectionHeader title={secTitle(el.id, "Filter Analysis")} onTitleChange={(t) => setSecTitle(el.id, t)} subtitle={`Active filters: ${activeFilterNames.join(" · ")}`} />
            {allRows.length === 0
              ? <div style={{ padding: "12px 14px", color: "#888", fontSize: 12 }}>Loading attribute data…</div>
              : (
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px", display: "flex", flexDirection: "column", gap: 18 }}>
                  {activeFilterNames.map((filterName, fi) => {
                    const valueCounts = new Map<string, number>();
                    allRows.forEach((row) => {
                      const val = row[filterName];
                      if (val !== null && val !== undefined && val !== "") {
                        const key = String(val);
                        valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
                      }
                    });
                    const chartData = [...valueCounts.entries()]
                      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                      .map(([name, count]) => ({ name, count }));
                    return (
                      <div key={filterName} style={{ flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#333", marginBottom: 4 }}>{filterName}</div>
                        {chartData.length === 0
                          ? <div style={{ fontSize: 10, color: "#bbb" }}>No data for this attribute.</div>
                          : (
                            <ResponsiveContainer width="100%" height={90}>
                              <BarChart data={chartData} margin={{ top: 2, right: 8, left: -20, bottom: 22 }} barCategoryGap="30%">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
                                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                                <RechartTooltip formatter={(val: number) => [`${val} segments`, "Count"]} />
                                <Bar dataKey="count" fill={BAR_COLORS_F[fi % BAR_COLORS_F.length]} radius={[3, 3, 0, 0]} opacity={0.85} />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        );
      }

      default: return null;
    }
  };

  // ── Dynamic canvas size ───────────────────────────────────────────────────
  const canvasH = useMemo(() => {
    const visible = elements.filter((e) => e.visible);
    if (visible.length === 0) return 3400;
    const maxBottom = Math.max(...visible.map((e) => e.y + e.height));
    return Math.max(1200, maxBottom + 80);
  }, [elements]);

  const pageBreaks = useMemo(() => {
    const breaks: number[] = [];
    let y = PAGE_H;
    while (y < canvasH) { breaks.push(y); y += PAGE_H; }
    return breaks;
  }, [canvasH]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(canvasH / PAGE_H)), [canvasH]);

  // ── Checklist memo ────────────────────────────────────────────────────────
  const [showSections, setShowSections] = useState(false);
  const sectionChecklist = useMemo(() =>
    elements.map((el) => ({ id: el.id, label: el.label, visible: el.visible })),
    [elements]
  );
  const visibleCount = sectionChecklist.filter((s) => s.visible).length;

  // ── Page ──────────────────────────────────────────────────────────────────
  return (
    <div className="rb-page">
      <div className="rb-toolbar">
        <button className="rb-btn rb-btn-secondary" onClick={() => navigate(-1)}>← Back</button>
        <button className="rb-btn rb-btn-secondary" onClick={() => navigate("/analysis/path")} title="Go to Path Analysis to download table or image exports">↗ Path Analysis</button>

        <button
          className={`rb-btn${showSections ? " rb-btn-sections-active" : ""}`}
          onClick={() => setShowSections((s) => !s)}
          title="Toggle report sections panel"
        >
          ☰ Sections ({visibleCount}/{sectionChecklist.length}) {showSections ? "▲" : "▼"}
        </button>

        <button className="rb-btn rb-btn-secondary" onClick={autoFitElements} title="Auto-resize all sections to fit their content and remove gaps">
          ⇅ Auto-fit
        </button>

        <button className="rb-btn rb-btn-secondary" onClick={saveLayout} title="Save current layout to browser storage">
          💾 Save
        </button>
        {hasSaved && (
          <button className="rb-btn rb-btn-secondary" onClick={restoreLayout} title="Restore previously saved layout">
            ↩ Restore
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
          <button className="rb-btn rb-btn-secondary" onClick={() => goToPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0} style={{ padding: "6px 10px" }}>◀</button>
          <span style={{ fontSize: 12, color: "#555", whiteSpace: "nowrap", minWidth: 64, textAlign: "center" }}>Page {currentPage + 1} / {totalPages}</span>
          <button className="rb-btn rb-btn-secondary" onClick={() => goToPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1} style={{ padding: "6px 10px" }}>▶</button>
        </div>

        <div className="rb-export-group">
          <button className="rb-btn" onClick={handleDownloadPDF} disabled={!!exporting}>
            {exporting === "pdf" ? "Generating…" : "↓ PDF"}
          </button>
          <button className="rb-btn rb-btn-primary" onClick={handleDownloadWord} disabled={!!exporting}>
            {exporting === "word" ? "Generating…" : "↓ Word"}
          </button>
        </div>
      </div>

      {showSections && (
        <div className="rb-sections-panel">
          <span className="rb-toggle-label" style={{ fontWeight: 600, color: "#a020d0", flexShrink: 0 }}>Report Sections:</span>
          {sectionChecklist.map((sec) => (
            <label key={sec.id} className="rb-checklist-item">
              <input
                type="checkbox"
                checked={sec.visible}
                onChange={() => sec.visible ? hideElement(sec.id) : showElement(sec.id)}
                style={{ accentColor: "#a020d0" }}
              />
              <span>{sec.label}</span>
            </label>
          ))}
        </div>
      )}

      <div style={{ position: "relative", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Floating page nav arrows on the right side */}
        <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 100, pointerEvents: "none" }}>
          <button
            onClick={() => goToPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #d0c0e8", background: currentPage === 0 ? "#f0f0f0" : "#fff", cursor: currentPage === 0 ? "not-allowed" : "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", opacity: currentPage === 0 ? 0.35 : 1, pointerEvents: "auto", color: "#a020d0" }}
          >▲</button>
          <div style={{ background: "#fff", border: "1px solid #e0d0f0", borderRadius: 14, padding: "4px 10px", fontSize: 11, color: "#a020d0", fontWeight: 700, textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", whiteSpace: "nowrap" }}>
            {currentPage + 1} / {totalPages}
          </div>
          <button
            onClick={() => goToPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #d0c0e8", background: currentPage >= totalPages - 1 ? "#f0f0f0" : "#fff", cursor: currentPage >= totalPages - 1 ? "not-allowed" : "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", opacity: currentPage >= totalPages - 1 ? 0.35 : 1, pointerEvents: "auto", color: "#a020d0" }}
          >▼</button>
        </div>

        <div className="rb-canvas-container" ref={canvasContainerRef} onScroll={handleCanvasScroll}>
        <div className="rb-canvas-hint">
          Drag elements by their purple handle · Resize from corners · Check/uncheck sections above · Export when ready
        </div>
        <div ref={canvasRef} className="rb-canvas" style={{ width: CANVAS_W, height: canvasH }}>
          {pageBreaks.map((yBreak, idx) => (
            <div key={yBreak}>
              <div style={{ position: "absolute", top: yBreak, left: 0, right: 0, height: 1, background: "repeating-linear-gradient(90deg,#c090e0 0px,#c090e0 8px,transparent 8px,transparent 16px)", zIndex: 0, pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: yBreak + 3, right: 8, fontSize: 9, color: "#c090e0", pointerEvents: "none", zIndex: 0 }}>Page {idx + 2}</div>
            </div>
          ))}

          {elements.filter((el) => el.visible).map((el) => (
            <Rnd key={el.id}
              size={{ width: el.width, height: el.height }}
              position={{ x: el.x, y: el.y }}
              onDragStop={(_e, d) => updateElement(el.id, { x: d.x, y: d.y })}
              onResizeStop={(_e, _dir, ref, _delta, pos) => updateElement(el.id, { width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
              bounds="parent" dragHandleClassName="rb-element-handle" minWidth={180} minHeight={80} style={{ zIndex: 1 }}>
              <div className="rb-element" data-element-id={el.id}>
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

      {/* ── Project picker overlay ─────────────────────────────────────── */}
      {showProjectPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 480, maxWidth: "90vw", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.22)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#2d1a4a" }}>Select Projects for Report</div>
            <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
              No projects were carried over from Path Analysis. Select one or more projects below to populate the report, or go to Path Analysis first to load and filter data.
            </div>

            {pickerLoading ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#888", fontSize: 14 }}>Loading projects…</div>
            ) : availableProjects.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#888", fontSize: 14 }}>
                No projects found on this profile. Add projects in Path Analysis first.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="rb-btn rb-btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => setPickerSelected(new Set(availableProjects))}>
                    Select All
                  </button>
                  <button className="rb-btn rb-btn-secondary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => setPickerSelected(new Set())}>
                    Clear
                  </button>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#aaa", alignSelf: "center" }}>
                    {pickerSelected.size} / {availableProjects.length} selected
                  </span>
                </div>
                <div style={{ overflowY: "auto", flex: 1, maxHeight: 320, display: "flex", flexDirection: "column", gap: 4, border: "1px solid #e8e0f0", borderRadius: 10, padding: "10px 12px" }}>
                  {availableProjects.map((name) => {
                    const checked = pickerSelected.has(name);
                    return (
                      <label key={name} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "7px 8px", borderRadius: 8, background: checked ? "#f2e8fc" : "transparent", transition: "background 0.15s" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setPickerSelected((prev) => {
                            const next = new Set(prev);
                            next.has(name) ? next.delete(name) : next.add(name);
                            return next;
                          })}
                          style={{ accentColor: "#a020d0", width: 16, height: 16, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 13, color: "#333" }}>{name}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button className="rb-btn rb-btn-secondary" onClick={() => navigate("/analysis/path")} style={{ fontSize: 13 }}>
                ← Path Analysis
              </button>
              <button
                className="rb-btn"
                disabled={pickerSelected.size === 0}
                onClick={loadSelectedProjects}
                style={{ fontSize: 13 }}
              >
                Load {pickerSelected.size > 0 ? `${pickerSelected.size} Project${pickerSelected.size > 1 ? "s" : ""}` : "Projects"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
