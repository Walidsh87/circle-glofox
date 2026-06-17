'use server'

import { requireStaffAction, requireManagerAction } from '@/lib/auth/action-guards'
import { MANAGER_ROLES } from '@/lib/auth/roles'
import { revalidatePath } from 'next/cache'
import { validateTimeOff } from '@/lib/coach-availability'
import { resolveCoachTarget } from '../_lib/coach-guard'

function revalidate() {
  revalidatePath('/dashboard/availability')
  revalidatePath('/dashboard/prep') // approved leave changes the prep-board conflict badge
}

export async function requestTimeOff(
  coachId: string, startDate: string, endDate: string, reason: string,
): Promise<{ error: string | null }> {
  const err = validateTimeOff(startDate, endDate, reason)
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can request time off.')
  if ('error' in auth) return { error: auth.error }

  const target = await resolveCoachTarget(auth, coachId)
  if ('error' in target) return { error: target.error }

  const { supabase, user, profile } = auth
  const approved = target.manager // manager-on-behalf auto-approves; coach self → pending
  const { error } = await supabase.from('coach_time_off').insert({
    box_id: profile.box_id,
    coach_id: coachId,
    start_date: startDate,
    end_date: endDate,
    reason: reason.trim() || null,
    status: approved ? 'approved' : 'pending',
    requested_by: user.id,
    decided_by: approved ? user.id : null,
    decided_at: approved ? new Date().toISOString() : null,
  })
  if (error) { console.error('requestTimeOff failed:', error); return { error: 'Could not save the time-off request.' } }

  revalidate()
  return { error: null }
}

export async function decideTimeOff(
  id: string, decision: 'approved' | 'denied',
): Promise<{ error: string | null }> {
  if (decision !== 'approved' && decision !== 'denied') return { error: 'Invalid decision.' }

  const auth = await requireManagerAction('Only owners and admins can approve time off.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { error } = await supabase.from('coach_time_off')
    .update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', id).eq('box_id', profile.box_id)
  if (error) { console.error('decideTimeOff failed:', error); return { error: 'Could not update the time-off request.' } }

  revalidate()
  return { error: null }
}

export async function cancelTimeOff(id: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can cancel time off.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: row, error: selectError } = await supabase.from('coach_time_off')
    .select('coach_id, status').eq('id', id).eq('box_id', profile.box_id).maybeSingle()
  if (selectError) { console.error('cancelTimeOff select failed:', selectError); return { error: 'Could not load the time-off request.' } }
  if (!row) return { error: 'Time-off request not found.' }

  const manager = (MANAGER_ROLES as readonly string[]).includes(profile.role)
  const r = row as { coach_id: string; status: string }
  if (!manager && (r.coach_id !== user.id || r.status !== 'pending')) {
    return { error: 'You can only cancel your own pending requests.' }
  }

  const { error } = await supabase.from('coach_time_off').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) { console.error('cancelTimeOff failed:', error); return { error: 'Could not cancel the time-off request.' } }

  revalidate()
  return { error: null }
}
