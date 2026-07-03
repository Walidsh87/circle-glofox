// #87 PR2: per-set logging — pure grouping + validation (no Supabase).
// Program-UX upgrade: metric-aware — an exercise is logged as weight×reps ('load',
// the default), time ('time' → duration_seconds), distance ('distance' →
// distance_meters) or calories ('calories'). Exactly the matching field is required.
import type { ExerciseMetric } from '@/lib/program'

export type SetLog = {
  performed_on: string
  set_number: number
  weight_grams: number | null
  reps: number | null
  note: string | null
  duration_seconds: number | null
  distance_meters: number | null
  calories: number | null
}
export type LogDay = { date: string; sets: SetLog[] }
export type SetEntry = {
  setNumber: number
  weightKg: number | null
  reps: number | null
  durationSeconds: number | null
  distanceMeters: number | null
  calories: number | null
}

const MAX_KG = 2000
const MAX_REPS = 1000
const MAX_SETS = 50
const MAX_DURATION = 6 * 3600 // 6h
const MAX_DISTANCE = 100_000 // 100 km
const MAX_CALORIES = 5000

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
export function validateSetEntries(entries: SetEntry[], metric: ExerciseMetric = 'load'): string | null {
  if (entries.length === 0) return 'Log at least one set.'
  if (entries.length > MAX_SETS) return `Too many sets (max ${MAX_SETS}).`
  const seen = new Set<number>()
  for (const e of entries) {
    if (!Number.isInteger(e.setNumber) || e.setNumber <= 0 || e.setNumber > MAX_SETS) return 'Invalid set number.'
    if (seen.has(e.setNumber)) return 'Duplicate set number.'
    seen.add(e.setNumber)
    if (metric === 'load') {
      if (e.weightKg != null && (!(e.weightKg >= 0) || e.weightKg > MAX_KG)) return `Weight must be between 0 and ${MAX_KG} kg.`
      if (e.reps != null && (!Number.isInteger(e.reps) || e.reps < 0 || e.reps > MAX_REPS)) return `Reps must be between 0 and ${MAX_REPS}.`
    } else if (metric === 'time') {
      if (e.durationSeconds == null) return 'Enter a time for every set.'
      if (!Number.isInteger(e.durationSeconds) || e.durationSeconds <= 0 || e.durationSeconds > MAX_DURATION) return 'Time must be between 0:01 and 6:00:00.'
    } else if (metric === 'distance') {
      if (e.distanceMeters == null) return 'Enter a distance for every set.'
      if (!Number.isInteger(e.distanceMeters) || e.distanceMeters <= 0 || e.distanceMeters > MAX_DISTANCE) return `Distance must be between 1 and ${MAX_DISTANCE} m.`
    } else {
      if (e.calories == null) return 'Enter calories for every set.'
      if (!Number.isInteger(e.calories) || e.calories <= 0 || e.calories > MAX_CALORIES) return `Calories must be between 1 and ${MAX_CALORIES}.`
    }
  }
  return null
}

export function kgToGrams(kg: number): number {
  return Math.round(kg * 1000)
}

/** "7:42" or "1:07:42" or "95" (bare seconds) → seconds; null if unparseable. */
export function parseDuration(input: string): number | null {
  const s = input.trim()
  if (s === '') return null
  if (!/^\d+(:[0-5]?\d){0,2}$/.test(s)) return null
  const parts = s.split(':').map(Number)
  const sec = parts.reduce((acc, p) => acc * 60 + p, 0)
  return sec > 0 ? sec : null
}

/** Seconds → "m:ss" (or "h:mm:ss" past an hour). */
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** The metric's value for one set (grams for load; sec/m/cal otherwise). */
export function setValue(s: SetLog, metric: ExerciseMetric): number | null {
  if (metric === 'time') return s.duration_seconds
  if (metric === 'distance') return s.distance_meters
  if (metric === 'calories') return s.calories
  return s.weight_grams
}

/** Lower-is-better only for time; everything else is higher-is-better. */
function beats(a: number, b: number, metric: ExerciseMetric): boolean {
  return metric === 'time' ? a < b : a > b
}

/** Best single set across all logs for the metric (load ties → higher reps, then newer). */
export function bestSet(logs: SetLog[], metric: ExerciseMetric = 'load'): SetLog | null {
  let best: SetLog | null = null
  let bestVal: number | null = null
  for (const l of logs) {
    const v = setValue(l, metric)
    if (v == null) continue
    if (
      bestVal == null ||
      beats(v, bestVal, metric) ||
      (v === bestVal &&
        best != null &&
        (metric === 'load'
          ? (l.reps ?? -1) > (best.reps ?? -1) || ((l.reps ?? -1) === (best.reps ?? -1) && l.performed_on > best.performed_on)
          : l.performed_on > best.performed_on))
    ) {
      best = l
      bestVal = v
    }
  }
  return best
}

export type DayBest = { date: string; value: number; isPr: boolean }

/**
 * Per-day best value (chronological) with a PR flag: strictly beats the running
 * best before that day. First day is the baseline, not a PR (detectPr semantics).
 */
export function dayBests(days: LogDay[], metric: ExerciseMetric = 'load'): DayBest[] {
  const chronological = [...days].sort((a, b) => (a.date < b.date ? -1 : 1))
  const out: DayBest[] = []
  let running: number | null = null
  for (const d of chronological) {
    let dayBest: number | null = null
    for (const s of d.sets) {
      const v = setValue(s, metric)
      if (v == null) continue
      if (dayBest == null || beats(v, dayBest, metric)) dayBest = v
    }
    if (dayBest == null) continue
    const isPr = running != null && beats(dayBest, running, metric)
    if (running == null || beats(dayBest, running, metric)) running = dayBest
    out.push({ date: d.date, value: dayBest, isPr })
  }
  return out
}
