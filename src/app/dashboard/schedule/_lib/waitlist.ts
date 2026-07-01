export type WaitlistEntry = { athlete_id: string; created_at: string }

// Earliest entry = next in line (null if empty).
export function nextInLine(entries: WaitlistEntry[]): WaitlistEntry | null {
  let earliest: WaitlistEntry | null = null
  for (const e of entries) {
    if (!earliest || e.created_at < earliest.created_at) earliest = e
  }
  return earliest
}
