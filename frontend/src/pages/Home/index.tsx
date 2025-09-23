import { useEffect, useState } from 'react'
import { fetchSegments, ping } from '../../api'
import SegmentsTable from '../../components/SegmentsTable'

export default function Home() {
    const [status, setStatus] = useState('checking...')
    const [rows, setRows] = useState<Record<string, string>[]>([])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        ping().then(r => setStatus(r.status)).catch(() => setStatus('offline'))
        fetchSegments().then(setRows).catch(e => setError(String(e)))
    }, [])

    return (
        <div style={{ margin:'24px auto', maxWidth:1100, fontFamily:'system-ui, sans-serif' }}>
            <h1>Home</h1>
            <p>Backend status: <b>{status}</b></p>
            {error && <p style={{ color:'crimson' }}>error:{error}</p>}
            <p>Rows: <b>{rows.length}</b></p>
            <SegmentsTable rows={rows} />
        </div>
    )
}
