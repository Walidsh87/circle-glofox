import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Webhook } from 'svix'
import { env } from '@/env'
import { parseResendEvent } from '@/lib/resend-webhook'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  const rawBody = await req.text()
  try {
    new Webhook(env.RESEND_WEBHOOK_SECRET).verify(rawBody, {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const ev = parseResendEvent(rawBody)
  const now = new Date().toISOString()

  if (ev.kind === 'opened') {
    await service.from('broadcast_recipients').update({ opened_at: now }).eq('resend_id', ev.emailId).is('opened_at', null)
  } else if (ev.kind === 'clicked') {
    await service.from('broadcast_recipients').update({ clicked_at: now }).eq('resend_id', ev.emailId).is('clicked_at', null)
    await service.from('broadcast_recipients').update({ opened_at: now }).eq('resend_id', ev.emailId).is('opened_at', null)
  } else if (ev.kind === 'suppress') {
    const { data: rec } = await service.from('broadcast_recipients').select('athlete_id').eq('resend_id', ev.emailId).maybeSingle()
    if (rec?.athlete_id) await service.from('profiles').update({ marketing_opt_out: true }).eq('id', rec.athlete_id)
  }

  return NextResponse.json({ ok: true })
}
