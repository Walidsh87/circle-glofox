'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { TIMEZONE_OFFSETS } from '@/lib/timezone'
import { isCoachOff } from '@/lib/coach-availability'
import { selectBestBatch } from '@/lib/credits'
import { validatePtSchedule, toMinutes, overlaps, withinAvailability } from '@/lib/pt-scheduling'

type ScheduleResult = { error: string | null; warning?: string }

function offsetStr(h: number): string {
  const sign = h >= 0 ? '+' : '-'
  return `${sign}${String(Math.abs(h)).padStart(2, '0')}:00`
}
function minuteOfDay(iso: string, timeZone: string): number {
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  return toMinutes(hhmm)
}

export async function schedulePtSession(
  athleteId: string, coachId: string, dateISO: string, startTime: string, durationMinutes: number, force = false,
): Promise<ScheduleResult> {
  const err = validatePtSchedule(dateISO, startTime, durationMinutes)
  if (err) return { error: err }
  if (!coachId) return { error: 'Pick a coach.' }

  const auth = await requireStaffAction('Only staff can schedule PT sessions.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const service = createServiceClient()

  // Coach must be a coach in the box; athlete must be in the box.
  const { data: coachRow } = await service.from('profiles').select('id').eq('id', coachId).eq('box_id', profile.box_id).eq('role', 'coach').maybeSingle()
  if (!coachRow) return { error: 'Coach not found in your gym.' }
  const { data: athleteRow } = await service.from('profiles').select('id').eq('id', athleteId).eq('box_id', profile.box_id).maybeSingle()
  if (!athleteRow) return { error: 'Member not found in your gym.' }

  const { data: box } = await service.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const timezone = box?.timezone ?? 'Asia/Dubai'
  const off = TIMEZONE_OFFSETS[timezone] ?? 4

  const startMin = toMinutes(startTime)
  const endMin = startMin + durationMinutes
  const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay()
  const scheduledAt = `${dateISO}T${startTime}:00${offsetStr(off)}`
  const dayStart = `${dateISO}T00:00:00${offsetStr(off)}`
  const dayEnd = `${dateISO}T23:59:59${offsetStr(off)}`

  // 1. Approved time-off (hard block).
  const { data: timeOff } = await service.from('coach_time_off')
    .select('coach_id, start_date, end_date').eq('box_id', profile.box_id).eq('coach_id', coachId).eq('status', 'approved')
  if (isCoachOff(coachId, dateISO, (timeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[])) {
    return { error: 'That coach is on leave that day.' }
  }

  // 2. Overlapping PT session (hard block).
  const { data: ptRows } = await service.from('pt_sessions')
    .select('scheduled_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', coachId).eq('status', 'scheduled')
    .gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd)
  for (const s of (ptRows ?? []) as { scheduled_at: string; duration_minutes: number }[]) {
    const sStart = minuteOfDay(s.scheduled_at, timezone)
    if (overlaps(startMin, endMin, sStart, sStart + s.duration_minutes)) return { error: 'That coach already has a PT session then.' }
  }

  // 3. Overlapping class (hard block).
  const { data: classRows } = await service.from('class_instances')
    .select('starts_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', coachId).eq('status', 'scheduled')
    .gte('starts_at', dayStart).lte('starts_at', dayEnd)
  for (const c of (classRows ?? []) as { starts_at: string; duration_minutes: number }[]) {
    const cStart = minuteOfDay(c.starts_at, timezone)
    if (overlaps(startMin, endMin, cStart, cStart + c.duration_minutes)) return { error: 'That coach is teaching a class then.' }
  }

  // 4. Outside the coach's availability window (soft warning unless forced).
  const { data: windows } = await service.from('coach_availability')
    .select('weekday, start_time, end_time').eq('box_id', profile.box_id).eq('coach_id', coachId).eq('weekday', weekday)
  if (!withinAvailability((windows ?? []) as { weekday: number; start_time: string; end_time: string }[], weekday, startMin, endMin) && !force) {
    return { error: null, warning: "That coach isn't usually available then — schedule anyway?" }
  }

  // 5. PT credit (auto-select best batch).
  const today = new Date().toISOString().slice(0, 10)
  const { data: batches } = await service.from('package_credits')
    .select('id, credits_remaining, expires_at').eq('athlete_id', athleteId).eq('box_id', profile.box_id).eq('kind', 'pt_session').gt('credits_remaining', 0)
  const best = selectBestBatch((batches ?? []) as { id: string; credits_remaining: number; expires_at: string | null }[], today)
  if (!best) return { error: 'No PT credits — sell a PT block first.' }

  // 6. Consume → insert → refund on insert failure (mirrors book-class).
  const { data: remaining, error: consumeErr } = await service.rpc('consume_credit', { p_credit_id: best.id })
  if (consumeErr || remaining === null || remaining === undefined) return { error: 'Could not reserve a PT credit. Please try again.' }

  const { error: insErr } = await service.from('pt_sessions').insert({
    box_id: profile.box_id, coach_id: coachId, athlete_id: athleteId, credit_id: best.id,
    scheduled_at: scheduledAt, duration_minutes: durationMinutes, status: 'scheduled', redeemed_by: user.id,
  })
  if (insErr) {
    const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: best.id })
    if (refundErr) console.error('refund_credit failed after pt_sessions insert error; credit stranded:', best.id, refundErr)
    console.error('schedulePtSession insert failed:', insErr)
    return { error: 'Could not schedule the session. Please try again.' }
  }

  revalidatePath(`/dashboard/members/${athleteId}`)
  revalidatePath('/dashboard/pt')
  return { error: null }
}
