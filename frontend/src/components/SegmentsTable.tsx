export default function SegmentsTable({ rows }: { rows: Record<string, string>[] }) {
	if (!rows?.length) return <p>No Data</p>
	const columns = Object.keys(rows[0])

	return (
		<div style={{ overflowX:'auto' }}>
			<table style={{ width:'100%', borderCollapse:'collapse' }}>
				<thead>
					<tr>
						{columns.map(c => (
							<th key={c} style={{ textAlign:'left', borderBottom:'1px solid #eee', padding:8 }}>{c}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						<tr key={i}>
						{columns.map(c => (
							<td key={c} style={{ borderBottom:'1px solid #f6f6f6', padding:8 }}>
								{String(r[c] ?? '')}
							</td>
						))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
