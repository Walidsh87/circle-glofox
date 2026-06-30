'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { isLateCancel } from '@/lib/booking-policy'
import { resolveBookingTarget } from '@/lib/family'
import { actionError } from '@/lib/action-error'
import { emitWebhook } from '@/lib/webhooks/emit'
import { notifyNextInWaitlist } from '@/lib/waitlist-notify'

export async function cancelBooking(instanceId: string, forAthleteId?: string): Promise<{ error: string | null; forfeited?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Family (#84): cancelling for a household member needs the service client —
  // RLS scopes booking reads/deletes to the caller's own rows.
  const targetRes = await resolveBookingTarget(supabase, user.id, forAthleteId ?? null)
  if ('error' in targetRes) return { error: targetRes.error }
  const targetId = targetRes.targetId
  const onBehalf = targetId !== user.id
  if (onBehalf && !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const db = onBehalf ? createServiceClient() : supabase

  // Read which credit (if any) this booking drew from, before deleting it.
  // bookings' box_isolation_select policy lets any gym member read bookings in
  // their box; the .eq('athlete_id') filter here — not RLS alone — is what scopes
  // the result to the target's own row.
  const { data: booking } = await db
    .from('bookings')
    .select('credit_id')
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', targetId)
    .maybeSingle()

  // athlete_book RLS policy covers delete for own bookings; service covers on-behalf.
  const { error } = await db
    .from('bookings')
    .delete()
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', targetId)
  if (error) return actionError('cancelBooking', error)

  // Late-cancel policy: cancelling within late_cancel_hours of the start forfeits the credit.
  const { data: policyInstance } = await supabase
    .from('class_instances')
    .select('starts_at, box_id, boxes(late_cancel_hours)')
    .eq('id', instanceId)
    .single()
  const policyBox = Array.isArray(policyInstance?.boxes) ? policyInstance.boxes[0] : policyInstance?.boxes
  const late = policyInstance ? isLateCancel(policyInstance.starts_at, new Date().toISOString(), policyBox?.late_cancel_hours ?? 0) : false

  // Cancel refunds the credit — unless it's a late cancel (forfeit) or a no-show (which never
  // reaches here). Delete-then-refund: a *sequential* double-click's second pass finds no row
  // (maybeSingle → null) and skips refund. A concurrent double-click could call refund_credit
  // twice, but the SQL fn caps at credits_total, so the counter is never over-refunded.
  let forfeited = false
  if (booking?.credit_id) {
    if (late) {
      forfeited = true // late cancel → credit forfeited, no refund
    } else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Misconfig: the cancel itself already succeeded, so don't fail it — just
      // surface that the credit couldn't be refunded (safe to retry; SQL caps it).
      console.error('SUPABASE_SERVICE_ROLE_KEY missing; cannot refund credit:', booking.credit_id)
    } else {
      const service = createServiceClient()
      // Best-effort refund; log if it fails so a stranded credit isn't silent.
      const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: booking.credit_id })
      if (refundErr) console.error('refund_credit failed on cancel; credit stranded:', booking.credit_id, refundErr)
    }
  }

  // A spot just freed → notify the next person in line (shared best-effort helper, never throws).
  // policyInstance is read via the RLS client, so its box_id is the caller's box — pass it so the
  // service-client waitlist reads are scoped to it (a foreign instanceId can't notify another box).
  const notifyBoxId = policyInstance?.box_id
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && notifyBoxId) {
    await notifyNextInWaitlist(createServiceClient(), notifyBoxId as string, instanceId)
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY && policyInstance?.box_id) {
    await emitWebhook(createServiceClient(), policyInstance.box_id as string, 'booking.cancelled', { class_instance_id: instanceId, member_id: targetId })
  }

  revalidatePath('/dashboard/schedule')
  return { error: null, forfeited }
}
