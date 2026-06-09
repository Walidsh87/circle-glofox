'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getMembershipStatus, type MembershipStatus } from '@/lib/membership-status'
import { awardConsistency } from './_award'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only staff can check in athletes.' }
  }

  // Family: a member's entitlement resolves through their household's primary.
  let billingAthleteId = athleteId
  const { data: athleteProfile } = await supabase.from('profiles').select('household_id').eq('id', athleteId).single()
  if (athleteProfile?.household_id) {
    const { data: hh } = await supabase.from('households').select('primary_athlete_id').eq('id', athleteProfile.household_id).single()
    if (hh?.primary_athlete_id) billingAthleteId = hh.primary_athlete_id
  }

  const { data: memberships } = await supabase
    .from('memberships')
    .select('payment_status, end_date, last_paid_date, frozen_from, frozen_until')
    .eq('athlete_id', billingAthleteId)
    .eq('box_id', profile.box_id)

  const today = new Date().toISOString().slice(0, 10)
  const status = getMembershipStatus(memberships ?? [], today)

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (status !== 'paid') {
    // A credit-backed booking is a valid entitlement on its own — let it through.
    const { data: booking, error: bookingErr } = await service
      .from('bookings')
      .select('credit_id')
      .eq('class_instance_id', instanceId)
      .eq('athlete_id', athleteId)
      .eq('box_id', profile.box_id)
      .maybeSingle()
    if (bookingErr) return { error: bookingErr.message }

    if (!booking?.credit_id) {
      const lastPaidDate = (memberships ?? [])
        .map((m) => m.last_paid_date)
        .filter((d): d is string => !!d)
        .sort()
        .pop() ?? null
      return { error: 'BLOCKED', blocked: { reason: status, lastPaidDate } }
    }
  }

  const { error } = await service
    .from('bookings')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  try { await awardConsistency(service, profile.box_id, athleteId, today) }
  catch (e) { console.error('awardConsistency failed (check-in still succeeded):', e) }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
