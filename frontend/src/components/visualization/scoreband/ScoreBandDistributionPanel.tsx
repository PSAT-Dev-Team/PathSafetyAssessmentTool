import { useState, useEffect, useCallback } from "react";
import ScoreBandPieChart from "./ScoreBandPieChart";
import "./ScoreBandDistributionPanel.css";

interface ScoreBandDistributionPanelProps {
  projectName: string;
}

type BandDistribution = Record<number, number>;

interface CrashTypeDistributions {
  VB: BandDistribution;
  BB: BandDistribution;
  SB: BandDistribution;
  BP: BandDistribution;
  Overall: BandDistribution;
}

interface ScoreResultRow {
  "BB": number;
  "BB Band": number;
  "BP": number;
  "BP Band": number;
  "SB": number;
  "SB Band": number;
  "VB": number;
  "VB Band": number;
  "Overall Risk Level"?: number;
  "Overall Risk Level Band"?: number;
  "CycleRAP score"?: number; // Backward compatibility for existing projects
  "CycleRAP score Band"?: number; // Backward compatibility for existing projects
}

interface ScoreResultsResponse {
  ok: boolean;
  result_rows: ScoreResultRow[];
}

const CRASH_TYPE_LABELS: Record<string, string> = {
  VB: "Vehicle-Bicycle (VB)",
  BB: "Bicycle-Bicycle (BB)",
  SB: "Single-Bicycle (SB)",
  BP: "Bicycle-Pedestrian (BP)",
  Overall: "Overall Risk Level",
};

export function ScoreBandDistributionPanel({
  projectName,
}: ScoreBandDistributionPanelProps) {
  const [distributions, setDistributions] = useState<CrashTypeDistributions | null>(null);
  const [totalSegments, setTotalSegments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Process band distributions from API response
  const processBandDistributions = useCallback(
    (resultRows: ScoreResultRow[]): CrashTypeDistributions => {
      // Initialize all 4 bands to 0
      const distributions: CrashTypeDistributions = {
        VB: { 1: 0, 2: 0, 3: 0, 4: 0 },
        BB: { 1: 0, 2: 0, 3: 0, 4: 0 },
        SB: { 1: 0, 2: 0, 3: 0, 4: 0 },
        BP: { 1: 0, 2: 0, 3: 0, 4: 0 },
        Overall: { 1: 0, 2: 0, 3: 0, 4: 0 },
      };

      // Count occurrences of each band
      resultRows.forEach((row) => {
        const vbBand = row["VB Band"];
        const bbBand = row["BB Band"];
        const sbBand = row["SB Band"];
        const bpBand = row["BP Band"];
        // Handle both new and old column names for backward compatibility
        const overallBand = row["Overall Risk Level Band"] ?? row["CycleRAP score Band"];

        // Count valid bands (1-4), skip 0 and other invalid values
        if (vbBand >= 1 && vbBand <= 4) distributions.VB[vbBand]++;
        if (bbBand >= 1 && bbBand <= 4) distributions.BB[bbBand]++;
        if (sbBand >= 1 && sbBand <= 4) distributions.SB[sbBand]++;
        if (bpBand >= 1 && bpBand <= 4) distributions.BP[bpBand]++;
        if (overallBand !== undefined && overallBand >= 1 && overallBand <= 4) distributions.Overall[overallBand]++;
      });

      return distributions;
    },
    []
  );

  // Fetch results from API
  const fetchResults = useCallback(async () => {
    if (!projectName) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectName)}/results`
      );
      if (!res.ok) throw new Error("Failed to load results");

      const data: ScoreResultsResponse = await res.json();

      if (data.ok && Array.isArray(data.result_rows)) {
        const dist = processBandDistributions(data.result_rows);
        setDistributions(dist);
        setTotalSegments(data.result_rows.length);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load score distributions");
      console.error("Error loading score distributions:", e);
    } finally {
      setLoading(false);
    }
  }, [projectName, processBandDistributions]);

  // Initial fetch on mount
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Listen for score updates
  useEffect(() => {
    const handleScoresUpdated = () => {
      console.log("Scores updated, refreshing distributions...");
      fetchResults();
    };

    window.addEventListener("psat:scores:updated", handleScoresUpdated);
    return () => window.removeEventListener("psat:scores:updated", handleScoresUpdated);
  }, [fetchResults]);

  return (
    <div className="score-band-panel">
      {/* Collapsible Header */}
      <div
        className="score-band-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>
            Overall Risk Level Band Distributions {isExpanded ? "▼" : "▶"}
          </h3>
          {/* Quick summary when collapsed */}
          {!isExpanded && totalSegments > 0 && (
            <span style={{ fontSize: "14px", color: "#666", fontWeight: "normal" }}>
              {totalSegments} segments analyzed
            </span>
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="score-band-content">
          {/* Loading State */}
          {loading && (
            <div className="score-band-loading">
              <div className="spinner"></div>
              <p>Loading score distributions...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="score-band-error">
              <p>❌ {error}</p>
              <button
                onClick={fetchResults}
                style={{
                  marginTop: "12px",
                  padding: "6px 12px",
                  backgroundColor: "#3498db",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && totalSegments === 0 && (
            <div className="score-band-empty">
              <p>No score data available. Click "Calculate Score" in the sidebar to generate scores.</p>
            </div>
          )}

          {/* Charts Grid */}
          {!loading && !error && distributions && totalSegments > 0 && (
            <div className="score-band-charts-container">
              {/* Overall Risk Level - Full Width at Top */}
              <div className="score-band-overall">
                <ScoreBandPieChart
                  crashType={CRASH_TYPE_LABELS.Overall}
                  bandCounts={distributions.Overall}
                />
              </div>

              {/* 4 Crash Types in 2x2 Grid */}
              <div className="score-band-grid">
                <div className="score-band-grid-item">
                  <ScoreBandPieChart
                    crashType={CRASH_TYPE_LABELS.VB}
                    bandCounts={distributions.VB}
                  />
                </div>
                <div className="score-band-grid-item">
                  <ScoreBandPieChart
                    crashType={CRASH_TYPE_LABELS.BB}
                    bandCounts={distributions.BB}
                  />
                </div>
                <div className="score-band-grid-item">
                  <ScoreBandPieChart
                    crashType={CRASH_TYPE_LABELS.SB}
                    bandCounts={distributions.SB}
                  />
                </div>
                <div className="score-band-grid-item">
                  <ScoreBandPieChart
                    crashType={CRASH_TYPE_LABELS.BP}
                    bandCounts={distributions.BP}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ScoreBandDistributionPanel;
