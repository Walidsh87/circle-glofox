import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { matchAutomation, type AutoMember, type AutomationRule } from '@/lib/automations'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import { type Block } from '@/lib/email-blocks'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CHUNK = 100

type AutomationRow = AutomationRule & { box_id: string; name: string; subject: string; body_blocks: Block[] }
type MRow = MembershipRow & { athlete_id: string; is_trial: boolean | null }

async function loadAutoMembers(
  service: SupabaseClient,
  boxId: string,
  today: string
): Promise<{ members: AutoMember[]; tokenByAthlete: Map<string, string> }> {
  const [{ data: profiles }, { data: memberships }, { data: bookings }] = await Promise.all([
    service.from('profiles').select('id, full_name, email, marketing_opt_out, created_at, date_of_birth, unsubscribe_token').eq('box_id', boxId).eq('role', 'athlete'),
    service.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until, is_trial').eq('box_id', boxId),
    service.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', boxId).eq('checked_in', true),
  ])

  const mByAthlete = new Map<string, MRow[]>()
  for (const m of (memberships ?? []) as MRow[]) {
    const arr = mByAthlete.get(m.athlete_id) ?? []
    arr.push(m)
    mByAthlete.set(m.athlete_id, arr)
  }

  const lastCheckIn = new Map<string, string>()
  for (const b of (bookings ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]) {
    const ci = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
    const startsAt = ci?.starts_at
    if (!startsAt || startsAt.slice(0, 10) >= today) continue
    const date = startsAt.slice(0, 10)
    const cur = lastCheckIn.get(b.athlete_id)
    if (!cur || date > cur) lastCheckIn.set(b.athlete_id, date)
  }

  const tokenByAthlete = new Map<string, string>()
  const members: AutoMember[] = ((profiles ?? []) as { id: string; full_name: string | null; email: string | null; marketing_opt_out: boolean | null; created_at: string; date_of_birth: string | null; unsubscribe_token: string }[]).map((p) => {
    tokenByAthlete.set(p.id, p.unsubscribe_token)
    const rows = mByAthlete.get(p.id) ?? []
    const trialEnds = rows
      .filter((r) => r.is_trial === true && r.end_date && r.end_date >= today)
      .map((r) => r.end_date as string)
      .sort()
    return {
      athlete_id: p.id,
      email: p.email ?? null,
      full_name: p.full_name ?? '',
      marketing_opt_out: p.marketing_opt_out === true,
      created_at: p.created_at,
      date_of_birth: p.date_of_birth,
      membershipStatus: getMembershipStatus(rows as MembershipRow[], today),
      trialEndDate: trialEnds[0] ?? null,
      lastCheckIn: lastCheckIn.get(p.id) ?? null,
    }
  })
  return { members, tokenByAthlete }
}

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
