'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import type { MembershipStatus } from '@/lib/membership-status'
import { assessCheckInEntitlement } from '@/lib/checkin-entitlement'
import { awardConsistency } from './_award'
import { actionError } from '@/lib/action-error'

type CheckInResult = {
  error: string | null
  blocked?: {
    reason: Exclude<MembershipStatus, 'paid'>
    lastPaidDate: string | null
  }
}

export async function checkIn(
  instanceId: string,
  athleteId: string
): Promise<CheckInResult> {
  const auth = await requireStaffAction('Only staff can check in athletes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const service = createServiceClient()

  const gate = await assessCheckInEntitlement(supabase, service, { athleteId, instanceId, boxId: profile.box_id })
  if (gate.status === 'error') return { error: gate.message }
  if (gate.status === 'blocked') return { error: 'BLOCKED', blocked: { reason: gate.reason, lastPaidDate: gate.lastPaidDate } }

  const { error } = await service
    .from('bookings')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return actionError('checkIn', error)

  const today = new Date().toISOString().slice(0, 10)
  try { await awardConsistency(service, profile.box_id, athleteId, today) }
  catch (e) { console.error('awardConsistency failed (check-in still succeeded):', e) }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
