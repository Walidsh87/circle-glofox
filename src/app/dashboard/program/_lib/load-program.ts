import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveExercise, resolveProgram, type ProgramExercise, type ProgramSession, type ResolvedExercise } from '@/lib/program'
import { groupLogsByDate, type LogDay, type SetLog } from '@/lib/program-log'

export type EditableProgram = { id: string; title: string; notes: string | null; active: boolean; sessions: ProgramSession[] }
export type ResolvedView = { id: string; title: string; notes: string | null; active: boolean; sessions: { title: string; exercises: ResolvedExercise[] }[] }
// PR2: member view carries the DB exercise id (the per-set log target) + history.
export type LoggableExercise = ResolvedExercise & { id: string; logDays: LogDay[] }
export type MemberProgramView = { id: string; title: string; notes: string | null; startDate: string | null; sessions: { title: string; week: number | null; exercises: LoggableExercise[] }[] }
export type ProgramSummary = { id: string; title: string; source: 'coach' | 'bought'; startDate: string | null; sessionCount: number }

type ExerciseRow = {
  session_id: string
  client_uid: string
  name: string
  lift_name: string | null
  sets: number | null
  reps: string | null
  percentage: number | null
  target_note: string | null
  rest_seconds: number | null
}
type SessionRow = { id: string; client_uid: string; title: string }

function toExercise(e: ExerciseRow): ProgramExercise {
  return {
    client_uid: e.client_uid,
    name: e.name,
    lift_name: e.lift_name,
    sets: e.sets,
    reps: e.reps ?? '',
    percentage: e.percentage,
    target_note: e.target_note,
    rest_seconds: e.rest_seconds,
  }
}

async function loadTree(supabase: SupabaseClient, athleteId: string, boxId: string, programId?: string): Promise<EditableProgram | null> {
  const base = supabase
    .from('member_programs')
    .select('id, title, notes, active')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_template', false)
  const { data: prog } = programId
    ? await base.eq('id', programId).maybeSingle()
    : await base.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!prog) return null
  const p = prog as { id: string; title: string; notes: string | null; active: boolean }

  const { data: sessionRows } = await supabase
    .from('program_sessions')
    .select('id, client_uid, title')
    .eq('program_id', p.id)
    .eq('box_id', boxId)
    .order('position')
  const sessions = (sessionRows ?? []) as SessionRow[]
  const sessionIds = sessions.map((s) => s.id)

  const { data: exerciseRows } = sessionIds.length
    ? await supabase
        .from('program_exercises')
        .select('session_id, client_uid, name, lift_name, sets, reps, percentage, target_note, rest_seconds')
        .in('session_id', sessionIds)
        .eq('box_id', boxId)
        .order('position')
    : { data: [] as ExerciseRow[] }
  const exercises = (exerciseRows ?? []) as ExerciseRow[]

  return {
    id: p.id,
    title: p.title,
    notes: p.notes,
    active: p.active,
    sessions: sessions.map((s) => ({
      client_uid: s.client_uid,
      title: s.title,
      exercises: exercises.filter((e) => e.session_id === s.id).map(toExercise),
    })),
  }
}

/** Raw editable tree for the coach builder. */
export async function loadProgramForEdit(supabase: SupabaseClient, athleteId: string, boxId: string, programId?: string): Promise<EditableProgram | null> {
  return loadTree(supabase, athleteId, boxId, programId)
}

/** Resolved view (prescription + per-athlete kg) for the member + profile card. */
export async function loadResolvedProgram(supabase: SupabaseClient, athleteId: string, boxId: string, programId?: string): Promise<ResolvedView | null> {
  const tree = await loadTree(supabase, athleteId, boxId, programId)
  if (!tree) return null
  const { data: lifts } = await supabase.from('athlete_lifts').select('lift_name, one_rm_grams').eq('athlete_id', athleteId).eq('box_id', boxId)
  const oneRmByLift = new Map(((lifts ?? []) as { lift_name: string; one_rm_grams: number }[]).map((l) => [l.lift_name, l.one_rm_grams]))
  return { id: tree.id, title: tree.title, notes: tree.notes, active: tree.active, sessions: resolveProgram(tree.sessions, oneRmByLift) }
}

/** PR2 member view: resolved exercises carrying their DB id + per-exercise log history. */
export async function loadMemberProgram(supabase: SupabaseClient, athleteId: string, boxId: string, programId?: string): Promise<MemberProgramView | null> {
  const base = supabase
    .from('member_programs')
    .select('id, title, notes, start_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_template', false)
  const { data: prog } = programId
    ? await base.eq('id', programId).maybeSingle()
    : await base.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!prog) return null
  const p = prog as { id: string; title: string; notes: string | null; start_date: string | null }

  const { data: sessionRows } = await supabase.from('program_sessions').select('id, title, week').eq('program_id', p.id).eq('box_id', boxId).order('position')
  const sessions = (sessionRows ?? []) as { id: string; title: string; week: number | null }[]
  const sessionIds = sessions.map((s) => s.id)

  const { data: exerciseRows } = sessionIds.length
    ? await supabase
        .from('program_exercises')
        .select('id, session_id, client_uid, name, lift_name, sets, reps, percentage, target_note, rest_seconds')
        .in('session_id', sessionIds)
        .eq('box_id', boxId)
        .order('position')
    : { data: [] as (ExerciseRow & { id: string })[] }
  const exercises = (exerciseRows ?? []) as (ExerciseRow & { id: string })[]
  const exerciseIds = exercises.map((e) => e.id)

  const [{ data: lifts }, { data: logs }] = await Promise.all([
    supabase.from('athlete_lifts').select('lift_name, one_rm_grams').eq('athlete_id', athleteId).eq('box_id', boxId),
    exerciseIds.length
      ? supabase
          .from('program_set_logs')
          .select('exercise_id, performed_on, set_number, weight_grams, reps, note')
          .eq('athlete_id', athleteId)
          .eq('box_id', boxId)
          .in('exercise_id', exerciseIds)
          .order('performed_on', { ascending: false })
      : Promise.resolve({ data: [] as (SetLog & { exercise_id: string })[] }),
  ])
  const oneRmByLift = new Map(((lifts ?? []) as { lift_name: string; one_rm_grams: number }[]).map((l) => [l.lift_name, l.one_rm_grams]))
  const logsByExercise = new Map<string, SetLog[]>()
  for (const row of (logs ?? []) as (SetLog & { exercise_id: string })[]) {
    const arr = logsByExercise.get(row.exercise_id)
    if (arr) arr.push(row)
    else logsByExercise.set(row.exercise_id, [row])
  }

  return {
    id: p.id,
    title: p.title,
    notes: p.notes,
    startDate: p.start_date,
    sessions: sessions.map((s) => ({
      title: s.title,
      week: s.week,
      exercises: exercises
        .filter((e) => e.session_id === s.id)
        .map((e) => ({
          id: e.id,
          ...resolveExercise(toExercise(e), e.lift_name ? (oneRmByLift.get(e.lift_name) ?? null) : null),
          logDays: groupLogsByDate(logsByExercise.get(e.id) ?? []),
        })),
    })),
  }
}

/** All of a member's active non-template programs (most-recent first), for the picker. */
export async function listActivePrograms(supabase: SupabaseClient, athleteId: string, boxId: string): Promise<ProgramSummary[]> {
  const { data: progs } = await supabase
    .from('member_programs')
    .select('id, title, source_template_id, start_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_template', false)
    .order('created_at', { ascending: false })
  const rows = (progs ?? []) as { id: string; title: string; source_template_id: string | null; start_date: string | null }[]
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const { data: sessRows } = await supabase
    .from('program_sessions')
    .select('program_id')
    .in('program_id', ids)
    .eq('box_id', boxId)
  const counts = new Map<string, number>()
  for (const s of (sessRows ?? []) as { program_id: string }[]) counts.set(s.program_id, (counts.get(s.program_id) ?? 0) + 1)

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    source: r.source_template_id ? 'bought' : 'coach',
    startDate: r.start_date,
    sessionCount: counts.get(r.id) ?? 0,
  }))
}
