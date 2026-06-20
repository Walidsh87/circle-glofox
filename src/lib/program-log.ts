// #87 PR2: per-set logging — pure grouping + validation (no Supabase).

export type SetLog = { performed_on: string; set_number: number; weight_grams: number | null; reps: number | null; note: string | null }
export type LogDay = { date: string; sets: SetLog[] }
export type SetEntry = { setNumber: number; weightKg: number | null; reps: number | null }

const MAX_KG = 2000
const MAX_REPS = 1000
const MAX_SETS = 50

/** Group raw set logs into days (newest first; sets ordered within a day). */
export function groupLogsByDate(logs: SetLog[]): LogDay[] {
  const byDate = new Map<string, SetLog[]>()
  for (const l of logs) {
    const arr = byDate.get(l.performed_on)
    if (arr) arr.push(l)
    else byDate.set(l.performed_on, [l])
  }
  return [...byDate.entries()]
    .map(([date, sets]) => ({ date, sets: [...sets].sort((a, b) => a.set_number - b.set_number) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function isValidPerformedOn(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Returns a human error, or null. Drops nothing — caller persists what's valid. */
export function validateSetEntries(entries: SetEntry[]): string | null {
  if (entries.length === 0) return 'Log at least one set.'
  if (entries.length > MAX_SETS) return `Too many sets (max ${MAX_SETS}).`
  const seen = new Set<number>()
  for (const e of entries) {
    if (!Number.isInteger(e.setNumber) || e.setNumber <= 0 || e.setNumber > MAX_SETS) return 'Invalid set number.'
    if (seen.has(e.setNumber)) return 'Duplicate set number.'
    seen.add(e.setNumber)
    if (e.weightKg != null && (!(e.weightKg >= 0) || e.weightKg > MAX_KG)) return `Weight must be between 0 and ${MAX_KG} kg.`
    if (e.reps != null && (!Number.isInteger(e.reps) || e.reps < 0 || e.reps > MAX_REPS)) return `Reps must be between 0 and ${MAX_REPS}.`
  }
  return null
}

export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000)
}
