// Latest checked-in class start strictly before `nowIso`, per athlete.
export function lastCheckInByAthlete(
  rows: { athlete_id: string; starts_at: string | null }[],
  nowIso: string,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    if (!r.starts_at || r.starts_at >= nowIso) continue
    const cur = out.get(r.athlete_id)
    if (!cur || r.starts_at > cur) out.set(r.athlete_id, r.starts_at)
  }
  return out
}

// Whole days from `fromIso` to `toIso` (to - from). Accepts dates or timestamps.
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + 'T00:00:00Z').getTime()
  const to = new Date(toIso.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((to - from) / 86_400_000)
}
