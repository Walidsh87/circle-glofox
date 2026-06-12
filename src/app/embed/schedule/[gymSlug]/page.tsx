import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
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
    <div data-theme="light" className="flex min-h-screen justify-center bg-canvas p-5">
      <div className="w-full max-w-[560px]">
        <div className="mb-[18px] flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {box.logo_url && <img src={box.logo_url as string} alt="" width={40} height={40} className="rounded-lg object-cover" />}
          <div className="flex-1">
            <div className="font-display text-lg font-semibold text-ink">{box.name}</div>
            <div className="text-[13px] text-ink-3">Class schedule</div>
          </div>
          <Link href={`/${gymSlug}`} className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-contrast transition-colors hover:bg-accent-hover">
            Book / Log in
          </Link>
        </div>

        {days.length === 0 ? (
          <p className="text-sm text-ink-3">No classes scheduled in the next 7 days.</p>
        ) : days.map((day) => (
          <div key={day.key} className="mb-[18px]">
            <div className="mb-2 text-[12.5px] font-bold uppercase tracking-[0.04em] text-ink-3">{day.label}</div>
            <div className="flex flex-col gap-1.5">
              {day.items.map((i) => {
                const full = spotsRemaining(i.capacity, i.booked) === 0
                return (
                  <div key={i.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
                    <span className="w-[52px] font-mono text-[13px] font-semibold text-ink">{timeFmt.format(new Date(i.starts_at))}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ink">{i.className}</div>
                      {i.coachName && <div className="text-xs text-ink-3">{i.coachName}</div>}
                    </div>
                    <span className={cn('text-xs font-semibold', full ? 'text-ink-3' : 'text-accent-ink')}>{spotsLabel(i.capacity, i.booked)}</span>
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
