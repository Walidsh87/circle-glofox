'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { getMembershipStatus } from '@/lib/membership-status'
import { selectBestBatch, decideEntitlement } from '@/lib/credits'
import { bookingClosed } from '@/lib/booking-policy'
import { resolveBookingTarget } from '@/lib/family'
import { actionError } from '@/lib/action-error'

type BookResult = { error: string | null; needsCredits?: boolean }

export async function bookClass(instanceId: string, forAthleteId?: string): Promise<BookResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Family (#84): booking for a household member rides the same flow with the
  // target's identity; self bookings resolve with zero extra queries.
  const targetRes = await resolveBookingTarget(supabase, user.id, forAthleteId ?? null)
  if ('error' in targetRes) return { error: targetRes.error }
  const targetId = targetRes.targetId
  const onBehalf = targetId !== user.id

  const { data: instance } = await supabase
    .from('class_instances')
    .select('capacity, box_id, starts_at, boxes(booking_close_minutes)')
    .eq('id', instanceId)
    .single()
  if (!instance) return { error: 'Class not found.' }

  const policyBox = Array.isArray(instance.boxes) ? instance.boxes[0] : instance.boxes
  if (bookingClosed(instance.starts_at, new Date().toISOString(), policyBox?.booking_close_minutes ?? 0)) {
    return { error: 'Booking has closed for this class.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, household_id')
    .eq('id', targetId)
    .single()
  if (!profile) return { error: 'Profile not found.' }
  if (instance.box_id !== profile.box_id) return { error: 'Class not found.' }

  // Family: membership entitlement resolves through the household's primary (credits stay per-person).
  let billingAthleteId = targetId
  if (profile.household_id) {
    const { data: hh } = await supabase.from('households').select('primary_athlete_id').eq('id', profile.household_id).single()
    if (hh?.primary_athlete_id) billingAthleteId = hh.primary_athlete_id
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const service = createServiceClient()

  // Capacity (service role bypasses athlete RLS to count everyone's bookings).
  const { count } = await service
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_instance_id', instanceId)
  if ((count ?? 0) >= instance.capacity) return { error: 'Class is full.' }

  // Entitlement precedence: paid membership → free; else a class credit; else refuse.
  const today = new Date().toISOString().slice(0, 10)

  // Only a *paid* membership books for free. 'unpaid'/'no_membership' both fall
  // through to the credit-or-refuse path below (membership only wins when paid).
  const { data: memberships } = await service
    .from('memberships')
    .select('payment_status, end_date, frozen_from, frozen_until')
    .eq('athlete_id', billingAthleteId)
    .eq('box_id', profile.box_id)
  const membershipPaid = getMembershipStatus(memberships ?? [], today) === 'paid'

  const { data: batches } = await service
    .from('package_credits')
    .select('id, credits_remaining, expires_at')
    .eq('athlete_id', targetId)
    .eq('box_id', profile.box_id)
    .eq('kind', 'class')
    .gt('credits_remaining', 0)
  const best = selectBestBatch(batches ?? [], today)

  const decision = decideEntitlement(membershipPaid, best)

  if (decision.kind === 'none') {
    return { error: 'You need an active membership or class credits to book.', needsCredits: true }
  }

  if (decision.kind === 'membership') {
    // Free booking. RLS lets athletes insert only their OWN row — on-behalf rides
    // the service client (target already validated by the household rail).
    const inserter = onBehalf ? service : supabase
    const { error } = await inserter.from('bookings').insert({
      box_id: profile.box_id,
      class_instance_id: instanceId,
      athlete_id: targetId,
    })
    if (error) {
      if (error.code === '23505') return { error: 'Already booked.' }
      return actionError('bookClass', error)
    }
    // Booked → leave the waitlist for this class (best-effort; a missing row is fine).
    await service.from('class_waitlist').delete().eq('class_instance_id', instanceId).eq('athlete_id', targetId)
    revalidatePath('/dashboard/schedule')
    return { error: null }
  }

  // decision.kind === 'credit' — consume one atomically, then book linked to it.
  // The same service client runs the whole credit transaction (consume → insert →
  // refund-on-failure); the insert bypasses RLS but carries the already-validated
  // box_id/athlete_id, so it stays tenant-correct.
  const creditId = decision.batch.id
  const { data: remaining, error: consumeErr } = await service.rpc('consume_credit', {
    p_credit_id: creditId,
  })
  if (consumeErr || remaining === null || remaining === undefined) {
    return { error: 'Could not reserve a credit. Please try again.' }
  }

  const { error: insErr } = await service.from('bookings').insert({
    box_id: profile.box_id,
    class_instance_id: instanceId,
    athlete_id: targetId,
    credit_id: creditId,
  })
  if (insErr) {
    // Best-effort refund. If this itself fails the credit is stranded (the SQL fn
    // caps at credits_total, so it's safe to retry) — log so it's not silent.
    const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: creditId })
    if (refundErr) console.error('refund_credit failed after booking insert error; credit stranded:', creditId, refundErr)
    if (insErr.code === '23505') return { error: 'Already booked.' }
    return actionError('bookClass', insErr)
  }

  // Booked → leave the waitlist for this class (best-effort; a missing row is fine).
  await service.from('class_waitlist').delete().eq('class_instance_id', instanceId).eq('athlete_id', targetId)
  revalidatePath('/dashboard/schedule')
  return { error: null }
}
