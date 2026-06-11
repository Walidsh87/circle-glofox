'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import type { Block } from '@/lib/email-blocks'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

type Result = { error: string | null; sent?: number; failed?: number }

const CHUNK = 100

export async function retryFailedBroadcast(broadcastId: string): Promise<Result> {
  const auth = await requireOwnerAction('Only owners can send broadcasts.')
  if ('error' in auth) return { error: auth.error }
  const { profile: caller } = auth

  const service = createServiceClient()

  const { data: bc } = await service.from('broadcasts').select('id, box_id, subject, body, body_blocks').eq('id', broadcastId).single()
  if (!bc || bc.box_id !== caller.box_id) return { error: 'Broadcast not found.' }

  const { data: failedRows } = await service
    .from('broadcast_recipients')
    .select('athlete_id, email')
    .eq('broadcast_id', broadcastId)
    .eq('status', 'failed')
  const targets = (failedRows ?? []) as { athlete_id: string; email: string }[]
  if (targets.length === 0) return { error: null, sent: 0, failed: 0 }

  const ids = targets.map((t) => t.athlete_id)
  const { data: box } = await service.from('boxes').select('name').eq('id', caller.box_id).single()
  const gymName = box?.name ?? 'your gym'
  const { data: profiles } = await service.from('profiles').select('id, full_name, unsubscribe_token').eq('box_id', caller.box_id).in('id', ids)
  const byId = new Map<string, { full_name: string | null; unsubscribe_token: string }>(
    ((profiles ?? []) as { id: string; full_name: string | null; unsubscribe_token: string }[]).map((p) => [p.id, p])
  )

  let sent = 0
  let failed = 0
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK)
    const messages: BroadcastMessage[] = chunk.map((t) => ({
      to: t.email,
      subject: bc.subject,
      html: renderEmail({
        blocks: (bc.body_blocks as Block[] | null) ?? null,
        plainBody: bc.body,
        ctx: {
          firstName: firstNameOf(byId.get(t.athlete_id)?.full_name ?? ''),
          gymName,
          unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${byId.get(t.athlete_id)?.unsubscribe_token ?? ''}`,
        },
      }),
    }))
    const chunkIds = chunk.map((t) => t.athlete_id)
    const result = await sendBroadcastEmails(messages)
    if (result.ok) {
      sent += chunk.length
      const now = new Date().toISOString()
      for (let j = 0; j < chunk.length; j++) {
        await service.from('broadcast_recipients').update({ status: 'sent', sent_at: now, error: null, resend_id: result.ids[j] ?? null }).eq('broadcast_id', broadcastId).eq('athlete_id', chunk[j].athlete_id)
      }
    } else {
      failed += chunk.length
      await service.from('broadcast_recipients').update({ status: 'failed', error: result.error ?? 'send failed' }).eq('broadcast_id', broadcastId).in('athlete_id', chunkIds)
    }
  }

  const { count: sentCount } = await service.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', broadcastId).eq('status', 'sent')
  const { count: failedCount } = await service.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', broadcastId).eq('status', 'failed')
  await service.from('broadcasts').update({ sent_count: sentCount ?? 0, failed_count: failedCount ?? 0 }).eq('id', broadcastId)

  revalidatePath(`/dashboard/broadcasts/${broadcastId}`)
  return { error: null, sent, failed }
}
