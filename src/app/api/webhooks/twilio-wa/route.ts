import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { verifyTwilioSignature } from '@/lib/twilio'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // cap a hung handler (webhooks finish in <5s); bounds runaway cost

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-wa`
  if (!verifyTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const sid = params.MessageSid
  const status = params.MessageStatus
  if (!sid) return NextResponse.json({ ok: true })

  const next = status === 'delivered' ? 'delivered' : status === 'read' ? 'read' : (status === 'failed' || status === 'undelivered') ? 'failed' : null
  if (next) {
    const service = createServiceClient()
    await service.from('wa_recipients').update({ status: next }).eq('twilio_sid', sid)
  }
  return NextResponse.json({ ok: true })
}
