'use server'

import crypto from 'crypto'
import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { isWebhookEvent } from '@/lib/webhooks/events'
import { isSafeWebhookUrl } from '@/lib/webhooks/validate-url'
import { logAudit } from '@/lib/audit'
import { actionError } from '@/lib/action-error'

// Subscribes a gym to outbound webhooks (#65 Phase 3). The signing secret is
// returned ONCE — only the row's copy (used by the delivery cron) is kept.
// Owner-only; the URL is SSRF-guarded; audited.
export async function createWebhook(
  url: string,
  eventTypes: string[],
): Promise<{ error: string | null; secret?: string }> {
  const auth = await requireOwnerAction('Only owners can manage webhooks.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  const trimmed = (url ?? '').trim()
  const safe = isSafeWebhookUrl(trimmed)
  if (!safe.ok) return { error: safe.reason }

  const events = (eventTypes ?? []).filter(isWebhookEvent)
  if (events.length === 0) return { error: 'Choose at least one event to subscribe to.' }

  const secret = 'whsec_' + crypto.randomBytes(24).toString('base64url')

  const service = createServiceClient()
  const { data, error } = await service
    .from('webhook_subscriptions')
    .insert({ box_id: profile.box_id, url: trimmed, secret, event_types: events, created_by: user.id })
    .select('id')
    .single()
  if (error || !data) return actionError('createWebhook', error, 'Could not create the webhook.')

  await logAudit(service, {
    boxId: profile.box_id, actorId: user.id, actorName: profile.full_name,
    action: 'webhook.subscribed', target: data.id as string, details: { url: trimmed, event_types: events },
  })
  revalidatePath('/dashboard/settings')
  return { error: null, secret }
}
