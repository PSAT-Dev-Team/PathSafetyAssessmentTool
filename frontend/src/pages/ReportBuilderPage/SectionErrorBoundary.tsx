import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  /** Label shown in the fallback (e.g. the section name). */
  label?: string;
  /**
   * When any value in this array changes, the boundary clears its error and
   * retries rendering. Pass values that change on reorder (e.g. layout
   * marginTop/height) so a transient throw during a drag self-heals.
   */
  resetKeys?: unknown[];
  children: ReactNode;
}
interface State { error: Error | null }

/**
 * Catches synchronous render/commit errors from a single report section so one
 * misbehaving section (notably the Leaflet map, which can throw when React moves
 * its DOM node during a dnd-kit reorder) no longer unmounts the whole app into a
 * white screen. Auto-resets when `resetKeys` change.
 */
export default class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the real cause — check the console when a section fails.
    console.error(`[ReportBuilder] section "${this.props.label ?? "?"}" crashed:`, error, info);
  }

  componentDidUpdate(prev: Props) {
    if (!this.state.error) return;
    const a = prev.resetKeys ?? [];
    const b = this.props.resetKeys ?? [];
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100%", padding: 16, gap: 8, color: "#a04040", fontSize: 12, textAlign: "center",
          background: "#fff5f5", border: "1px dashed #e0b0b0", borderRadius: 6,
        }}>
          <div style={{ fontWeight: 600 }}>This section failed to render.</div>
          <div style={{ color: "#b06060" }}>{this.state.error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ padding: "3px 12px", borderRadius: 8, border: "1px solid #d0a0a0", background: "#fff", color: "#a04040", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
