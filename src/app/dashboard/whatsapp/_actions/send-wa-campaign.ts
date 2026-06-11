'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { validateWaCampaign } from '../_lib/wa-validation'
import { loadSmsCandidates } from '@/app/dashboard/sms/_lib/load-sms-candidates'
import { selectSmsRecipients } from '@/lib/sms'
import { renderWaVars, type WaVarValues } from '@/lib/whatsapp'
import { firstNameOf } from '@/lib/broadcast-render'
import { waConfigured, sendWhatsApp } from '@/lib/twilio'
import type { Segment } from '@/lib/broadcast-audience'

type Result = { error: string | null; campaignId?: string; sent?: number; failed?: number; skipped?: number }

export async function sendWaCampaign(templateId: string, varValues: WaVarValues, audienceStatus: string, tag: string | null): Promise<Result> {
  const auth = await requireOwnerAction('Only owners can send WhatsApp campaigns.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile: caller } = auth

  if (!templateId) return { error: 'Choose a template.' }
  const { data: t } = await supabase.from('wa_templates').select('id, content_sid, body_preview, var_count').eq('id', templateId).eq('box_id', caller.box_id).single()
  if (!t) return { error: 'Template not found.' }

  const vErr = validateWaCampaign(templateId, varValues, t.var_count as number, audienceStatus)
  if (vErr) return { error: vErr }
  if (!waConfigured()) return { error: 'WhatsApp is not configured.' }

  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const candidates = await loadSmsCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoPhone } = selectSmsRecipients(candidates, { status: audienceStatus as Segment, tag })
  const skipped = skippedOptedOut + skippedNoPhone

  const { data: c, error: cErr } = await service.from('wa_campaigns').insert({
    box_id: caller.box_id,
    template_id: t.id,
    body_preview: t.body_preview,
    var_values: varValues,
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
    await service.from('wa_recipients').insert(included.map((r) => ({ campaign_id: campaignId, box_id: caller.box_id, athlete_id: r.athlete_id, phone: r.phone, status: 'queued' as const })))
  }

  const statusCallback = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-wa`
  let sent = 0
  let failed = 0
  for (const r of included) {
    const contentVariables = renderWaVars(varValues, firstNameOf(r.full_name))
    const res = await sendWhatsApp({ to: r.phone, contentSid: t.content_sid as string, contentVariables, statusCallback })
    if (res.error || !res.sid) {
      failed++
      await service.from('wa_recipients').update({ status: 'failed', error: res.error ?? 'send failed' }).eq('campaign_id', campaignId).eq('athlete_id', r.athlete_id)
    } else {
      sent++
      await service.from('wa_recipients').update({ status: 'sent', twilio_sid: res.sid }).eq('campaign_id', campaignId).eq('athlete_id', r.athlete_id)
    }
  }

  await service.from('wa_campaigns').update({ status: 'done', sent_count: sent, failed_count: failed }).eq('id', campaignId)
  revalidatePath('/dashboard/whatsapp')
  return { error: null, campaignId, sent, failed, skipped }
}
