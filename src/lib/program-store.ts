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
