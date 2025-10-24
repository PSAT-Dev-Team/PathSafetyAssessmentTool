import type { FeatureCollection } from "geojson";

// Health
export async function ping(): Promise<{ status: string }> {
    const res = await fetch('/api/ping')
    if (!res.ok) throw new Error('Failed /api/ping')
    return res.json()
}

// Project list
interface FileResponse {
  projects: string[];
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

export async function createProjectFromFolder(project_name: string, folder_name: string) {
  const res = await fetch("/api/projects/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_name, folder_name }),
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

// ---- types ----
export type AutoCodeSinglePayload = {
  imageRef: string;
  coords: number[][];
  index?: number;
}; // ← 兼容你现有的

export type AutoCodeBulkAllPayload = {
  all: true;
  save?: boolean; // default true on server
};

export type AutoCodeBulkIndicesPayload = {
  indices: number[];
  save?: boolean;
};

export type AutoCodeSingleResult = {
  updates: Record<string, number | string>;
  saved?: boolean;
  changed_fields?: string[];
};

export type AutoCodeBulkResult = {
  saved: boolean;
  total: number;
  ok: number;
  fail: number;
  errors: { index: number; reason: string }[];
  changed_by_row?: Record<number, string[]>;
};

type AutoCodeAllPayload =
  | AutoCodeSinglePayload
  | AutoCodeBulkAllPayload
  | AutoCodeBulkIndicesPayload;

type AutoCodeAllResult = AutoCodeSingleResult | AutoCodeBulkResult;

// ---- helper to read JSON error bodies when available ----
async function readError(res: Response) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j?.error || text;
  } catch {
    return text;
  }
}

// ---- API ----
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
