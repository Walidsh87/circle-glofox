import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { verifyTwilioSignature } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`
  if (!verifyTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const sid = params.MessageSid
  const status = params.MessageStatus
  if (!sid) return NextResponse.json({ ok: true })

  const next = status === 'delivered' ? 'delivered' : (status === 'failed' || status === 'undelivered') ? 'failed' : null
  if (next) {
    const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    await service.from('sms_recipients').update({ status: next }).eq('twilio_sid', sid)
  }
  return NextResponse.json({ ok: true })
}
