import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus, type MembershipStatus } from '@/lib/membership-status'

export type CheckInEntitlement =
  | { status: 'ok' }
  | { status: 'blocked'; reason: Exclude<MembershipStatus, 'paid'>; lastPaidDate: string | null }
  | { status: 'error'; message: string }

// Shared gate for staff check-in (whiteboard) and member self check-in (#61):
// paid membership — resolved through the household primary — OR a credit-backed booking.
export async function assessCheckInEntitlement(
  rls: SupabaseClient,
  service: SupabaseClient,
  args: { athleteId: string; instanceId: string; boxId: string },
): Promise<CheckInEntitlement> {
  // Family: a member's entitlement resolves through their household's primary.
  let billingAthleteId = args.athleteId
  const { data: athleteProfile } = await rls.from('profiles').select('household_id').eq('id', args.athleteId).single()
  if (athleteProfile?.household_id) {
    const { data: hh } = await rls.from('households').select('primary_athlete_id').eq('id', athleteProfile.household_id).single()
    if (hh?.primary_athlete_id) billingAthleteId = hh.primary_athlete_id
  }

  // Read the (possibly household-primary) membership via the SERVICE client, not the member's RLS
  // client: mig 090 tightened memberships to self-or-staff, so a member's RLS client can no longer
  // read their household primary's membership — which would silently block dependents at check-in.
  // billingAthleteId is resolved from the member's own household above; box-scoped here.
  const { data: memberships } = await service
    .from('memberships')
    .select('payment_status, end_date, last_paid_date, frozen_from, frozen_until')
    .eq('athlete_id', billingAthleteId)
    .eq('box_id', args.boxId)

  const today = new Date().toISOString().slice(0, 10)
  const status = getMembershipStatus(memberships ?? [], today)
  if (status === 'paid') return { status: 'ok' }

  // A credit-backed booking is a valid entitlement on its own — let it through.
  const { data: booking, error: bookingErr } = await service
    .from('bookings')
    .select('credit_id')
    .eq('class_instance_id', args.instanceId)
    .eq('athlete_id', args.athleteId)
    .eq('box_id', args.boxId)
    .maybeSingle()
  if (bookingErr) {
    console.error('[assessCheckInEntitlement] booking lookup failed:', bookingErr)
    return { status: 'error', message: 'Could not verify check-in eligibility. Please try again.' }
  }
  if (booking?.credit_id) return { status: 'ok' }

  const lastPaidDate = (memberships ?? [])
    .map((m) => m.last_paid_date)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null
  return { status: 'blocked', reason: status, lastPaidDate }
}
