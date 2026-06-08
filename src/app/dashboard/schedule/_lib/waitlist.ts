export type WaitlistEntry = { athlete_id: string; created_at: string }

// Earliest entry = next in line (null if empty).
export function nextInLine(entries: WaitlistEntry[]): WaitlistEntry | null {
  let earliest: WaitlistEntry | null = null
  for (const e of entries) {
    if (!earliest || e.created_at < earliest.created_at) earliest = e
  }
  return earliest
}

// 1-based rank of `athleteId` among `entries` (by created_at asc); null if absent.
export function waitlistPosition(entries: WaitlistEntry[], athleteId: string): number | null {
  const mine = entries.find((e) => e.athlete_id === athleteId)
  if (!mine) return null
  let rank = 1
  for (const e of entries) {
    if (e.athlete_id !== athleteId && e.created_at < mine.created_at) rank++
  }
  return rank
}
