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

  const { data: memberships } = await rls
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
  if (bookingErr) return { status: 'error', message: bookingErr.message }
  if (booking?.credit_id) return { status: 'ok' }

  const lastPaidDate = (memberships ?? [])
    .map((m) => m.last_paid_date)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null
  return { status: 'blocked', reason: status, lastPaidDate }
}
