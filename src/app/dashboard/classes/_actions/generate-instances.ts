'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { TIMEZONE_OFFSETS, formatTimezoneOffset } from '@/lib/timezone'
import { inRamadanWindow } from '@/lib/hijri'
import { findCoachConflicts } from '@/lib/coach-availability'

function utcDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay()
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function buildStartsAt(dateStr: string, timeStr: string, offsetHours: number): string {
  return `${dateStr}T${timeStr}${formatTimezoneOffset(offsetHours)}`
}

type Result = { created: number; skipped: number; error: string | null; ramadanGap: boolean; coachConflicts: number }

export async function generateInstances(startDate: string): Promise<Result> {
  const auth = await requireProgrammingAction('Only owners and coaches can generate instances.')
  if ('error' in auth) return { created: 0, skipped: 0, error: auth.error, ramadanGap: false, coachConflicts: 0 }
  const { supabase, profile } = auth

  // Fetch active templates + box timezone in parallel
  const [{ data: templates }, { data: box }] = await Promise.all([
    supabase
      .from('class_templates')
      .select('id, weekday, start_time, duration_minutes, capacity, coach_id, season')
      .eq('box_id', profile.box_id)
      .eq('active', true),
    supabase
      .from('boxes')
      .select('timezone, ramadan_start, ramadan_end')
      .eq('id', profile.box_id)
      .single(),
  ])

  if (!templates?.length) return { created: 0, skipped: 0, error: null, ramadanGap: false, coachConflicts: 0 }

  const timezone = box?.timezone ?? 'Asia/Dubai'
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4

  // Build the 7 dates starting from startDate
  const dates: string[] = Array.from({ length: 7 }, (_, i) => addDays(startDate, i))

  // Fetch existing instances in this window to avoid duplicates
  const windowStart = buildStartsAt(dates[0], '00:00:00', offsetHours)
  const windowEnd   = buildStartsAt(addDays(dates[6], 1), '00:00:00', offsetHours)

  const { data: existing } = await supabase
    .from('class_instances')
    .select('template_id, starts_at')
    .eq('box_id', profile.box_id)
    .gte('starts_at', windowStart)
    .lt('starts_at', windowEnd)

  const existingKeys = new Set(
    (existing ?? []).map((e) => `${e.template_id}|${e.starts_at.slice(0, 10)}`)
  )

  const rStart = box?.ramadan_start ?? null
  const rEnd = box?.ramadan_end ?? null
  const toInsert: object[] = []
  const candidates: { id: string; coach_id: string | null; date: string }[] = []

  for (const date of dates) {
    const dow = utcDayOfWeek(date)
    const wantSeason = inRamadanWindow(date, rStart, rEnd) ? 'ramadan' : 'default'
    for (const t of templates) {
      if (t.weekday !== dow) continue
      if ((t.season ?? 'default') !== wantSeason) continue
      const key = `${t.id}|${date}`
      if (existingKeys.has(key)) continue
      toInsert.push({
        box_id:           profile.box_id,
        template_id:      t.id,
        coach_id:         t.coach_id,
        starts_at:        buildStartsAt(date, t.start_time, offsetHours),
        duration_minutes: t.duration_minutes,
        capacity:         t.capacity,
        status:           'scheduled',
      })
      // id is an ephemeral position label for conflict counting — NOT a class_instances row id
      candidates.push({ id: String(candidates.length), coach_id: t.coach_id ?? null, date })
    }
  }

  const hasRamadanTemplates = templates.some((t) => (t.season ?? 'default') === 'ramadan')
  const ramadanGap = dates.some((d) => inRamadanWindow(d, rStart, rEnd)) && !hasRamadanTemplates

  if (!toInsert.length) return { created: 0, skipped: (existing ?? []).length, error: null, ramadanGap, coachConflicts: 0 }

  const { error } = await supabase.from('class_instances').insert(toInsert)
  if (error) { console.error('generateInstances insert failed:', error); return { created: 0, skipped: 0, error: 'Could not create class instances.', ramadanGap, coachConflicts: 0 } }

  const { data: timeOff } = await supabase
    .from('coach_time_off')
    .select('coach_id, start_date, end_date')
    .eq('box_id', profile.box_id)
    .eq('status', 'approved')
    .lte('start_date', dates[6])
    .gte('end_date', dates[0])
  const coachConflicts = findCoachConflicts(
    candidates,
    (timeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[],
  ).size

  revalidatePath('/dashboard/classes')
  return { created: toInsert.length, skipped: (existing ?? []).length, error: null, ramadanGap, coachConflicts }
}
