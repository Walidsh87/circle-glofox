'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { assessCheckInEntitlement } from '@/lib/checkin-entitlement'
import { checkInWindow } from '@/lib/self-checkin'
import { awardConsistency } from '@/app/dashboard/whiteboard/_actions/_award'
import { actionError } from '@/lib/action-error'

export async function selfCheckIn(instanceId: string): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: profile } = await supabase.from('profiles').select('box_id').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found.' }

  const service = createServiceClient()

  // Own booking only — athlete_id is pinned to the caller.
  const { data: booking } = await service
    .from('bookings')
    .select('checked_in, class_instances(starts_at)')
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (booking.checked_in) return { error: null } // idempotent

  const ci = Array.isArray(booking.class_instances) ? booking.class_instances[0] : booking.class_instances
  if (!ci?.starts_at) return { error: 'Class not found.' }

  const win = checkInWindow(ci.starts_at, new Date().toISOString())
  if (win === 'early') return { error: 'Check-in opens 60 minutes before class.' }
  if (win === 'closed') return { error: 'Check-in for this class has closed.' }

  const gate = await assessCheckInEntitlement(supabase, service, { athleteId: user.id, instanceId, boxId: profile.box_id })
  if (gate.status === 'error') return { error: gate.message }
  if (gate.status === 'blocked') return { error: 'Please see the front desk about your membership.' }

  const { error } = await service
    .from('bookings')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
  if (error) return actionError('selfCheckIn', error)

  try { await awardConsistency(service, profile.box_id, user.id, new Date().toISOString().slice(0, 10)) }
  catch (e) { console.error('awardConsistency failed (self check-in still succeeded):', e) }

  return { error: null }
}
