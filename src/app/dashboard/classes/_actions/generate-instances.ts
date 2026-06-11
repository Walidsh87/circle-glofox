'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

// GCC timezones have no DST — fixed offsets are safe
const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai':   4,
  'Asia/Muscat':  4,
  'Asia/Riyadh':  3,
  'Asia/Qatar':   3,
  'Asia/Kuwait':  3,
  'Asia/Bahrain': 3,
}

function utcDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay()
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function buildStartsAt(dateStr: string, timeStr: string, offsetHours: number): string {
  const sign = offsetHours >= 0 ? '+' : '-'
  const offset = `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`
  return `${dateStr}T${timeStr}${offset}`
}

type Result = { created: number; skipped: number; error: string | null }

export async function generateInstances(startDate: string): Promise<Result> {
  const auth = await requireProgrammingAction('Only owners and coaches can generate instances.')
  if ('error' in auth) return { created: 0, skipped: 0, error: auth.error }
  const { supabase, profile } = auth

  // Fetch active templates + box timezone in parallel
  const [{ data: templates }, { data: box }] = await Promise.all([
    supabase
      .from('class_templates')
      .select('id, weekday, start_time, duration_minutes, capacity, coach_id')
      .eq('box_id', profile.box_id)
      .eq('active', true),
    supabase
      .from('boxes')
      .select('timezone')
      .eq('id', profile.box_id)
      .single(),
  ])

  if (!templates?.length) return { created: 0, skipped: 0, error: null }

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

  const toInsert: object[] = []

  for (const date of dates) {
    const dow = utcDayOfWeek(date)
    for (const t of templates) {
      if (t.weekday !== dow) continue
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
    }
  }

  if (!toInsert.length) return { created: 0, skipped: (existing ?? []).length, error: null }

  const { error } = await supabase.from('class_instances').insert(toInsert)
  if (error) return { created: 0, skipped: 0, error: error.message }

  revalidatePath('/dashboard/classes')
  return { created: toInsert.length, skipped: (existing ?? []).length, error: null }
}
