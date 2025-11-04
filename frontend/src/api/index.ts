import type { FeatureCollection } from "geojson";

// Health
export async function ping(): Promise<{ status: string }> {
    const res = await fetch('/api/ping')
    if (!res.ok) throw new Error('Failed /api/ping')
    return res.json()
}

// Project list
export interface ProjectListItem {
  name: string;
  tags: string[];
}

interface FileResponse {
  projects: ProjectListItem[];
}

export async function fetchProjectList(): Promise<FileResponse> {
    const res = await fetch('/api/projects')
    if (!res.ok) throw new Error('Failed /api/projects')
    return res.json()
}

// Project detail
export type ProjectDetail = {
  name: string
  versions: string[]
  latest: string
}

export async function fetchProjectDetail(projectName: string): Promise<ProjectDetail> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}`)
  if (!res.ok) throw new Error(`Failed GET /api/projects/${projectName}`)
  return res.json()
}

// 一Project attributes
export type AttributeRow = Record<string, string | number | boolean | null>;
export type AttributesResponse = { rows: AttributeRow[] };

export async function fetchProjectAttributes(projectName: string): Promise<AttributesResponse> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/versions/latest/attributes`)
  
  if (!res.ok) throw new Error(`Failed GET /api/projects/${projectName}/versions/latest/attributes`)
  
  return res.json()
}

// Project GEO data
export async function fetchProjectGeoJSON(projectName: string): Promise<FeatureCollection> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/geodata`)
  if (!res.ok) {
    throw new Error(`Failed GET /api/projects/${projectName}/geodata`)
  }
  return res.json()
}

// ===== types =====
export type AttrMappings = Record<string, Record<string, string>>; // 字段名 -> { "1": "Outer Urban", ... }

// ===== fetch mappings (数字 -> 文本) =====
export async function fetchAttributeMappings(): Promise<AttrMappings> {
  const r = await fetch("/api/projects/attribute-mappings");
  if (!r.ok) throw new Error("Failed to load attribute mappings");
  return r.json();
}

export async function saveAttributes(project: string, rows: AttributeRow[]) {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/attributes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  return res.json();
}

export async function listSourceFolders(opts?: { signal?: AbortSignal }) {
  const res = await fetch("/api/projects/folders", { signal: opts?.signal });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  const data = await res.json();
  return (data?.items ?? []) as string[];
}

export async function createProjectFromFolder(project_name: string, folder_name: string, tags: string[] = []) {
  const res = await fetch("/api/projects/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_name, folder_name, tags }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  // 返回形如 { ok: true, name: "<project>" }
  return (await res.json()) as { ok?: boolean; name?: string };
}

// Delete Project
export async function deleteProject(projectName: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    // 尝试输出后端的错误信息
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || "Delete failed");
  }
  // 预计返回 { ok: true, name: string }
  return (await res.json()) as { ok?: boolean; name?: string };
}

export async function autocodeImage(project: string, imageRef: string) {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/autocode/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageRef }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { updates: Record<string, number>; changed_fields: string[] };
}

export async function autocodeGIS(project: string, coords: number[][]) {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/autocode/gis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coords }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { updates: Record<string, number>; changed_fields: string[] };
}

// ========================================================================
// AUTO-CODE ALL API TYPES
// ========================================================================
// Types for the /autocode/all endpoint that supports both single and bulk modes

// ---------- Request Payloads ----------

// Single mode: Auto-code one image
export type AutoCodeSinglePayload = {
  imageRef: string;        // Image filename
  coords: number[][];      // LineString coordinates [[lon, lat], ...]
  index?: number;          // Row index in attributes table (optional)
};

// Bulk mode (all rows): Auto-code all images in project
export type AutoCodeBulkAllPayload = {
  all: true;               // Flag to process all rows
  save?: boolean;          // Whether to save to disk (default: false for temp changes)
};

// Bulk mode (selected rows): Auto-code specific images
export type AutoCodeBulkIndicesPayload = {
  indices: number[];       // Row indices to process
  save?: boolean;          // Whether to save to disk (default: false for temp changes)
};

// ---------- Response Types ----------

// Single mode response
export type AutoCodeSingleResult = {
  updates: Record<string, number | string>;     // Field updates: {field_name: code}
  saved?: boolean;                               // Whether changes were saved to disk
  changed_fields?: string[];                     // List of fields that actually changed
  field_sources?: Record<string, string>;        // Source per field: {field_name: "CV"|"GIS"}
};

// Bulk mode response
export type AutoCodeBulkResult = {
  saved: boolean;                                      // Whether changes were saved to disk
  total: number;                                       // Total rows attempted
  ok: number;                                          // Number of rows successfully processed
  fail: number;                                        // Number of rows that failed
  errors: { index: number; reason: string }[];         // Detailed error info per failed row
  changed_by_row?: Record<number, string[]>;          // {row_idx: [field_names]} for UI highlighting
  sources_by_row?: Record<number, Record<string, string>>;  // {row_idx: {field: "CV"|"GIS"}} for badges
  updated_attributes?: AttributeRow[];                 // Complete updated attributes table (in-memory)
};

type AutoCodeAllPayload =
  | AutoCodeSinglePayload
  | AutoCodeBulkAllPayload
  | AutoCodeBulkIndicesPayload;

type AutoCodeAllResult = AutoCodeSingleResult | AutoCodeBulkResult;

// ---------- Helper Functions ----------

// Extract error message from response (handles both JSON and text errors)
async function readError(res: Response) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j?.error || text;
  } catch {
    return text;
  }
}

// ---------- API Functions ----------

/**
 * Auto-code attributes using CV and GIS models
 *
 * Supports three modes:
 * 1. Single image: { imageRef, coords, index? }
 * 2. All images: { all: true, save?: false }
 * 3. Selected images: { indices: [0,2,5], save?: false }
 *
 * Key behavior:
 * - When save=false (recommended for bulk), changes are kept in memory only
 * - Returns updated_attributes so UI can display changes without persisting
 * - User must click Save button to persist changes to disk
 *
 * @param project - Project name
 * @param payload - Request payload (see AutoCodeAllPayload types)
 * @returns Response with updates and tracking data (see AutoCodeAllResult types)
 */
export async function autocodeAll(project: string, payload: AutoCodeAllPayload): Promise<AutoCodeAllResult> {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/autocode/all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as AutoCodeAllResult;
}

// ---------- Calculate Score ----------

export type CalculateScoreResult = {
  ok: boolean;
  result_rows: Record<string, any>[];
};

/**
 * Calculate cycleRAP scores for the project using Excel macro
 *
 * @param project - Project name
 * @returns Score calculation results
 */
export async function calculateScore(project: string): Promise<CalculateScoreResult> {
  const res = await fetch(`/api/projects/${encodeURIComponent(project)}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as CalculateScoreResult;
}
