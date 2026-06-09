'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { validateBroadcast } from '../_lib/broadcast-validation'
import { loadCandidates } from '../_lib/load-candidates'
import { selectRecipients, type Segment } from '@/lib/broadcast-audience'
import { renderBroadcastBody, firstNameOf } from '@/lib/broadcast-render'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

type Result = { error: string | null; broadcastId?: string; sent?: number; failed?: number; skipped?: number }

const CHUNK = 100

export async function sendBroadcast(
  subject: string,
  body: string,
  audienceStatus: string,
  tag: string | null
): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send broadcasts.' }

  const vErr = validateBroadcast(subject, body, audienceStatus)
  if (vErr) return { error: vErr }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  const subjectClean = subject.trim()
  const bodyClean = body.trim()

  const candidates = await loadCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoEmail } = selectRecipients(candidates, { status: audienceStatus as Segment, tag })
  const skipped = skippedOptedOut.length + skippedNoEmail.length

  const { data: bc, error: bcErr } = await service
    .from('broadcasts')
    .insert({
      box_id: caller.box_id,
      subject: subjectClean,
      body: bodyClean,
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
      html: renderBroadcastBody(bodyClean, {
        firstName: firstNameOf(c.full_name),
        gymName,
        unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${tokenByAthlete.get(c.athlete_id) ?? ''}`,
      }),
    }))
    const ids = chunk.map((c) => c.athlete_id)
    const { ok, error } = await sendBroadcastEmails(messages)
    if (ok) {
      sent += chunk.length
      await service.from('broadcast_recipients').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('broadcast_id', broadcastId).in('athlete_id', ids)
    } else {
      failed += chunk.length
      await service.from('broadcast_recipients').update({ status: 'failed', error: error ?? 'send failed' }).eq('broadcast_id', broadcastId).in('athlete_id', ids)
    }
  }

  await service.from('broadcasts').update({ status: 'done', sent_count: sent, failed_count: failed }).eq('id', broadcastId)
  revalidatePath('/dashboard/broadcasts')
  return { error: null, broadcastId, sent, failed, skipped }
}
