import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { buildDigestPushes, sendPushTo, type DigestRow } from '@/lib/push'

export const dynamic = 'force-dynamic'

// Gulf timezones have no DST — fixed offsets, house convention.
const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type Row = { athlete_id: string; class_instances: Embedded<{ starts_at: string; class_templates: Embedded<{ name: string }> }> }

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceClient()

  const { data: boxes } = await service.from('boxes').select('id, timezone')
  let pushed = 0
  for (const box of (boxes ?? []) as { id: string; timezone: string | null }[]) {
    const tz = box.timezone ?? 'Asia/Dubai'
    const offset = TIMEZONE_OFFSETS[tz] ?? 4
    const localDay = new Date(Date.now() + offset * 3_600_000).toISOString().slice(0, 10)
    const dayStartMs = new Date(`${localDay}T00:00:00Z`).getTime() - offset * 3_600_000
    const dayStart = new Date(dayStartMs).toISOString()
    const dayEnd = new Date(dayStartMs + 24 * 3_600_000).toISOString()

    const { data: rows } = await service
      .from('bookings')
      .select('athlete_id, class_instances!inner(starts_at, class_templates(name))')
      .eq('box_id', box.id)
      .eq('class_instances.status', 'scheduled')
      .gte('class_instances.starts_at', dayStart)
      .lt('class_instances.starts_at', dayEnd)

    const digestRows: DigestRow[] = ((rows ?? []) as Row[])
      .map((r) => {
        const ci = one(r.class_instances)
        if (!ci) return null
        return { athlete_id: r.athlete_id, starts_at: ci.starts_at, class_name: one(ci.class_templates)?.name ?? 'Class' }
      })
      .filter((r): r is DigestRow => r !== null)

    const athleteIds = [...new Set(digestRows.map((r) => r.athlete_id))]
    if (athleteIds.length === 0) continue
    const { data: subs } = await service.from('push_subscriptions').select('athlete_id').in('athlete_id', athleteIds)
    const withSubs = new Set(((subs ?? []) as { athlete_id: string }[]).map((s) => s.athlete_id))
    const filtered = digestRows.filter((r) => withSubs.has(r.athlete_id))

    for (const d of buildDigestPushes(filtered, tz)) {
      pushed += await sendPushTo(service, d.athleteId, d.payload)
    }
  }
  return NextResponse.json({ pushed })
}
