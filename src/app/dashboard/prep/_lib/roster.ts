// Latest checked-in class start strictly before `nowIso`, per athlete.
export function lastAttendedByAthlete(
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

// 'first time' (null) | 'Today' | weekday within 7 days | '{n}d ago'.
export function relativeDay(iso: string | null, todayIso: string): string {
  if (!iso) return 'first time'
  const day = iso.slice(0, 10)
  if (day === todayIso) return 'Today'
  const then = new Date(day + 'T00:00:00Z').getTime()
  const today = new Date(todayIso + 'T00:00:00Z').getTime()
  const diffDays = Math.round((today - then) / 86_400_000)
  if (diffDays >= 1 && diffDays <= 7) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(then)
  }
  return `${diffDays}d ago`
}
