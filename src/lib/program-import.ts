// Program Store batch import (#15/#96): pure parser turning a prose program into a
// ProgramInput for the builder. No Supabase (coverage-gated, like program.ts). Never throws.
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { ProgramInput, ProgramExercise, ProgramSession } from '@/lib/program'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// A few common shorthands coaches use that don't normalize to a catalog label.
const ALIASES: Record<string, string> = {
  rdl: 'romanian_deadlift',
  ohp: 'strict_press',
  cj: 'clean_and_jerk',
  cleanandjerk: 'clean_and_jerk',
  bs: 'back_squat',
  fs: 'front_squat',
  dl: 'deadlift',
}

/** Resolve an exercise name to a LIFT_NAMES value (needed for a % → kg target), or null. */
export function resolveLiftName(name: string): string | null {
  const n = norm(name)
  if (!n) return null
  for (const l of LIFT_NAMES) {
    if (norm(l.value) === n || norm(l.label) === n) return l.value
  }
  return ALIASES[n] ?? null
}

/** Extract an integer % (rounded) from a token, or null. */
export function parsePercent(token: string): number | null {
  const m = token.match(/(\d+(?:\.\d+)?)\s*%/)
  return m ? Math.round(Number(m[1])) : null
}

/** Parse a "5x3" / "4xAMRAP" / "3x8-10" token, or null if it isn't a sets×reps token. */
export function parseSetsReps(token: string): { sets: number | null; reps: string } | null {
  const m = token.match(/^(\d+)\s*[x×]\s*([0-9]+(?:-[0-9]+)?|[A-Za-z][A-Za-z0-9-]*)$/)
  return m ? { sets: Number(m[1]), reps: m[2] } : null
}

type ExResult = { ex: ProgramExercise; pctNoLift: boolean; rounded: boolean; noName: boolean }

function parseExerciseLine(raw: string): ExResult {
  let line = raw.replace(/^[\s•*\-]+/, '').trim()

  // note after — – |
  let target_note: string | null = null
  const noteSplit = line.split(/\s+[—–|]\s+/)
  if (noteSplit.length > 1) {
    line = noteSplit[0].trim()
    target_note = noteSplit.slice(1).join(' — ').trim() || null
  }

  // percentage
  let percentage: number | null = null
  let rounded = false
  const pct = line.match(/@?\s*(\d+(?:\.\d+)?)\s*%/)
  if (pct) {
    const raw2 = Number(pct[1])
    percentage = Math.round(raw2)
    rounded = raw2 !== percentage
    line = line.replace(pct[0], ' ').trim()
  }

  // sets × reps (anywhere in the line), else a bare trailing number → reps
  let sets: number | null = null
  let reps = ''
  const sr = line.match(/(\d+)\s*[x×]\s*([0-9]+(?:-[0-9]+)?|[A-Za-z][A-Za-z0-9-]*)/)
  if (sr) {
    sets = Number(sr[1])
    reps = sr[2]
    line = line.replace(sr[0], ' ').trim()
  } else {
    const bare = line.match(/\s(\d+)\s*$/)
    if (bare) {
      reps = bare[1]
      line = line.replace(/\s\d+\s*$/, '').trim()
    }
  }

  const name = line.replace(/\s{2,}/g, ' ').trim()
  let lift_name: string | null = null
  let pctNoLift = false
  if (percentage != null) {
    lift_name = resolveLiftName(name)
    if (!lift_name) pctNoLift = true
  }

  return {
    ex: { client_uid: crypto.randomUUID(), name, lift_name, sets, reps, percentage, target_note, rest_seconds: null, video_url: null, metric: 'load' },
    pctNoLift,
    rounded,
    noName: name === '',
  }
}

export function parseProgramText(text: string): { input: ProgramInput; warnings: string[] } {
  const warnings: string[] = []
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n')

  let title = ''
  const notes: string[] = []
  const sessions: ProgramSession[] = []
  let currentWeek: number | null = null
  let current: ProgramSession | null = null
  let started = false
  let weekDefaulted = false

  lines.forEach((rawLine, idx) => {
    const ln = idx + 1
    const line = rawLine.trim()
    if (!line) return

    if (line.startsWith('>')) {
      const n = line.slice(1).trim()
      if (n) notes.push(n)
      return
    }

    const wk = line.match(/^(?:week|wk)\b\D*(\d+)/i)
    if (wk) {
      currentWeek = Number(wk[1])
      current = null
      started = true
      return
    }

    if (/^(?:day|session|block|phase)\b/i.test(line)) {
      if (currentWeek == null) {
        currentWeek = 1
        if (!weekDefaulted) {
          warnings.push('No "Week" marker found — placed sessions in Week 1.')
          weekDefaulted = true
        }
      }
      current = { client_uid: crypto.randomUUID(), title: line, week: currentWeek, exercises: [] }
      sessions.push(current)
      started = true
      return
    }

    if (!started) {
      if (!title) { title = line; return }
      warnings.push(`Line ${ln}: "${line}" ignored before the first Week/Day (use ">" for notes).`)
      return
    }

    if (!current) {
      warnings.push(`Line ${ln}: "${line}" ignored — it's before the first Day/Session.`)
      return
    }

    const { ex, pctNoLift, rounded, noName } = parseExerciseLine(line)
    if (noName) {
      warnings.push(`Line ${ln}: skipped a line with no exercise name.`)
      return
    }
    if (rounded) warnings.push(`Line ${ln}: "${ex.name}" — percentage rounded to ${ex.percentage}%.`)
    if (pctNoLift) warnings.push(`Line ${ln}: "${ex.name}" has a % but isn't a known lift — pick a catalog lift in review, or drop the %.`)
    current.exercises.push(ex)
  })

  if (!title) warnings.push('No title line found — add a program title in review.')
  if (sessions.length === 0) warnings.push('No sessions found — add "Week 1" then a "Day A" line.')
  sessions.forEach((s) => { if (s.exercises.length === 0) warnings.push(`"${s.title}" has no exercises.`) })

  return { input: { title, notes: notes.join('\n') || null, sessions }, warnings }
}
