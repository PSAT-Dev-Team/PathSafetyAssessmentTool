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