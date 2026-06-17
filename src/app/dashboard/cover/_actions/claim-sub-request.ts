'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { TIMEZONE_OFFSETS } from '@/lib/timezone'
import { isCoachOff } from '@/lib/coach-availability'
import { eligibleToClaim } from '@/lib/sub-finder'
import { notifyPosterOfClaim } from '@/lib/cover-notify'

function offsetStr(h: number): string {
  const sign = h >= 0 ? '+' : '-'
  return `${sign}${String(Math.abs(h)).padStart(2, '0')}:00`
}
function minuteOfDay(iso: string, tz: string): number {
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(/^24:/, '00:')
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

type Inst = { starts_at: string; duration_minutes: number; status: string }

export async function claimSubRequest(subRequestId: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can claim a cover request.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: req } = await supabase.from('sub_requests')
    .select('id, status, posted_by, instance_id, class_instances(starts_at, duration_minutes, status)')
    .eq('id', subRequestId).eq('box_id', profile.box_id).maybeSingle()
  if (!req) return { error: 'Cover request not found.' }
  const r = req as { id: string; status: string; posted_by: string; instance_id: string; class_instances: Inst | Inst[] | null }
  if (r.status !== 'open') return { error: 'This request is no longer open.' }
  if (r.posted_by === user.id) return { error: "You can't claim your own request." }
  const inst = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
  if (!inst || inst.status !== 'scheduled') return { error: 'That class is no longer scheduled.' }
  if (new Date(inst.starts_at).getTime() <= Date.now()) return { error: 'That class has already started.' }

  // Eligibility: not on leave + no overlapping class/PT that day.
  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const tz = box?.timezone ?? 'Asia/Dubai'
  const off = TIMEZONE_OFFSETS[tz] ?? 4
  const dateISO = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(inst.starts_at))
  const dayStart = `${dateISO}T00:00:00${offsetStr(off)}`
  const dayEnd = `${dateISO}T23:59:59${offsetStr(off)}`
  const startMin = minuteOfDay(inst.starts_at, tz)
  const endMin = startMin + inst.duration_minutes

  const [{ data: timeOff }, { data: myClasses }, { data: myPts }] = await Promise.all([
    supabase.from('coach_time_off').select('coach_id, start_date, end_date').eq('box_id', profile.box_id).eq('coach_id', user.id).eq('status', 'approved'),
    supabase.from('class_instances').select('starts_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', user.id).eq('status', 'scheduled').gte('starts_at', dayStart).lte('starts_at', dayEnd),
    supabase.from('pt_sessions').select('scheduled_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', user.id).eq('status', 'scheduled').gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd),
  ])
  const onLeave = isCoachOff(user.id, dateISO, (timeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[])
  const busy = [
    ...((myClasses ?? []) as { starts_at: string; duration_minutes: number }[]).map((c) => { const s = minuteOfDay(c.starts_at, tz); return { start: s, end: s + c.duration_minutes } }),
    ...((myPts ?? []) as { scheduled_at: string; duration_minutes: number }[]).map((p) => { const s = minuteOfDay(p.scheduled_at, tz); return { start: s, end: s + p.duration_minutes } }),
  ]
  const elig = eligibleToClaim(onLeave, busy, startMin, endMin)
  if (!elig.ok) return { error: elig.reason === 'on_leave' ? "You're on leave that day." : "You're already booked then." }

  // Atomic claim — only succeeds while the request is still open.
  const { data: claimed } = await supabase.from('sub_requests')
    .update({ status: 'claimed', claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', subRequestId).eq('status', 'open').select('id')
  if (!claimed || (claimed as { id: string }[]).length === 0) return { error: 'Someone else just claimed this class.' }

  // Reassign the class to the claimer (existing programming-tier policy).
  const { error: reErr } = await supabase.from('class_instances').update({ coach_id: user.id }).eq('id', r.instance_id).eq('box_id', profile.box_id)
  if (reErr) { console.error('claim reassign failed:', reErr); return { error: 'Claimed, but the class reassignment failed — tell the owner.' } }

  await notifyPosterOfClaim(profile.box_id, r.instance_id, r.posted_by, profile.full_name ?? 'A coach')
  revalidatePath('/dashboard/cover')
  revalidatePath('/dashboard/prep')
  return { error: null }
}
