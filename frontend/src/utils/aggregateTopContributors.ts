export interface TopContributor {
  name: string;
  contribution: number;
}

export function aggregateTopContributors(
  scoresSlice: Array<Record<string, unknown> | null | undefined>,
  topN = 5,
): TopContributor[] {
  const totals = new Map<string, number>();

  for (const row of scoresSlice) {
    if (!row) continue;
    for (let i = 1; i <= 5; i++) {
      const name = row[`Top ${i} Contributor`];
      const contrib = row[`Top ${i} Contribution`];
      if (typeof name !== "string" || !name) continue;
      if (typeof contrib !== "number" || !Number.isFinite(contrib)) continue;
      totals.set(name, (totals.get(name) ?? 0) + contrib);
    }
  }

  return Array.from(totals.entries())
    .map(([name, contribution]) => ({ name, contribution }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, topN);
}
