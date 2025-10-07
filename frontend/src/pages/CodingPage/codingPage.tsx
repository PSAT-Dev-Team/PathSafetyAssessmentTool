import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { fetchProjectDetail, fetchProjectAttributes, fetchProjectGeoJSON } from "../../api";
import type { FeatureCollection, Feature } from "geojson";

// 兜底类型
type ProjectDetail = { name: string; versions: string[]; latest: string };
type AttributeRow = Record<string, string | number | boolean | null>;
type AttributesResponse = { rows: AttributeRow[] };

export default function CodingPage() {
  const { projectName } = useParams<{ projectName: string }>();

  const name = useMemo(() => {
    if (!projectName) return null;
    try { return decodeURIComponent(projectName); } catch { return projectName; }
  }, [projectName]);

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [attrs, setAttrs] = useState<AttributeRow[] | null>(null);

  // ⬇️ 现在存放“原始 features”，而不是拍平后的行
  const [geoFeatures, setGeoFeatures] = useState<Feature[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAllAttrs, setShowAllAttrs] = useState(false);
  const [showAllGeo, setShowAllGeo] = useState(false);

  const load = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    setError(null);
    setDetail(null);
    setAttrs(null);
    setGeoFeatures(null);
    try {
      const [d, a, gjson] = await Promise.all([
        fetchProjectDetail(name),
        fetchProjectAttributes(name) as Promise<AttributesResponse>,
        fetchProjectGeoJSON(name) as Promise<FeatureCollection>,
      ]);
      setDetail(d);
      setAttrs(a?.rows ?? []);
      // ⬇️ 不拍平，直接保留最原始的 features
      setGeoFeatures(gjson.features ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    if (!name) return;
    load();
  }, [name, load]);

  // attributes 表格列（保持不变）
  const attrCols = useMemo(() => {
    if (!attrs || attrs.length === 0) return [] as string[];
    const colset = new Set<string>();
    for (const r of attrs) Object.keys(r).forEach((k) => colset.add(k));
    return Array.from(colset);
  }, [attrs]);

  if (!name) return <div>No project selected.</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h1 style={{ marginBottom: 8 }}>CODING PAGE</h1>
      <p>Current project: <b>{name}</b></p>

      {loading && <div style={{ marginTop: 12 }}>Loading project detail, attributes & geodata…</div>}

      {error && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          Error: {error}{" "}
          <button onClick={() => load()} style={{ marginLeft: 8 }}>
            Retry
          </button>
        </div>
      )}

      {/* 项目元数据 */}
      {detail && !loading && !error && (
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Name:</strong> {detail.name}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Latest version:</strong> {detail.latest}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>All versions:</strong>{" "}
            {detail.versions?.length ? detail.versions.join(", ") : "(none)"}
          </div>
        </div>
      )}

      {/* Attributes 表格（保持不变） */}
      {attrs && !loading && !error && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Attributes (latest)</h3>
            <span style={{ opacity: 0.8 }}>{attrs.length} rows • {attrCols.length} columns</span>
            {attrs.length > 50 && (
              <button onClick={() => setShowAllAttrs((s) => !s)}>
                {showAllAttrs ? "Show first 50" : "Show all"}
              </button>
            )}
          </div>

          <div style={{ border: "1px solid #e5e5e5", borderRadius: 8, overflow: "auto", maxHeight: 420 }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
              <thead style={{ position: "sticky", top: 0, background: "#fafafa" }}>
                <tr>
                  {attrCols.map((col) => (
                    <th
                      key={col}
                      style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e5e5e5", whiteSpace: "nowrap" }}
                      title={col}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(showAllAttrs ? attrs : attrs.slice(0, 50)).map((row, idx) => (
                  <tr key={idx}>
                    {attrCols.map((col) => (
                      <td
                        key={col}
                        style={{
                          padding: "8px 12px",
                          borderBottom: "1px solid #f0f0f0",
                          verticalAlign: "top",
                          maxWidth: 360,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={String(row?.[col] ?? "")}
                      >
                        {String(row?.[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary>Raw attributes (first row)</summary>
            <pre style={{ background: "#f5f5f5", padding: 12, overflow: "auto" }}>
{JSON.stringify(attrs[0] ?? {}, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* === Geodata 原始数据（不做合并，不拍平） === */}
      {geoFeatures && !loading && !error && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Geodata (raw GeoJSON features)</h3>
            <span style={{ opacity: 0.8 }}>{geoFeatures.length} features</span>
            {geoFeatures.length > 50 && (
              <button onClick={() => setShowAllGeo((s) => !s)}>
                {showAllGeo ? "Show first 50" : "Show all"}
              </button>
            )}
          </div>

          {(showAllGeo ? geoFeatures : geoFeatures.slice(0, 50)).map((f: Feature, i: number) => (
            <details key={i} style={{ marginBottom: 12 }}>
              <summary>Feature #{i + 1} • geometry: {f.geometry?.type ?? "None"}</summary>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>properties</div>
                  <pre style={{ background:"#f5f5f5", padding:12, overflow:"auto" }}>
{JSON.stringify(f.properties ?? {}, null, 2)}
                  </pre>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>geometry</div>
                  <pre style={{ background:"#f5f5f5", padding:12, overflow:"auto" }}>
{JSON.stringify(f.geometry ?? null, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          ))}

          {/* 可选：打印完整的 FeatureCollection 头两个 feature 供调试 */}
          <details style={{ marginTop: 12 }}>
            <summary>Raw features (first)</summary>
            <pre style={{ background: "#f5f5f5", padding: 12, overflow: "auto" }}>
{JSON.stringify(geoFeatures[2] ?? {}, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
