'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { sendWaitlistEmail } from '@/lib/email'
import { sendPushTo } from '@/lib/push'
import { env } from '@/env'
import { isLateCancel } from '@/lib/booking-policy'
import { resolveBookingTarget } from '@/lib/family'
import { getT, resolveLocale } from '@/lib/i18n'

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
  if (error) return { error: error.message }

  // Late-cancel policy: cancelling within late_cancel_hours of the start forfeits the credit.
  const { data: policyInstance } = await supabase
    .from('class_instances')
    .select('starts_at, boxes(late_cancel_hours)')
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

  // A spot just freed → email the next person in line. Best-effort; never fails the cancel.
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const svc = createServiceClient()
      const { data: next } = await svc
        .from('class_waitlist')
        .select('athlete_id')
        .eq('class_instance_id', instanceId)
        .order('created_at')
        .limit(1)
        .maybeSingle()
      if (next) {
        const { data: athlete } = await svc.from('profiles').select('email, full_name, language').eq('id', next.athlete_id).single()
        const { data: inst } = await svc
          .from('class_instances')
          .select('starts_at, class_templates(name), boxes(name, timezone)')
          .eq('id', instanceId)
          .single()
        if (athlete?.email && inst) {
          const tmpl = Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates
          const box = Array.isArray(inst.boxes) ? inst.boxes[0] : inst.boxes
          const classTime = new Intl.DateTimeFormat('en-GB', {
            timeZone: box?.timezone ?? 'Asia/Dubai',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(inst.starts_at))
          const locale = resolveLocale(athlete.language)
          await sendWaitlistEmail({
            to: athlete.email,
            athleteName: athlete.full_name ?? 'there',
            className: tmpl?.name ?? 'your class',
            classTime,
            gymName: box?.name ?? 'your gym',
            bookUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard/schedule`,
            locale,
          })
          const t = getT(locale)
          await sendPushTo(svc, next.athlete_id, {
            title: t('comms.waitlistPush.title'),
            body: t('comms.waitlistPush.body', { className: tmpl?.name ?? 'Your class', classTime }),
            url: '/dashboard/schedule',
          })
        }
      }
    }
  } catch (e) {
    console.error('waitlist notify failed (cancel still succeeded):', e)
  }

  revalidatePath('/dashboard/schedule')
  return { error: null, forfeited }
}
