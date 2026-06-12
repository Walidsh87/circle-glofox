import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireManagerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { Table, Th, Td } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { buildClassPerformance, type PerfBooking, type PerfInstance } from '@/lib/reports/class-performance'

const RANGES = [30, 60, 90]

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function ClassPerformanceReportPage(ctx: { searchParams: Promise<{ days?: string }> }) {
  const { supabase, profile, boxName } = await requireManagerPage()
  const sp = await ctx.searchParams
  const parsed = Number(sp.days)
  const days = RANGES.includes(parsed) ? parsed : 30
  const nowIso = new Date().toISOString()
  const rangeStartIso = new Date(Date.now() - days * 86400000).toISOString()

  const { data: instRows } = await supabase
    .from('class_instances')
    .select('id, starts_at, template_id, class_templates(name, capacity, coach_id), bookings(checked_in)')
    .eq('box_id', profile.box_id)
    .neq('status', 'cancelled')
    .gte('starts_at', rangeStartIso)
    .lte('starts_at', nowIso)

  type Row = {
    id: string
    starts_at: string
    template_id: string
    class_templates: Embedded<{ name: string; capacity: number | null; coach_id: string | null }>
    bookings: Embedded<{ checked_in: boolean }>
  }
  const rows = (instRows ?? []) as Row[]

  const instances: PerfInstance[] = rows.map((r) => {
    const t = one(r.class_templates)
    return { id: r.id, starts_at: r.starts_at, template_id: r.template_id, template_name: t?.name ?? 'Class', capacity: t?.capacity ?? 0, coach_id: t?.coach_id ?? null }
  })
  const bookings: PerfBooking[] = rows.flatMap((r) => {
    const bs = Array.isArray(r.bookings) ? r.bookings : r.bookings ? [r.bookings] : []
    return bs.map((b) => ({ class_instance_id: r.id, checked_in: b.checked_in }))
  })

  const coachIds = [...new Set(instances.map((i) => i.coach_id).filter((id): id is string => id !== null))]
  const coachNameById = new Map<string, string>()
  if (coachIds.length > 0) {
    const { data: coachRows } = await supabase.from('profiles').select('id, full_name').in('id', coachIds)
    for (const c of (coachRows ?? []) as { id: string; full_name: string | null }[]) {
      if (c.full_name) coachNameById.set(c.id, c.full_name)
    }
  }

  const { byTemplate, byCoach } = buildClassPerformance(instances, bookings, coachNameById, nowIso)

  return (
    <DashboardShell
      active="reports"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Class & coach performance"
    >
      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-ink-2">
          Fill rate and no-show rate for every class template and coach, over classes already held.
        </p>

        <div className="mb-4 flex gap-1.5">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/dashboard/reports/classes?days=${d}`}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                days === d
                  ? 'border-accent-ink bg-accent-soft text-accent-ink'
                  : 'border-line bg-surface text-ink-3 hover:text-ink'
              )}
            >
              Last {d} days
            </Link>
          ))}
        </div>

        {byTemplate.length === 0 ? (
          <p className="text-sm text-ink-2">No classes in this range.</p>
        ) : (
          <>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.04em] text-ink-3">Coaches</div>
            <div className="mb-6">
              <Table>
                <thead>
                  <tr>
                    <Th>Coach</Th>
                    <Th className="text-right">Classes held</Th>
                    <Th className="text-right">Check-ins</Th>
                    <Th className="text-right">Avg fill %</Th>
                    <Th className="text-right">No-show %</Th>
                  </tr>
                </thead>
                <tbody>
                  {byCoach.map((r) => (
                    <tr key={r.coachName} className="last:[&>td]:border-0">
                      <Td className="font-semibold">{r.coachName}</Td>
                      <Td className="text-right">{r.classesHeld}</Td>
                      <Td className="text-right">{r.totalCheckIns}</Td>
                      <Td className={r.avgFillPct >= 50 ? 'text-right text-accent-ink' : 'text-right text-ink-3'}>{r.avgFillPct}%</Td>
                      <Td className="text-right">{r.noShowPct}%</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="mb-2.5 flex items-end justify-between">
              <div className="text-xs font-bold uppercase tracking-[0.04em] text-ink-3">Classes</div>
              <DownloadCsvButton
                filename="class-performance.csv"
                headers={['Class', 'Coach', 'Classes held', 'Check-ins', 'Avg fill %', 'No-show %']}
                rows={byTemplate.map((r) => [r.name, r.coachName, r.classesHeld, r.totalCheckIns, r.avgFillPct, r.noShowPct])}
              />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th>Coach</Th>
                  <Th className="text-right">Classes held</Th>
                  <Th className="text-right">Check-ins</Th>
                  <Th className="text-right">Avg fill %</Th>
                  <Th className="text-right">No-show %</Th>
                </tr>
              </thead>
              <tbody>
                {byTemplate.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="last:[&>td]:border-0">
                    <Td className="font-semibold">{r.name}</Td>
                    <Td>{r.coachName}</Td>
                    <Td className="text-right">{r.classesHeld}</Td>
                    <Td className="text-right">{r.totalCheckIns}</Td>
                    <Td className={r.avgFillPct >= 50 ? 'text-right text-accent-ink' : 'text-right text-ink-3'}>{r.avgFillPct}%</Td>
                    <Td className="text-right">{r.noShowPct}%</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
