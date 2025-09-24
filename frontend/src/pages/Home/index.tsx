import { useEffect, useState } from 'react'
import { fetchSegments, ping } from '../../api'

interface FileResponse {
  dirs: string[];
}

export default function Home() {
    const [status, setStatus] = useState('checking...')
    const [fileData, setFileData] = useState<FileResponse | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        ping().then(r => setStatus(r.status)).catch(() => setStatus('offline'))
        fetchSegments().then(setFileData).catch(e => setError(String(e)))
    }, [])

    return (
        <div style={{ margin:'24px auto', maxWidth:1100, fontFamily:'system-ui, sans-serif' }}>
            <h1>Home</h1>
            <p>Backend status: <b>{status}</b></p>
            {error && <p style={{ color:'crimson' }}>error:{error}</p>}
            <p>Files:</p>
            {fileData && fileData.dirs.length > 0 ? (
                <ul>
                    {fileData.dirs.map((dirs, index) => (
                        <li key={index}>{dirs}</li>
                    ))}
                </ul>
            ) : (
                <p>No files found</p>
            )}
        </div>
    )
}
