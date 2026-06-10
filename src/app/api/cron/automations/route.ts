import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { matchAutomation, type AutomationRule } from '@/lib/automations'
import { loadAutoMembers } from '@/lib/auto-members'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import { type Block } from '@/lib/email-blocks'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CHUNK = 100

type AutomationRow = AutomationRule & { box_id: string; name: string; subject: string; body_blocks: Block[] }

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = new Date().toISOString().slice(0, 10)
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: (i: RequestInfo | URL, init?: RequestInit) => fetch(i, { ...init, cache: 'no-store' }) },
  })

  const { data: automations } = await service.from('automations').select('id, box_id, name, trigger_type, trigger_days, subject, body_blocks').eq('enabled', true)
  const rules = (automations ?? []) as AutomationRow[]

  const byBox = new Map<string, AutomationRow[]>()
  for (const r of rules) {
    const arr = byBox.get(r.box_id) ?? []
    arr.push(r)
    byBox.set(r.box_id, arr)
  }

  let processed = 0, sent = 0, skipped = 0
  const errors: string[] = []

  for (const [boxId, boxRules] of byBox) {
    const { data: box } = await service.from('boxes').select('name').eq('id', boxId).single()
    const gymName = (box as { name: string } | null)?.name ?? 'your gym'
    const { members, tokenByAthlete } = await loadAutoMembers(service, boxId, today)

    for (const rule of boxRules) {
      processed++
      const matches = matchAutomation(rule, members, today)
      if (matches.length === 0) continue

      const { data: existing } = await service.from('automation_runs').select('athlete_id, fire_key').eq('automation_id', rule.id)
      const seen = new Set((((existing ?? []) as { athlete_id: string; fire_key: string }[]).map((e) => `${e.athlete_id}|${e.fire_key}`)))
      const fresh = matches.filter((m) => !seen.has(`${m.athlete_id}|${m.fire_key}`))
      if (fresh.length === 0) { skipped += matches.length; continue }

      const byAthlete = new Map(members.map((m) => [m.athlete_id, m]))
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK)
        const messages: BroadcastMessage[] = chunk.map((f) => {
          const m = byAthlete.get(f.athlete_id)!
          return {
            to: m.email as string,
            subject: rule.subject,
            html: renderEmail({
              blocks: rule.body_blocks,
              plainBody: rule.subject,
              ctx: {
                firstName: firstNameOf(m.full_name),
                gymName,
                unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${tokenByAthlete.get(f.athlete_id) ?? ''}`,
              },
            }),
          }
        })
        const result = await sendBroadcastEmails(messages)
        if (!result.ok) { errors.push(`send ${rule.id}: ${result.error ?? 'failed'}`); continue }
        sent += chunk.length
        const rows = chunk.map((f, j) => ({ box_id: boxId, automation_id: rule.id, athlete_id: f.athlete_id, fire_key: f.fire_key, resend_id: result.ids[j] ?? null }))
        const { error: insErr } = await service.from('automation_runs').insert(rows)
        if (insErr) errors.push(`log ${rule.id}: ${insErr.message}`)
      }
    }
  }

  return NextResponse.json({ processed, sent, skipped, errors })
}
