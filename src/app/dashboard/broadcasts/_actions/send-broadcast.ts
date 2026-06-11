'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { validateBroadcast } from '../_lib/broadcast-validation'
import { loadCandidates } from '../_lib/load-candidates'
import { selectRecipients, type Segment } from '@/lib/broadcast-audience'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import { validateBlocks, flattenBlocks, type Block } from '@/lib/email-blocks'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

type Result = { error: string | null; broadcastId?: string; sent?: number; failed?: number; skipped?: number }

const CHUNK = 100

export async function sendBroadcast(
  subject: string,
  body: string,
  audienceStatus: string,
  tag: string | null,
  bodyBlocks?: Block[] | null
): Promise<Result> {
  const auth = await requireOwnerAction('Only owners can send broadcasts.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile: caller } = auth

  // Blocks (if any) flatten to the NOT-NULL body column; subject + audience always validated.
  const effectiveBody = bodyBlocks ? (flattenBlocks(bodyBlocks) || subject.trim()) : body.trim()
  const vErr = validateBroadcast(subject, effectiveBody, audienceStatus)
  if (vErr) return { error: vErr }
  if (bodyBlocks) {
    const bErr = validateBlocks(bodyBlocks)
    if (bErr) return { error: bErr }
  }

  const service = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const subjectClean = subject.trim()

  const candidates = await loadCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoEmail } = selectRecipients(candidates, { status: audienceStatus as Segment, tag })
  const skipped = skippedOptedOut.length + skippedNoEmail.length

  const { data: bc, error: bcErr } = await service
    .from('broadcasts')
    .insert({
      box_id: caller.box_id,
      subject: subjectClean,
      body: effectiveBody,
      body_blocks: bodyBlocks ?? null,
      audience_status: audienceStatus,
      audience_tag: tag,
      created_by: user.id,
      status: 'sending',
      recipient_count: included.length,
      skipped_count: skipped,
    })
    .select('id')
    .single()
  if (bcErr || !bc) return { error: bcErr?.message ?? 'Could not create broadcast.' }
  const broadcastId = bc.id as string

  const rows = [
    ...included.map((c) => ({ broadcast_id: broadcastId, box_id: caller.box_id, athlete_id: c.athlete_id, email: c.email as string, status: 'queued' as const })),
    ...skippedOptedOut.map((c) => ({ broadcast_id: broadcastId, box_id: caller.box_id, athlete_id: c.athlete_id, email: c.email ?? '', status: 'skipped' as const, error: 'opted out' })),
    ...skippedNoEmail.map((c) => ({ broadcast_id: broadcastId, box_id: caller.box_id, athlete_id: c.athlete_id, email: '', status: 'skipped' as const, error: 'no email' })),
  ]
  if (rows.length > 0) await service.from('broadcast_recipients').insert(rows)

  const { data: box } = await service.from('boxes').select('name').eq('id', caller.box_id).single()
  const gymName = box?.name ?? 'your gym'
  const { data: tokens } = await service.from('profiles').select('id, unsubscribe_token').eq('box_id', caller.box_id)
  const tokenByAthlete = new Map<string, string>(
    ((tokens ?? []) as { id: string; unsubscribe_token: string }[]).map((t) => [t.id, t.unsubscribe_token])
  )

  let sent = 0
  let failed = 0
  for (let i = 0; i < included.length; i += CHUNK) {
    const chunk = included.slice(i, i + CHUNK)
    const messages: BroadcastMessage[] = chunk.map((c) => ({
      to: c.email as string,
      subject: subjectClean,
      html: renderEmail({
        blocks: bodyBlocks ?? null,
        plainBody: effectiveBody,
        ctx: {
          firstName: firstNameOf(c.full_name),
          gymName,
          unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${tokenByAthlete.get(c.athlete_id) ?? ''}`,
        },
      }),
    }))
    const result = await sendBroadcastEmails(messages)
    const ids = result.ids ?? []
    if (result.ok) {
      sent += chunk.length
      const now = new Date().toISOString()
      // Per-recipient update so each row gets its own resend_id (for the analytics webhook).
      for (let j = 0; j < chunk.length; j++) {
        await service.from('broadcast_recipients').update({ status: 'sent', sent_at: now, resend_id: ids[j] ?? null }).eq('broadcast_id', broadcastId).eq('athlete_id', chunk[j].athlete_id)
      }
    } else {
      failed += chunk.length
      const failIds = chunk.map((c) => c.athlete_id)
      await service.from('broadcast_recipients').update({ status: 'failed', error: result.error ?? 'send failed' }).eq('broadcast_id', broadcastId).in('athlete_id', failIds)
    }
  }

  await service.from('broadcasts').update({ status: 'done', sent_count: sent, failed_count: failed }).eq('id', broadcastId)
  revalidatePath('/dashboard/broadcasts')
  return { error: null, broadcastId, sent, failed, skipped }
}
