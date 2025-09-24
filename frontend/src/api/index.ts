interface FileResponse {
  dirs: string[];
}
export async function fetchSegments(): Promise<FileResponse> {
    const res = await fetch('/api/project/list')
    if (!res.ok) throw new Error('Failed /api/project/list')
    return res.json()
}

export async function ping(): Promise<{ status: string }> {
    const res = await fetch('/api/ping')
    if (!res.ok) throw new Error('Failed /api/ping')
    return res.json()
}
