'use server'

import { requireStaffAction, requireOwnerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function clockIn(): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can clock in.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: open } = await supabase.from('timecards').select('id').eq('staff_id', user.id).is('clock_out', null).maybeSingle()
  if (open) return { error: 'Already clocked in.' }

  const { error } = await supabase.from('timecards').insert({ box_id: profile.box_id, staff_id: user.id })
  if (error) return actionError('clockIn', error)
  revalidatePath('/dashboard')
  return { error: null }
}

export async function clockOut(): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can clock out.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: open } = await supabase.from('timecards').select('id').eq('staff_id', user.id).is('clock_out', null).maybeSingle()
  if (!open) return { error: 'Not clocked in.' }

  const { error } = await supabase.from('timecards').update({ clock_out: new Date().toISOString() }).eq('id', open.id).eq('staff_id', user.id)
  if (error) return actionError('clockOut', error)
  revalidatePath('/dashboard')
  return { error: null }
}

export async function closeTimecard(id: string, clockOutIso: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can edit timecards.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { data: card } = await supabase.from('timecards').select('clock_in').eq('id', id).eq('box_id', profile.box_id).maybeSingle()
  if (!card) return { error: 'Timecard not found.' }
  const end = Date.parse(clockOutIso)
  if (Number.isNaN(end) || end <= Date.parse(card.clock_in)) return { error: 'End time must be after the start.' }

  const { error } = await supabase.from('timecards').update({ clock_out: new Date(end).toISOString() }).eq('id', id).eq('box_id', profile.box_id)
  if (error) return actionError('closeTimecard', error)
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}

export async function deleteTimecard(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can edit timecards.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('timecards').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) return actionError('deleteTimecard', error)
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
