import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus } from '@/lib/membership-status'
import { selectBestBatch, decideEntitlement } from '@/lib/credits'
import { bookingClosed } from '@/lib/booking-policy'
import { emitWebhook } from '@/lib/webhooks/emit'

// The public API's validated booking path. Service-role only (the API has no
// session, unlike book-class.ts which uses the RLS client for self-bookings), so
// every query is explicitly box-scoped. It reuses the SAME business rules
// (getMembershipStatus / selectBestBatch / decideEntitlement / bookingClosed)
// and the SAME atomic credit RPCs as book-class — only the orchestration differs.

export type BookCoreResult =
  | { ok: true; bookingId: string }
  | { ok: false; code: 'not_found' | 'closed' | 'full' | 'needs_entitlement' | 'conflict' | 'internal'; message: string }

export async function bookViaApi(
  service: SupabaseClient,
  args: { boxId: string; athleteId: string; instanceId: string; nowIso?: string },
): Promise<BookCoreResult> {
  const { boxId, athleteId, instanceId } = args
  const nowIso = args.nowIso ?? new Date().toISOString()

  const { data: instance } = await service
    .from('class_instances')
    .select('id, capacity, box_id, starts_at, boxes(booking_close_minutes)')
    .eq('id', instanceId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (!instance) return { ok: false, code: 'not_found', message: 'Class not found.' }

  const policyBox = Array.isArray(instance.boxes) ? instance.boxes[0] : instance.boxes
  if (bookingClosed(instance.starts_at as string, nowIso, policyBox?.booking_close_minutes ?? 0)) {
    return { ok: false, code: 'closed', message: 'Booking has closed for this class.' }
  }

  const { data: profile } = await service
    .from('profiles')
    .select('id, household_id')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .eq('role', 'athlete')
    .maybeSingle()
  if (!profile) return { ok: false, code: 'not_found', message: 'Member not found.' }

  // Membership entitlement resolves through the household's primary; credits stay per-person.
  let billingAthleteId = athleteId
  if (profile.household_id) {
    const { data: hh } = await service.from('households').select('primary_athlete_id').eq('id', profile.household_id).eq('box_id', boxId).maybeSingle()
    if (hh?.primary_athlete_id) billingAthleteId = hh.primary_athlete_id as string
  }

  const { count } = await service
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_instance_id', instanceId)
    .eq('box_id', boxId)
  if ((count ?? 0) >= (instance.capacity as number)) return { ok: false, code: 'full', message: 'Class is full.' }

  const today = nowIso.slice(0, 10)
  const { data: memberships } = await service
    .from('memberships')
    .select('payment_status, end_date, frozen_from, frozen_until')
    .eq('athlete_id', billingAthleteId)
    .eq('box_id', boxId)
  const membershipPaid = getMembershipStatus(memberships ?? [], today) === 'paid'

  const { data: batches } = await service
    .from('package_credits')
    .select('id, credits_remaining, expires_at')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('kind', 'class')
    .gt('credits_remaining', 0)
  const decision = decideEntitlement(membershipPaid, selectBestBatch(batches ?? [], today))

  if (decision.kind === 'none') {
    return { ok: false, code: 'needs_entitlement', message: 'The member needs an active membership or class credits to book.' }
  }

  const creditId = decision.kind === 'credit' ? decision.batch.id : null
  if (creditId) {
    const { data: remaining, error: consumeErr } = await service.rpc('consume_credit', { p_credit_id: creditId })
    if (consumeErr || remaining === null || remaining === undefined) {
      return { ok: false, code: 'internal', message: 'Could not reserve a credit.' }
    }
  }

  const { data: booking, error: insErr } = await service
    .from('bookings')
    .insert({ box_id: boxId, class_instance_id: instanceId, athlete_id: athleteId, ...(creditId ? { credit_id: creditId } : {}) })
    .select('id')
    .single()
  if (insErr || !booking) {
    if (creditId) {
      const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: creditId })
      if (refundErr) console.error('refund_credit failed after API booking insert error; credit stranded:', creditId, refundErr)
    }
    if (insErr?.code === '23505') return { ok: false, code: 'conflict', message: 'The member is already booked into this class.' }
    console.error('[bookViaApi] insert failed:', insErr)
    return { ok: false, code: 'internal', message: 'Could not create the booking.' }
  }

  await service.from('class_waitlist').delete().eq('class_instance_id', instanceId).eq('athlete_id', athleteId).eq('box_id', boxId)
  await emitWebhook(service, boxId, 'booking.created', { id: booking.id, class_instance_id: instanceId, member_id: athleteId })
  return { ok: true, bookingId: booking.id as string }
}
