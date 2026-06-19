'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { actionError } from '@/lib/action-error'

// Removes a webhook subscription (the delivery cron stops sending to it
// immediately). Owner-only, box-scoped (can't delete another gym's webhook),
// audited.
export async function deleteWebhook(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage webhooks.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Invalid webhook ID.' }

  const service = createServiceClient()
  const { data, error } = await service
    .from('webhook_subscriptions')
    .delete()
    .eq('id', id)
    .eq('box_id', profile.box_id)
    .select('id, url')
    .maybeSingle()
  if (error) return actionError('deleteWebhook', error, 'Could not remove the webhook.')
  if (!data) return { error: 'Webhook not found.' }

  await logAudit(service, {
    boxId: profile.box_id, actorId: user.id, actorName: profile.full_name,
    action: 'webhook.unsubscribed', target: id, details: { url: data.url },
  })
  revalidatePath('/dashboard/settings')
  return { error: null }
}
