import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveExercise, resolveProgram, type ProgramExercise, type ProgramSession, type ResolvedExercise } from '@/lib/program'
import { groupLogsByDate, type LogDay, type SetLog } from '@/lib/program-log'

export type EditableProgram = { id: string; title: string; notes: string | null; active: boolean; sessions: ProgramSession[] }
export type ResolvedView = { id: string; title: string; notes: string | null; active: boolean; sessions: { title: string; exercises: ResolvedExercise[] }[] }
// PR2: member view carries the DB exercise id (the per-set log target) + history.
export type LoggableExercise = ResolvedExercise & { id: string; logDays: LogDay[] }
export type MemberProgramView = { id: string; title: string; notes: string | null; sessions: { title: string; exercises: LoggableExercise[] }[] }

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

async function loadTree(supabase: SupabaseClient, athleteId: string, boxId: string): Promise<EditableProgram | null> {
  const { data: prog } = await supabase
    .from('member_programs')
    .select('id, title, notes, active')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_template', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
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
export async function loadProgramForEdit(supabase: SupabaseClient, athleteId: string, boxId: string): Promise<EditableProgram | null> {
  return loadTree(supabase, athleteId, boxId)
}

/** Resolved view (prescription + per-athlete kg) for the member + profile card. */
export async function loadResolvedProgram(supabase: SupabaseClient, athleteId: string, boxId: string): Promise<ResolvedView | null> {
  const tree = await loadTree(supabase, athleteId, boxId)
  if (!tree) return null
  const { data: lifts } = await supabase.from('athlete_lifts').select('lift_name, one_rm_grams').eq('athlete_id', athleteId).eq('box_id', boxId)
  const oneRmByLift = new Map(((lifts ?? []) as { lift_name: string; one_rm_grams: number }[]).map((l) => [l.lift_name, l.one_rm_grams]))
  return { id: tree.id, title: tree.title, notes: tree.notes, active: tree.active, sessions: resolveProgram(tree.sessions, oneRmByLift) }
}

/** PR2 member view: resolved exercises carrying their DB id + per-exercise log history. */
export async function loadMemberProgram(supabase: SupabaseClient, athleteId: string, boxId: string): Promise<MemberProgramView | null> {
  const { data: prog } = await supabase
    .from('member_programs')
    .select('id, title, notes')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_template', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!prog) return null
  const p = prog as { id: string; title: string; notes: string | null }

  const { data: sessionRows } = await supabase.from('program_sessions').select('id, title').eq('program_id', p.id).eq('box_id', boxId).order('position')
  const sessions = (sessionRows ?? []) as { id: string; title: string }[]
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
    sessions: sessions.map((s) => ({
      title: s.title,
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
