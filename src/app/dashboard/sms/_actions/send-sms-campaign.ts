'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { validateSmsCampaign } from '../_lib/sms-validation'
import { loadSmsCandidates } from '../_lib/load-sms-candidates'
import { selectSmsRecipients, renderSmsBody } from '@/lib/sms'
import { firstNameOf } from '@/lib/broadcast-render'
import { smsConfigured, sendSms } from '@/lib/twilio'
import type { Segment } from '@/lib/broadcast-audience'

type Result = { error: string | null; campaignId?: string; sent?: number; failed?: number; skipped?: number }

export async function sendSmsCampaign(body: string, audienceStatus: string, tag: string | null): Promise<Result> {
  const auth = await requireOwnerAction('Only owners can send SMS.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile: caller } = auth

  const vErr = validateSmsCampaign(body, audienceStatus)
  if (vErr) return { error: vErr }
  if (!smsConfigured()) return { error: 'SMS is not configured.' }

  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const bodyClean = body.trim()

  const candidates = await loadSmsCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoPhone } = selectSmsRecipients(candidates, { status: audienceStatus as Segment, tag })
  const skipped = skippedOptedOut + skippedNoPhone

  const { data: c, error: cErr } = await service.from('sms_campaigns').insert({
    box_id: caller.box_id,
    body: bodyClean,
    audience_status: audienceStatus,
    audience_tag: tag,
    created_by: user.id,
    status: 'sending',
    recipient_count: included.length,
    skipped_count: skipped,
  }).select('id').single()
  if (cErr || !c) return { error: cErr?.message ?? 'Could not create campaign.' }
  const campaignId = c.id as string

  if (included.length > 0) {
    await service.from('sms_recipients').insert(included.map((r) => ({ campaign_id: campaignId, box_id: caller.box_id, athlete_id: r.athlete_id, phone: r.phone, status: 'queued' as const })))
  }

  const statusCallback = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`
  let sent = 0
  let failed = 0
  for (const r of included) {
    const text = renderSmsBody(bodyClean, { firstName: firstNameOf(r.full_name) })
    const res = await sendSms({ to: r.phone, body: text, statusCallback })
    if (res.error || !res.sid) {
      failed++
      await service.from('sms_recipients').update({ status: 'failed', error: res.error ?? 'send failed' }).eq('campaign_id', campaignId).eq('athlete_id', r.athlete_id)
    } else {
      sent++
      await service.from('sms_recipients').update({ status: 'sent', twilio_sid: res.sid }).eq('campaign_id', campaignId).eq('athlete_id', r.athlete_id)
    }
  }

  await service.from('sms_campaigns').update({ status: 'done', sent_count: sent, failed_count: failed }).eq('id', campaignId)
  revalidatePath('/dashboard/sms')
  return { error: null, campaignId, sent, failed, skipped }
}
