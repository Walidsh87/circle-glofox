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

export function isWeekUnlocked(startDate: string | null, week: number | null, today: string): boolean {
  if (startDate == null || week == null) return true
  return today >= weekUnlockDate(startDate, week) // YYYY-MM-DD compares lexically
}
