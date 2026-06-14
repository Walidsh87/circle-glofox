import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { matchAutomation, type TriggerType } from '@/lib/automations'
import { unauthorizedCron } from '@/lib/cron-auth'
import { loadAutoMembers } from '@/lib/auto-members'
import { nextDueStep, enrollmentStillValid, type SequenceStep } from '@/lib/sequences'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

export const dynamic = 'force-dynamic'

type SequenceRow = { id: string; box_id: string; name: string; trigger_type: TriggerType; trigger_days: number | null; steps: SequenceStep[] }
type EnrollmentRow = { id: string; sequence_id: string; athlete_id: string; enrolled_on: string; enroll_key: string; status: string }

export async function GET(request: NextRequest) {
  const denied = unauthorizedCron(request)
  if (denied) return denied
  const today = new Date().toISOString().slice(0, 10)
  const service = createServiceClient({
    global: { fetch: (i: RequestInfo | URL, init?: RequestInit) => fetch(i, { ...init, cache: 'no-store' }) },
  })

  const { data: seqData } = await service.from('sequences').select('id, box_id, name, trigger_type, trigger_days, steps').eq('enabled', true)
  const sequences = (seqData ?? []) as SequenceRow[]

  const byBox = new Map<string, SequenceRow[]>()
  for (const s of sequences) {
    const arr = byBox.get(s.box_id) ?? []
    arr.push(s)
    byBox.set(s.box_id, arr)
  }

  let enrolled = 0, sent = 0, exited = 0
  const errors: string[] = []

  for (const [boxId, boxSeqs] of byBox) {
    const seqIds = boxSeqs.map((s) => s.id)
    const { data: box } = await service.from('boxes').select('name').eq('id', boxId).single()
    const gymName = (box as { name: string } | null)?.name ?? 'your gym'
    const { members, tokenByAthlete } = await loadAutoMembers(service, boxId, today)
    const memberById = new Map(members.map((m) => [m.athlete_id, m]))
    const seqById = new Map(boxSeqs.map((s) => [s.id, s]))

    // ENROLL
    const { data: existingData } = await service.from('sequence_enrollments').select('sequence_id, athlete_id, enroll_key').in('sequence_id', seqIds)
    const existing = new Set(((existingData ?? []) as { sequence_id: string; athlete_id: string; enroll_key: string }[]).map((e) => `${e.sequence_id}|${e.athlete_id}|${e.enroll_key}`))
    const newRows: { box_id: string; sequence_id: string; athlete_id: string; enrolled_on: string; enroll_key: string; status: string }[] = []
    for (const seq of boxSeqs) {
      const matches = matchAutomation({ id: seq.id, trigger_type: seq.trigger_type, trigger_days: seq.trigger_days }, members, today)
      for (const m of matches) {
        const k = `${seq.id}|${m.athlete_id}|${m.fire_key}`
        if (existing.has(k)) continue
        existing.add(k)
        newRows.push({ box_id: boxId, sequence_id: seq.id, athlete_id: m.athlete_id, enrolled_on: today, enroll_key: m.fire_key, status: 'active' })
      }
    }
    if (newRows.length) {
      const { error } = await service.from('sequence_enrollments').insert(newRows)
      if (error) errors.push(`enroll: ${error.message}`)
      else enrolled += newRows.length
    }

    // ADVANCE
    const { data: activeData } = await service.from('sequence_enrollments').select('id, sequence_id, athlete_id, enrolled_on, enroll_key, status').eq('status', 'active').in('sequence_id', seqIds)
    const active = (activeData ?? []) as EnrollmentRow[]
    const activeIds = active.map((e) => e.id)
    const sentCount = new Map<string, number>()
    if (activeIds.length) {
      const { data: sendsData } = await service.from('sequence_sends').select('enrollment_id').in('enrollment_id', activeIds)
      for (const s of (sendsData ?? []) as { enrollment_id: string }[]) sentCount.set(s.enrollment_id, (sentCount.get(s.enrollment_id) ?? 0) + 1)
    }

    for (const e of active) {
      const seq = seqById.get(e.sequence_id)
      if (!seq) continue
      const member = memberById.get(e.athlete_id)
      if (!member || member.marketing_opt_out || !member.email || !enrollmentStillValid(seq.trigger_type, member, e.enrolled_on)) {
        await service.from('sequence_enrollments').update({ status: 'exited' }).eq('id', e.id)
        exited++
        continue
      }
      const idx = nextDueStep(seq.steps, e.enrolled_on, today, sentCount.get(e.id) ?? 0)
      if (idx == null) continue
      const step = seq.steps[idx]
      const msg: BroadcastMessage = {
        to: member.email as string,
        subject: step.subject,
        html: renderEmail({
          blocks: step.body_blocks,
          plainBody: step.subject,
          ctx: { firstName: firstNameOf(member.full_name), gymName, unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${tokenByAthlete.get(e.athlete_id) ?? ''}` },
        }),
      }
      const result = await sendBroadcastEmails([msg])
      if (!result.ok) { errors.push(`send ${seq.id}: ${result.error ?? 'failed'}`); continue }
      sent++
      const { error: insErr } = await service.from('sequence_sends').insert({ box_id: boxId, enrollment_id: e.id, step_index: idx, resend_id: result.ids[0] ?? null })
      if (insErr) errors.push(`log ${seq.id}: ${insErr.message}`)
      if (idx === seq.steps.length - 1) await service.from('sequence_enrollments').update({ status: 'completed' }).eq('id', e.id)
    }
  }

  return NextResponse.json({ enrolled, sent, exited, errors })
}
