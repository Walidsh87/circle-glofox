// Program Store (#15 + #96): pure helpers for selling drip-scheduled program templates.
// No Supabase here (coverage-gated, like program.ts).
import { validateProgram, type ProgramInput } from '@/lib/program'

/** A sellable template = a valid program where every session has a 1-based week. */
export function validateTemplate(input: ProgramInput): string | null {
  const base = validateProgram(input)
  if (base) return base
  for (const s of input.sessions) {
    if (s.week == null || !Number.isInteger(s.week) || s.week < 1) {
      return 'Every session needs a week number (1 or higher).'
    }
  }
  return null
}

// Date math on YYYY-MM-DD strings (gym-TZ dates, matching todayInTimezone). Parse as UTC
// midday to dodge DST/offset edge cases, add days, reformat.
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function weekUnlockDate(startDate: string, week: number): string {
  return addDays(startDate, 7 * (week - 1))
}

export function weekEndDate(startDate: string, week: number): string {
  return addDays(weekUnlockDate(startDate, week), 6)
}

export function isWeekUnlocked(startDate: string | null, week: number | null, today: string): boolean {
  if (startDate == null || week == null) return true
  return today >= weekUnlockDate(startDate, week) // YYYY-MM-DD compares lexically
}

export function groupByWeek<T extends { week: number | null }>(sessions: T[]): { week: number | null; sessions: T[] }[] {
  const byWeek = new Map<number | null, T[]>()
  for (const s of sessions) {
    const k = s.week ?? null
    if (!byWeek.has(k)) byWeek.set(k, [])
    byWeek.get(k)!.push(s)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : a - b))
    .map(([week, sessions]) => ({ week, sessions }))
}

export type DripWeek<T> = { week: number | null; locked: boolean; unlockDate: string | null; endDate: string | null; current: boolean; sessions: T[] }

/** Group sessions by week and decide each week's lock state for a drip schedule. */
export function buildDrip<T extends { week: number | null }>(
  startDate: string | null,
  sessions: T[],
  today: string,
): DripWeek<T>[] {
  return groupByWeek(sessions).map(({ week, sessions }) => {
    const unlockDate = startDate != null && week != null ? weekUnlockDate(startDate, week) : null
    const endDate = startDate != null && week != null ? weekEndDate(startDate, week) : null
    return {
      week,
      locked: !isWeekUnlocked(startDate, week, today),
      unlockDate,
      endDate,
      current: unlockDate != null && endDate != null && unlockDate <= today && today <= endDate,
      sessions,
    }
  })
}

export type UpNextPointer = { weekIdx: number; sessionIdx: number }

/**
 * "Up next": the first session in the CURRENT week with no log inside the week's
 * date range. Null for undated programs (no current week) or an all-logged week.
 */
export function upNext<T extends { week: number | null; exercises: { logDays: { date: string }[] }[] }>(
  weeks: DripWeek<T>[],
): UpNextPointer | null {
  const weekIdx = weeks.findIndex((w) => w.current)
  if (weekIdx === -1) return null
  const wk = weeks[weekIdx]
  const sessionIdx = wk.sessions.findIndex(
    (s) => !s.exercises.some((ex) => ex.logDays.some((d) => d.date >= wk.unlockDate! && d.date <= wk.endDate!)),
  )
  return sessionIdx === -1 ? null : { weekIdx, sessionIdx }
}

/** For the storefront: per template id → session count + max week (0 = no week structure). */
export function summarizeTemplateSessions(
  rows: { program_id: string; week: number | null }[],
): Map<string, { weeks: number; sessions: number }> {
  const m = new Map<string, { weeks: number; sessions: number }>()
  for (const r of rows) {
    const cur = m.get(r.program_id) ?? { weeks: 0, sessions: 0 }
    cur.sessions += 1
    if (r.week != null && r.week > cur.weeks) cur.weeks = r.week
    m.set(r.program_id, cur)
  }
  return m
}
