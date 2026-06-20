'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { programRequestTitle, pendingProgramRequest, isValidFocus } from '@/lib/program-request'
import { revalidatePath } from 'next/cache'

// Mirrors #76 requestPlanChange: an athlete request becomes a follow_up_tasks row.
// follow_up_tasks has only a staff-manage RLS policy, so the insert rides the
// service client with box_id/member_id/created_by pinned to the session user.
export async function requestProgram(focus: string, note: string): Promise<{ error: string | null }> {
  if (!isValidFocus(focus)) return { error: 'Pick a focus for your program.' }
  if (note && note.length > 500) return { error: 'Note is too long (max 500 characters).' }

  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: profile } = await supabase.from('profiles').select('role, box_id').eq('id', user.id).single()
  if (!profile || (profile as { role: string }).role !== 'athlete') return { error: 'Only members can request a program.' }
  const boxId = (profile as { box_id: string }).box_id

  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: openTasks } = await service
    .from('follow_up_tasks')
    .select('title')
    .eq('box_id', boxId)
    .eq('member_id', user.id)
    .eq('done', false)
  if (pendingProgramRequest(((openTasks ?? []) as { title: string }[]).map((t) => t.title))) {
    return { error: 'You already have a pending program request.' }
  }

  const base = programRequestTitle(focus)
  const title = note.trim() ? `${base} — ${note.trim()}` : base
  const { error } = await service.from('follow_up_tasks').insert({
    box_id: boxId,
    title,
    due_date: today,
    member_id: user.id,
    created_by: user.id,
    done: false,
  })
  if (error) return actionError('requestProgram', error)

  revalidatePath('/dashboard/program')
  return { error: null }
}
