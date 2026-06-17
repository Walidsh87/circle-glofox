'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { MANAGER_ROLES } from '@/lib/auth/roles'
import { revalidatePath } from 'next/cache'
import { validateAvailabilityWindow } from '@/lib/coach-availability'
import { resolveCoachTarget } from '../_lib/coach-guard'

export async function addAvailabilityWindow(
  coachId: string, weekday: number, start: string, end: string,
): Promise<{ error: string | null }> {
  const err = validateAvailabilityWindow(weekday, start, end)
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can manage availability.')
  if ('error' in auth) return { error: auth.error }

  const target = await resolveCoachTarget(auth, coachId)
  if ('error' in target) return { error: target.error }

  const { error } = await auth.supabase.from('coach_availability').insert({
    box_id: auth.profile.box_id,
    coach_id: coachId,
    weekday,
    start_time: start,
    end_time: end,
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') return { error: 'That window already exists.' }
    console.error('addAvailabilityWindow failed:', error)
    return { error: 'Could not save availability.' }
  }

  revalidatePath('/dashboard/availability')
  return { error: null }
}

export async function removeAvailabilityWindow(id: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can manage availability.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: row } = await supabase
    .from('coach_availability').select('coach_id')
    .eq('id', id).eq('box_id', profile.box_id).maybeSingle()
  if (!row) return { error: 'Availability window not found.' }

  const manager = (MANAGER_ROLES as readonly string[]).includes(profile.role)
  if ((row as { coach_id: string }).coach_id !== user.id && !manager) {
    return { error: 'You can only manage your own availability.' }
  }

  const { error } = await supabase.from('coach_availability').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) { console.error('removeAvailabilityWindow failed:', error); return { error: 'Could not remove availability window.' } }

  revalidatePath('/dashboard/availability')
  return { error: null }
}
