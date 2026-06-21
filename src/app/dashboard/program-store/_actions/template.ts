'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateTemplate } from '@/lib/program-store'
import type { ProgramInput } from '@/lib/program'

const inList = (uids: string[]) => `(${uids.join(',')})`

export async function saveTemplate(
  templateId: string | null,
  input: ProgramInput,
): Promise<{ error: string | null; templateId?: string }> {
  const err = validateTemplate(input)
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can build programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth
  const boxId = profile.box_id
  const author = user.id

  let pid = templateId
  const title = input.title.trim()
  const notes = input.notes?.trim() || null

  if (pid) {
    // Ownership check before child writes (0-row UPDATE wouldn't error): must be a
    // template in THIS box. Pricing/published are NOT touched here.
    const { data: owned } = await supabase.from('member_programs')
      .select('id').eq('id', pid).eq('box_id', boxId).eq('is_template', true).maybeSingle()
    if (!owned) return { error: 'Program not found.' }
    const { error } = await supabase.from('member_programs')
      .update({ title, notes }).eq('id', pid).eq('box_id', boxId).eq('is_template', true)
    if (error) return actionError('saveTemplate', error)
  } else {
    const { data, error } = await supabase.from('member_programs')
      .insert({ box_id: boxId, athlete_id: author, created_by: author, title, notes, is_template: true })
      .select('id').single()
    if (error || !data) return actionError('saveTemplate', error ?? new Error('template insert failed'))
    pid = (data as { id: string }).id
  }

  const sessionRows = input.sessions.map((s, i) => ({
    program_id: pid, box_id: boxId, athlete_id: author, client_uid: s.client_uid,
    position: i, title: s.title.trim(), week: s.week ?? null,
  }))
  const { data: saved, error: sErr } = await supabase.from('program_sessions')
    .upsert(sessionRows, { onConflict: 'program_id,client_uid' }).select('id, client_uid')
  if (sErr) return actionError('saveTemplate', sErr)
  const idByUid = new Map(((saved ?? []) as { id: string; client_uid: string }[]).map((r) => [r.client_uid, r.id]))

  const keep = input.sessions.map((s) => s.client_uid)
  const { error: dsErr } = await supabase.from('program_sessions')
    .delete().eq('program_id', pid).eq('box_id', boxId).not('client_uid', 'in', inList(keep))
  if (dsErr) return actionError('saveTemplate', dsErr)

  for (const s of input.sessions) {
    const sid = idByUid.get(s.client_uid)
    if (!sid) continue
    if (s.exercises.length) {
      const exRows = s.exercises.map((ex, i) => ({
        session_id: sid, box_id: boxId, athlete_id: author, client_uid: ex.client_uid, position: i,
        name: ex.name.trim(), lift_name: ex.lift_name || null, sets: ex.sets ?? null, reps: ex.reps?.trim() || null,
        percentage: ex.percentage ?? null, target_note: ex.target_note?.trim() || null, rest_seconds: ex.rest_seconds ?? null,
      }))
      const { error: exErr } = await supabase.from('program_exercises').upsert(exRows, { onConflict: 'session_id,client_uid' })
      if (exErr) return actionError('saveTemplate', exErr)
    }
    const keepEx = s.exercises.map((e) => e.client_uid)
    const base = supabase.from('program_exercises').delete().eq('session_id', sid).eq('box_id', boxId)
    const { error: deErr } = keepEx.length ? await base.not('client_uid', 'in', inList(keepEx)) : await base
    if (deErr) return actionError('saveTemplate', deErr)
  }

  revalidatePath('/dashboard/program-store')
  revalidatePath(`/dashboard/program-store/${pid}`)
  return { error: null, templateId: pid }
}

export async function deleteTemplate(templateId: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can delete programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth
  const { error } = await supabase.from('member_programs')
    .delete().eq('id', templateId).eq('box_id', profile.box_id).eq('is_template', true)
  if (error) return actionError('deleteTemplate', error)
  revalidatePath('/dashboard/program-store')
  return { error: null }
}
