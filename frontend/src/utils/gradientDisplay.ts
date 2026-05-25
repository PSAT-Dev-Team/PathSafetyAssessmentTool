export const GRADIENT_STATUS_NOT_ASSESSED = "Not assessed yet";
export const GRADIENT_STATUS_NO_LIDAR_RESULT = "N/A (no LiDAR result)";

type GradientLike = number | string | null | undefined;

export type GradientDisplayKind = "ok" | "warn" | "na" | "pending";
export type GradientDisplayMode = "percent" | "grade" | "status";

export type GradientDisplayState = {
  kind: GradientDisplayKind;
  mode: GradientDisplayMode;
  text: string;
};

function toNumberOrNull(value: GradientLike): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getGradientDisplayState(
  {
    grade,
    gradientPct,
    gradientStatus,
  }: {
    grade?: GradientLike;
    gradientPct?: GradientLike;
    gradientStatus?: string | null;
  },
  options?: {
    percentDigits?: number;
  },
): GradientDisplayState {
  const percentDigits = options?.percentDigits ?? 2;
  const gradeNum = toNumberOrNull(grade);
  const pct = toNumberOrNull(gradientPct);
  const status = typeof gradientStatus === "string" ? gradientStatus.trim() : "";

  if (pct != null) {
    return {
      kind: gradeNum === 2 ? "warn" : "ok",
      mode: "percent",
      text: `${pct >= 0 ? "+" : ""}${pct.toFixed(percentDigits)}%`,
    };
  }

  if (status) {
    return {
      kind: status === GRADIENT_STATUS_NO_LIDAR_RESULT ? "na" : "pending",
      mode: "status",
      text: status,
    };
  }

  if (gradeNum === 1) {
    return {
      kind: "ok",
      mode: "grade",
      text: "Grade 1 (<5°)",
    };
  }

  if (gradeNum === 2) {
    return {
      kind: "warn",
      mode: "grade",
      text: "Grade 2 (≥5°)",
    };
  }

  return {
    kind: "pending",
    mode: "status",
    text: GRADIENT_STATUS_NOT_ASSESSED,
  };
}

export function getGradientDisplayColor(kind: GradientDisplayKind): string {
  switch (kind) {
    case "ok":
      return "#27AE60";
    case "warn":
      return "#E74C3C";
    case "na":
      return "#B7791F";
    case "pending":
    default:
      return "#718096";
  }
}