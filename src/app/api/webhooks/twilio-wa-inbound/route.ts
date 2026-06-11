import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { verifyTwilioSignature } from '@/lib/twilio'
import { normalizeUaePhone } from '@/lib/sms'
import { messagePreview } from '@/lib/inbox'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-wa-inbound`
  if (!verifyTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const from = (params.From ?? '').replace('whatsapp:', '')
  const body = (params.Body ?? '').trim()
  const phone = normalizeUaePhone(from)
  if (!phone || !body) return NextResponse.json({ ok: true })

  const service = createServiceClient()
  const { data: profs } = await service.from('profiles').select('id, box_id, phone').eq('role', 'athlete')
  const member = ((profs ?? []) as { id: string; box_id: string; phone: string | null }[]).find((p) => normalizeUaePhone(p.phone) === phone)
  if (!member) return NextResponse.json({ ok: true })

  const nowIso = new Date().toISOString()
  const { data: conv } = await service.from('conversations').upsert({
    box_id: member.box_id,
    member_id: member.id,
    last_message_at: nowIso,
    last_preview: messagePreview(body),
    last_sender_role: 'member',
    staff_unread: true,
    member_unread: false,
    last_wa_inbound_at: nowIso,
  }, { onConflict: 'box_id,member_id' }).select('id').single()
  if (!conv) return NextResponse.json({ ok: true })

  await service.from('messages').insert({
    conversation_id: conv.id,
    box_id: member.box_id,
    sender_id: member.id,
    sender_role: 'member',
    channel: 'whatsapp',
    body,
  })
  return NextResponse.json({ ok: true })
}
