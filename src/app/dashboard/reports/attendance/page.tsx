import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireManagerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { Card, StatCard } from '@/components/ui/card'
import { Table, Th, Td } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { buildAttendanceReport, type AttendanceBooking, type AttendanceInstance } from '@/lib/reports/attendance'

const RANGES = [30, 60, 90]

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function AttendanceReportPage(ctx: { searchParams: Promise<{ days?: string }> }) {
  const { supabase, profile, boxName, box } = await requireManagerPage()
  const sp = await ctx.searchParams
  const parsed = Number(sp.days)
  const days = RANGES.includes(parsed) ? parsed : 30
  const nowIso = new Date().toISOString()
  const rangeStartIso = new Date(Date.now() - days * 86400000).toISOString()

  const { data: instRows } = await supabase
    .from('class_instances')
    .select('id, starts_at, class_templates(name, capacity)')
    .eq('box_id', profile.box_id)
    .neq('status', 'cancelled')
    .gte('starts_at', rangeStartIso)
    .lte('starts_at', nowIso)

  type InstanceRow = { id: string; starts_at: string; class_templates: Embedded<{ name: string; capacity: number | null }> }
  const instances: AttendanceInstance[] = ((instRows ?? []) as InstanceRow[]).map((r) => ({
    id: r.id,
    starts_at: r.starts_at,
    templateName: one(r.class_templates)?.name ?? 'Class',
    capacity: one(r.class_templates)?.capacity ?? 0,
  }))

  let bookings: AttendanceBooking[] = []
  if (instances.length > 0) {
    const { data: bookingRows } = await supabase
      .from('bookings')
      .select('class_instance_id, checked_in')
      .in('class_instance_id', instances.map((i) => i.id))
    bookings = (bookingRows ?? []) as AttendanceBooking[]
  }

  const { summary, byTemplate, busiest } = buildAttendanceReport(instances, bookings, nowIso, box.timezone ?? 'Asia/Dubai')

  const cards = [
    { label: 'Total check-ins', value: String(summary.totalCheckIns) },
    { label: 'Avg per class', value: String(summary.avgAttendedPerClass) },
    { label: 'No-show rate', value: `${summary.noShowRate}%` },
  ]

  return (
    <DashboardShell
      active="reports"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Attendance & no-shows"
    >
      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-ink-2">
          Check-ins, fill rates and no-shows for classes held in the selected range.
        </p>

        <div className="mb-4 flex gap-1.5">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/dashboard/reports/attendance?days=${d}`}
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

        {summary.classesHeld === 0 ? (
          <p className="text-sm text-ink-2">No classes in this range.</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2.5">
              {cards.map((c) => (
                <StatCard key={c.label} label={c.label} value={c.value} />
              ))}
            </div>

            <div className="mb-2.5 flex justify-end">
              <DownloadCsvButton
                filename="attendance.csv"
                headers={['Class', 'Classes held', 'Avg attended', 'Fill %', 'No-show %']}
                rows={byTemplate.map((t) => [t.name, t.classesHeld, t.avgAttended, t.fillPct, t.noShowPct])}
              />
            </div>

            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th className="text-right">Held</Th>
                  <Th className="text-right">Avg attended</Th>
                  <Th className="text-right">Fill %</Th>
                  <Th className="text-right">No-show %</Th>
                </tr>
              </thead>
              <tbody>
                {byTemplate.map((t) => (
                  <tr key={t.name} className="last:[&>td]:border-0">
                    <Td className="font-semibold">{t.name}</Td>
                    <Td className="text-right">{t.classesHeld}</Td>
                    <Td className="text-right">{t.avgAttended}</Td>
                    <Td className={t.fillPct >= 80 ? 'text-right text-accent-ink' : 'text-right'}>{t.fillPct}%</Td>
                    <Td className="text-right text-ink-3">{t.noShowPct}%</Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="mb-2 mt-5 text-xs font-bold uppercase tracking-[0.04em] text-ink-3">
              Busiest classes
            </div>
            <Card className="overflow-hidden">
              {busiest.map((t, i) => (
                <div
                  key={t.name}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5',
                    i < busiest.length - 1 && 'border-b border-line'
                  )}
                >
                  <span className="w-[18px] font-mono text-xs font-bold text-ink-3">{i + 1}</span>
                  <span className="flex-1 text-[13.5px] font-semibold text-ink">{t.name}</span>
                  <span className="font-mono text-xs text-ink-3">
                    {t.avgAttended} avg &middot; {t.fillPct}% full
                  </span>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
