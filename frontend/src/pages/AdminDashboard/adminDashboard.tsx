import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import "./adminDashboard.css";

interface DailyLogin { date: string; count: number; }

interface ProfileStat {
  id: string; name: string; division: string;
  created_at: string; last_active_at: string;
  project_count: number; total_logins: number;
}

interface AdminStats {
  total_accounts: number;
  logins_today: number;
  total_logins: number;
  logins_by_day: DailyLogin[];
  profiles: ProfileStat[];
}

const DAYS_OPTIONS = [7, 14, 30, 90] as const;

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso.slice(0, 10); }
}

function fmtDay(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
  catch { return dateStr; }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [days,    setDays]    = useState<number>(30);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/stats?days=${d}`);
      const data = await res.json() as AdminStats & { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed to load stats");
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  return (
    <div className="adm-root">
      {/* ── Header ── */}
      <div className="adm-header">
        <button className="adm-back" onClick={() => navigate(-1)}>← Back</button>
        <h1 className="adm-title">Admin Dashboard</h1>
        <button className="adm-refresh" onClick={() => load(days)} disabled={loading}>
          {loading ? "…" : "⟳ Refresh"}
        </button>
      </div>

      {error && <div className="adm-error">{error}</div>}

      {!stats && loading && <div className="adm-loading">Loading usage data…</div>}

      {stats && (
        <>
          {/* ── Stat cards ── */}
          <div className="adm-cards">
            <div className="adm-card adm-card-purple">
              <div className="adm-card-val">{stats.total_accounts}</div>
              <div className="adm-card-lbl">Total Accounts Created</div>
            </div>
            <div className="adm-card adm-card-blue">
              <div className="adm-card-val">{stats.logins_today}</div>
              <div className="adm-card-lbl">Logins Today</div>
            </div>
            <div className="adm-card adm-card-green">
              <div className="adm-card-val">{stats.total_logins}</div>
              <div className="adm-card-lbl">Total Logins (All Time)</div>
            </div>
          </div>

          {/* ── Daily logins chart ── */}
          <div className="adm-section">
            <div className="adm-section-head">
              <h2 className="adm-section-title">Daily Logins</h2>
              <div className="adm-tabs">
                {DAYS_OPTIONS.map((d) => (
                  <button
                    key={d}
                    className={`adm-tab${days === d ? " adm-tab-active" : ""}`}
                    onClick={() => setDays(d)}
                  >{d}d</button>
                ))}
              </div>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.logins_by_day}
                  margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e0f4" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDay}
                    tick={{ fontSize: 10, fill: "#666" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#666" }} />
                  <Tooltip
                    formatter={(v: number) => [`${v} login${v === 1 ? "" : "s"}`, "Logins"]}
                    labelFormatter={(l: string) => fmtDay(l)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#8b22cf" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Accounts table ── */}
          <div className="adm-section">
            <h2 className="adm-section-title">
              All Accounts
              <span className="adm-count-badge">{stats.profiles.length}</span>
            </h2>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Division</th>
                    <th>Projects</th>
                    <th>Logins</th>
                    <th>Created</th>
                    <th>Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.profiles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="adm-empty">No accounts yet.</td>
                    </tr>
                  ) : stats.profiles.map((p) => (
                    <tr key={p.id}>
                      <td className="adm-name">{p.name}</td>
                      <td>{p.division || "—"}</td>
                      <td>{p.project_count}</td>
                      <td>{p.total_logins}</td>
                      <td>{fmtDate(p.created_at)}</td>
                      <td>{fmtDate(p.last_active_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
