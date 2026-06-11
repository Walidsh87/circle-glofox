import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildCalendarFeed, type CalendarEvent } from '@/lib/ics'

export const dynamic = 'force-dynamic'

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type BookingRow = {
  id: string
  class_instances: Embedded<{ starts_at: string; duration_minutes: number | null; class_templates: Embedded<{ name: string }> }>
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // No session on a calendar poller → service role; every read is pinned to the token's athlete.
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('id, box_id').eq('calendar_token', token).maybeSingle()
  if (!profile) return new NextResponse('Not found', { status: 404 })

  const { data: box } = await service.from('boxes').select('name').eq('id', profile.box_id).maybeSingle()
  const gymName = box?.name ?? 'Gym'

  const from = new Date(Date.now() - 7 * 86400000).toISOString()
  const to = new Date(Date.now() + 60 * 86400000).toISOString()
  const { data: rows } = await service
    .from('bookings')
    .select('id, class_instances!inner(starts_at, duration_minutes, class_templates(name))')
    .eq('athlete_id', profile.id)
    .eq('box_id', profile.box_id)
    .eq('class_instances.status', 'scheduled')
    .gte('class_instances.starts_at', from)
    .lte('class_instances.starts_at', to)
    .limit(100)

  const events: CalendarEvent[] = ((rows ?? []) as BookingRow[])
    .map((r) => {
      const ci = one(r.class_instances)
      if (!ci) return null
      return {
        uid: r.id,
        title: one(ci.class_templates)?.name ?? 'Class',
        startsAtIso: ci.starts_at,
        durationMinutes: ci.duration_minutes ?? 60,
        location: gymName,
      }
    })
    .filter((e): e is CalendarEvent => e !== null)
    .sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))

  return new NextResponse(buildCalendarFeed({ calendarName: `${gymName} — Classes`, events }), {
    status: 200,
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' },
  })
}
