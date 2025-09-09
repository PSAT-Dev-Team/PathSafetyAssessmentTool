export async function fetchSegments(): Promise<Record<string, string>[]> {
    const res = await fetch('/api/segments')
    if (!res.ok) throw new Error('Failed /api/segments')
    return res.json()
}

export async function ping(): Promise<{ status: string }> {
    const res = await fetch('/api/health')
    if (!res.ok) throw new Error('Failed /api/health')
    return res.json()
}
