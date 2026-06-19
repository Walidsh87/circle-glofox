'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'

export async function savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<{ error: string | null }> {
  const ctx = await requireUserAction()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, user } = ctx

  if (!endpoint?.startsWith('https://') || !p256dh || !auth) return { error: 'Invalid subscription.' }

  const { data: profile } = await supabase.from('profiles').select('box_id').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found.' }

  // push_subscriptions has RLS enabled with no policies — service role only,
  // and the row is hard-pinned to the caller.
  const service = createServiceClient()
  const { error } = await service.from('push_subscriptions').upsert(
    { box_id: profile.box_id, athlete_id: user.id, endpoint, p256dh, auth },
    { onConflict: 'endpoint' },
  )
  if (error) return actionError('savePushSubscription', error)
  return { error: null }
}

export async function deletePushSubscription(endpoint: string): Promise<{ error: string | null }> {
  const ctx = await requireUserAction()
  if ('error' in ctx) return { error: ctx.error }
  const { user } = ctx

  const service = createServiceClient()
  const { error } = await service.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('athlete_id', user.id)
  if (error) return actionError('deletePushSubscription', error)
  return { error: null }
}
