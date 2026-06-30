import type { SupabaseClient } from '@supabase/supabase-js'
import { isLateCancel } from '@/lib/booking-policy'
import { notifyNextInWaitlist } from '@/lib/waitlist-notify'
import { emitWebhook } from '@/lib/webhooks/emit'

// The public API's validated cancel path. Service-role only (the API has no session), so every
// query is explicitly box- AND athlete-scoped. Mirrors the web cancel-booking action's rules
// (delete → late-cancel forfeit / else refund → notify next-in-line → webhook); only the
// orchestration differs. Parallel to bookViaApi.

export type CancelCoreResult =
  | { ok: true; forfeited: boolean }
  | { ok: false; code: 'not_found' | 'internal'; message: string }

export async function cancelViaApi(
  service: SupabaseClient,
  args: { boxId: string; athleteId: string; instanceId: string; nowIso?: string },
): Promise<CancelCoreResult> {
  const { boxId, athleteId, instanceId } = args
  const nowIso = args.nowIso ?? new Date().toISOString()

  // Which credit (if any) the booking drew from — read before deleting.
  const { data: booking } = await service
    .from('bookings')
    .select('credit_id')
    .eq('box_id', boxId)
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .maybeSingle()
  if (!booking) return { ok: false, code: 'not_found', message: 'Booking not found.' }

  const { error: delErr } = await service
    .from('bookings')
    .delete()
    .eq('box_id', boxId)
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
  if (delErr) {
    console.error('[cancelViaApi] delete failed:', delErr)
    return { ok: false, code: 'internal', message: 'Could not cancel the booking.' }
  }

  // Late-cancel policy: cancelling within late_cancel_hours of the start forfeits the credit.
  const { data: instance } = await service
    .from('class_instances')
    .select('starts_at, boxes(late_cancel_hours)')
    .eq('id', instanceId)
    .eq('box_id', boxId)
    .maybeSingle()
  const policyBox = Array.isArray(instance?.boxes) ? instance.boxes[0] : instance?.boxes
  const late = instance ? isLateCancel(instance.starts_at as string, nowIso, policyBox?.late_cancel_hours ?? 0) : false

  let forfeited = false
  if (booking.credit_id) {
    if (late) {
      forfeited = true // late cancel → credit forfeited, no refund
    } else {
      // Best-effort refund; the SQL fn caps at credits_total so a double-call never over-refunds.
      const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: booking.credit_id })
      if (refundErr) console.error('[cancelViaApi] refund_credit failed; credit stranded:', booking.credit_id, refundErr)
    }
  }

  await notifyNextInWaitlist(service, boxId, instanceId)
  await emitWebhook(service, boxId, 'booking.cancelled', { class_instance_id: instanceId, member_id: athleteId })
  return { ok: true, forfeited }
}
