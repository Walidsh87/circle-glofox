'use server'

import { requireProgrammingAction, type StaffActionContext } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateProgram, type ProgramInput } from '@/lib/program'

type Result = { error: string | null }
type Sb = StaffActionContext['supabase']

function revalidate(athleteId: string) {
  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath(`/dashboard/members/${athleteId}/program`)
  revalidatePath('/dashboard/program')
}

// A coach may only build for an athlete in their own box (box_id is stamped from
// the coach's session; this stops a foreign athlete_id being attached to it).
async function athleteInBox(supabase: Sb, athleteId: string, boxId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('box_id').eq('id', athleteId).maybeSingle()
  return !!data && (data as { box_id: string }).box_id === boxId
}

const inList = (uids: string[]) => `(${uids.join(',')})`

export async function saveProgram(
  athleteId: string,
  programId: string | null,
  input: ProgramInput,
): Promise<{ error: string | null; programId?: string }> {
  const err = validateProgram(input)
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can build programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth
  const boxId = profile.box_id

  if (!(await athleteInBox(supabase, athleteId, boxId))) return { error: 'Member not found.' }

  // 1. Upsert the program row.
  let pid = programId
  const title = input.title.trim()
  const notes = input.notes?.trim() || null
  if (pid) {
    // Verify the program belongs to THIS box + athlete before writing child rows —
    // a 0-row UPDATE (RLS/scope miss) wouldn't error, so confirm ownership first,
    // else a crafted programId could attach sessions to another box's program.
    const { data: owned } = await supabase.from('member_programs').select('id').eq('id', pid).eq('box_id', boxId).eq('athlete_id', athleteId).maybeSingle()
    if (!owned) return { error: 'Program not found.' }
    const { error } = await supabase.from('member_programs').update({ title, notes }).eq('id', pid).eq('box_id', boxId).eq('athlete_id', athleteId)
    if (error) return actionError('saveProgram', error)
  } else {
    const { data, error } = await supabase
      .from('member_programs')
      .insert({ box_id: boxId, athlete_id: athleteId, created_by: user.id, title, notes })
      .select('id')
      .single()
    if (error || !data) return actionError('saveProgram', error ?? new Error('program insert failed'))
    pid = (data as { id: string }).id
  }

  // 2. Upsert sessions; conflict on (program_id, client_uid) preserves row ids
  //    (and the per-set logs that will reference their exercises in PR2).
  const sessionRows = input.sessions.map((s, i) => ({
    program_id: pid, box_id: boxId, athlete_id: athleteId, client_uid: s.client_uid, position: i, title: s.title.trim(),
  }))
  const { data: saved, error: sErr } = await supabase
    .from('program_sessions')
    .upsert(sessionRows, { onConflict: 'program_id,client_uid' })
    .select('id, client_uid')
  if (sErr) return actionError('saveProgram', sErr)
  const idByUid = new Map(((saved ?? []) as { id: string; client_uid: string }[]).map((r) => [r.client_uid, r.id]))

  // 3. Delete removed sessions (cascades to their exercises).
  const keepSessions = input.sessions.map((s) => s.client_uid)
  const { error: dsErr } = await supabase.from('program_sessions').delete().eq('program_id', pid).eq('box_id', boxId).not('client_uid', 'in', inList(keepSessions))
  if (dsErr) return actionError('saveProgram', dsErr)

  // 4. Per session: upsert its exercises, then delete the ones it no longer has.
  for (const s of input.sessions) {
    const sid = idByUid.get(s.client_uid)
    if (!sid) continue
    if (s.exercises.length) {
      const exRows = s.exercises.map((ex, i) => ({
        session_id: sid, box_id: boxId, athlete_id: athleteId, client_uid: ex.client_uid, position: i,
        name: ex.name.trim(), lift_name: ex.lift_name || null, sets: ex.sets ?? null, reps: ex.reps?.trim() || null,
        percentage: ex.percentage ?? null, target_note: ex.target_note?.trim() || null, rest_seconds: ex.rest_seconds ?? null,
        video_url: ex.video_url?.trim() || null, metric: ex.metric,
      }))
      const { error: exErr } = await supabase.from('program_exercises').upsert(exRows, { onConflict: 'session_id,client_uid' })
      if (exErr) return actionError('saveProgram', exErr)
    }
    const keepEx = s.exercises.map((e) => e.client_uid)
    const base = supabase.from('program_exercises').delete().eq('session_id', sid).eq('box_id', boxId)
    const { error: deErr } = keepEx.length ? await base.not('client_uid', 'in', inList(keepEx)) : await base
    if (deErr) return actionError('saveProgram', deErr)
  }

  revalidate(athleteId)
  return { error: null, programId: pid }
}

export async function setProgramActive(programId: string, active: boolean, athleteId: string): Promise<Result> {
  const auth = await requireProgrammingAction('Only coaches can update programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth
  const { error } = await supabase.from('member_programs').update({ active }).eq('id', programId).eq('box_id', profile.box_id).eq('athlete_id', athleteId)
  if (error) return actionError('setProgramActive', error)
  revalidate(athleteId)
  return { error: null }
}

export async function deleteProgram(programId: string, athleteId: string): Promise<Result> {
  const auth = await requireProgrammingAction('Only coaches can delete programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth
  const { error } = await supabase.from('member_programs').delete().eq('id', programId).eq('box_id', profile.box_id).eq('athlete_id', athleteId)
  if (error) return actionError('deleteProgram', error)
  revalidate(athleteId)
  return { error: null }
}

export async function duplicateProgram(programId: string, targetAthleteId: string): Promise<{ error: string | null; programId?: string }> {
  const auth = await requireProgrammingAction('Only coaches can duplicate programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth
  const boxId = profile.box_id

  if (!(await athleteInBox(supabase, targetAthleteId, boxId))) return { error: 'Target member not found.' }

  const { data: src } = await supabase.from('member_programs').select('title, notes').eq('id', programId).eq('box_id', boxId).maybeSingle()
  if (!src) return { error: 'Program not found.' }
  const { data: sessions } = await supabase.from('program_sessions').select('id, position, title').eq('program_id', programId).eq('box_id', boxId).order('position')
  const sessionIds = ((sessions ?? []) as { id: string }[]).map((s) => s.id)
  const { data: exercises } = sessionIds.length
    ? await supabase.from('program_exercises').select('session_id, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds, video_url, metric').in('session_id', sessionIds).eq('box_id', boxId).order('position')
    : { data: [] as Record<string, unknown>[] }

  const { data: newProg, error: pErr } = await supabase
    .from('member_programs')
    .insert({ box_id: boxId, athlete_id: targetAthleteId, created_by: user.id, title: (src as { title: string }).title, notes: (src as { notes: string | null }).notes })
    .select('id')
    .single()
  if (pErr || !newProg) return actionError('duplicateProgram', pErr ?? new Error('program insert failed'))
  const newPid = (newProg as { id: string }).id

  // Re-insert each session with a FRESH client_uid; remap exercises to new session ids.
  const newSessionByOldId = new Map<string, string>()
  for (const s of (sessions ?? []) as { id: string; position: number; title: string }[]) {
    const { data: ns, error: nsErr } = await supabase
      .from('program_sessions')
      .insert({ program_id: newPid, box_id: boxId, athlete_id: targetAthleteId, client_uid: crypto.randomUUID(), position: s.position, title: s.title })
      .select('id')
      .single()
    if (nsErr || !ns) return actionError('duplicateProgram', nsErr ?? new Error('session insert failed'))
    newSessionByOldId.set(s.id, (ns as { id: string }).id)
  }

  const exRows = ((exercises ?? []) as Record<string, unknown>[])
    .map((e) => {
      const sid = newSessionByOldId.get(e.session_id as string)
      if (!sid) return null
      return {
        session_id: sid, box_id: boxId, athlete_id: targetAthleteId, client_uid: crypto.randomUUID(),
        position: e.position, name: e.name, lift_name: e.lift_name, sets: e.sets, reps: e.reps,
        percentage: e.percentage, target_note: e.target_note, rest_seconds: e.rest_seconds,
        video_url: e.video_url, metric: e.metric,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (exRows.length) {
    const { error: exErr } = await supabase.from('program_exercises').insert(exRows)
    if (exErr) return actionError('duplicateProgram', exErr)
  }

  revalidate(targetAthleteId)
  return { error: null, programId: newPid }
}
