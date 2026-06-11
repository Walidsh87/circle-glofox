import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { groupByDay, spotsLabel, spotsRemaining, type WidgetInstance } from '@/lib/schedule-widget'

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function ScheduleEmbedPage(ctx: { params: Promise<{ gymSlug: string }> }) {
  const { gymSlug } = await ctx.params
  const service = createServiceClient()
  const { data: box } = await service.from('boxes').select('id, name, timezone, logo_url').eq('slug', gymSlug).single()
  if (!box) notFound()

  const timezone = (box.timezone as string) || 'Asia/Dubai'
  const nowIso = new Date().toISOString()
  const sevenDaysIso = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const { data: rows } = await service
    .from('class_instances')
    .select('id, starts_at, capacity, class_templates(name), profiles(full_name), bookings(count)')
    .eq('box_id', box.id)
    .eq('status', 'scheduled')
    .gte('starts_at', nowIso)
    .lt('starts_at', sevenDaysIso)
    .order('starts_at')

  type Row = { id: string; starts_at: string; capacity: number | null; class_templates: Embedded<{ name: string }>; profiles: Embedded<{ full_name: string | null }>; bookings: Embedded<{ count: number }> }
  const instances: WidgetInstance[] = ((rows ?? []) as Row[]).map((r) => ({
    id: r.id,
    starts_at: r.starts_at,
    capacity: r.capacity ?? 0,
    booked: one(r.bookings)?.count ?? 0,
    className: one(r.class_templates)?.name ?? 'Class',
    coachName: one(r.profiles)?.full_name ?? '',
  }))
  const days = groupByDay(instances, timezone)

  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: 20, background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {box.logo_url && <img src={box.logo_url as string} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>{box.name}</div>
            <div style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Class schedule</div>
          </div>
          <Link href={`/${gymSlug}`} style={{ padding: '8px 14px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>Book / Log in</Link>
        </div>

        {days.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No classes scheduled in the next 7 days.</p>
        ) : days.map((day) => (
          <div key={day.key} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{day.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {day.items.map((i) => {
                const full = spotsRemaining(i.capacity, i.booked) === 0
                return (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', width: 52 }}>{timeFmt.format(new Date(i.starts_at))}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{i.className}</div>
                      {i.coachName && <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{i.coachName}</div>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: full ? 'var(--c-ink-muted)' : 'var(--circle-lime-ink)' }}>{spotsLabel(i.capacity, i.booked)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
