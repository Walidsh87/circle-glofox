'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getMembershipStatus } from '@/lib/membership-status'
import { selectBestBatch, decideEntitlement } from '@/lib/credits'

type BookResult = { error: string | null; needsCredits?: boolean }

export async function bookClass(instanceId: string): Promise<BookResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: instance } = await supabase
    .from('class_instances')
    .select('capacity, box_id')
    .eq('id', instanceId)
    .single()
  if (!instance) return { error: 'Class not found.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.' }
  if (instance.box_id !== profile.box_id) return { error: 'Class not found.' }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

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
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
  const membershipPaid = getMembershipStatus(memberships ?? [], today) === 'paid'

  const { data: batches } = await service
    .from('package_credits')
    .select('id, credits_remaining, expires_at')
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
    .eq('kind', 'class')
    .gt('credits_remaining', 0)
  const best = selectBestBatch(batches ?? [], today)

  const decision = decideEntitlement(membershipPaid, best)

  if (decision.kind === 'none') {
    return { error: 'You need an active membership or class credits to book.', needsCredits: true }
  }

  if (decision.kind === 'membership') {
    // Free booking via the RLS client (athlete inserts own row), credit_id null.
    const { error } = await supabase.from('bookings').insert({
      box_id: profile.box_id,
      class_instance_id: instanceId,
      athlete_id: user.id,
    })
    if (error) {
      if (error.code === '23505') return { error: 'Already booked.' }
      return { error: error.message }
    }
    // Booked → leave the waitlist for this class (best-effort; a missing row is fine).
    await service.from('class_waitlist').delete().eq('class_instance_id', instanceId).eq('athlete_id', user.id)
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
    athlete_id: user.id,
    credit_id: creditId,
  })
  if (insErr) {
    // Best-effort refund. If this itself fails the credit is stranded (the SQL fn
    // caps at credits_total, so it's safe to retry) — log so it's not silent.
    const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: creditId })
    if (refundErr) console.error('refund_credit failed after booking insert error; credit stranded:', creditId, refundErr)
    if (insErr.code === '23505') return { error: 'Already booked.' }
    return { error: insErr.message }
  }

  // Booked → leave the waitlist for this class (best-effort; a missing row is fine).
  await service.from('class_waitlist').delete().eq('class_instance_id', instanceId).eq('athlete_id', user.id)
  revalidatePath('/dashboard/schedule')
  return { error: null }
}
