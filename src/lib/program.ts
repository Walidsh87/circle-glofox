// #87 follow-on: structured training program — pure validation + per-athlete
// load resolution (the wedge). No Supabase here (coverage-gated, like goals.ts).
import { loadForPercent } from '@/lib/percentage'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'

export type ProgramExercise = {
  client_uid: string // stable id → diff-save key + per-set log target
  name: string
  lift_name: string | null // LIFT_NAMES value → enables %→kg
  sets: number | null
  reps: string // free text: "5", "5-8", "AMRAP"
  percentage: number | null // %1RM (needs lift_name)
  target_note: string | null // "RPE 8", "bodyweight"
  rest_seconds: number | null
}
export type ProgramSession = { client_uid: string; title: string; exercises: ProgramExercise[] }
export type ProgramInput = { title: string; notes: string | null; sessions: ProgramSession[] }

export type ResolvedExercise = ProgramExercise & {
  load: { exactKg: number; barKg: number } | null
  needsOneRm: boolean // lift + % prescribed but the athlete has no 1RM on file
}

const LIFT_VALUES = new Set(LIFT_NAMES.map((l) => l.value))
const MAX_PCT = 200
// client_uids are interpolated into a PostgREST `in (...)` filter on save — enforce
// strict UUID shape here so a crafted id can't break/inject that filter.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateProgram(input: ProgramInput): string | null {
  if (!input.title || !input.title.trim()) return 'Give the program a title.'
  if (input.title.trim().length > 120) return 'Title is too long (max 120 characters).'
  if (!input.sessions || input.sessions.length === 0) return 'Add at least one session.'

  const sessionUids = new Set<string>()
  for (const s of input.sessions) {
    if (!s.title || !s.title.trim()) return 'Every session needs a title.'
    if (s.title.trim().length > 80) return 'Session title is too long (max 80 characters).'
    if (!s.client_uid || !UUID_RE.test(s.client_uid)) return 'Session has an invalid id.'
    if (sessionUids.has(s.client_uid)) return 'Duplicate session id.'
    sessionUids.add(s.client_uid)
    const uids = new Set<string>()
    for (const ex of s.exercises) {
      if (!ex.name || !ex.name.trim()) return 'Every exercise needs a name.'
      if (ex.name.trim().length > 80) return 'Exercise name is too long (max 80 characters).'
      if (ex.lift_name && !LIFT_VALUES.has(ex.lift_name)) return `Unknown lift: ${ex.lift_name}.`
      if (ex.sets != null && (!Number.isInteger(ex.sets) || ex.sets <= 0 || ex.sets > 50)) return 'Sets must be between 1 and 50.'
      if (ex.percentage != null) {
        if (!Number.isInteger(ex.percentage) || ex.percentage <= 0 || ex.percentage > MAX_PCT) return `Percentage must be between 1 and ${MAX_PCT}.`
        if (!ex.lift_name) return 'A % target needs a lift selected.'
      }
      if (ex.reps && ex.reps.length > 20) return 'Reps is too long (max 20 characters).'
      if (!ex.client_uid || !UUID_RE.test(ex.client_uid)) return 'Exercise has an invalid id.'
      if (uids.has(ex.client_uid)) return 'Duplicate exercise id in a session.'
      uids.add(ex.client_uid)
    }
  }
  return null
}

/** Resolve an exercise's prescribed load from the athlete's 1RM (grams). */
export function resolveExercise(ex: ProgramExercise, oneRmGrams: number | null): ResolvedExercise {
  if (ex.lift_name && ex.percentage != null) {
    if (oneRmGrams == null) return { ...ex, load: null, needsOneRm: true }
    return { ...ex, load: loadForPercent(oneRmGrams, ex.percentage), needsOneRm: false }
  }
  return { ...ex, load: null, needsOneRm: false }
}

export function resolveProgram(
  sessions: ProgramSession[],
  oneRmByLift: Map<string, number>,
): { title: string; exercises: ResolvedExercise[] }[] {
  return sessions.map((s) => ({
    title: s.title,
    exercises: s.exercises.map((ex) => resolveExercise(ex, ex.lift_name ? (oneRmByLift.get(ex.lift_name) ?? null) : null)),
  }))
}
