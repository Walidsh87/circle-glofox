import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { buildAttendanceReport, type AttendanceBooking, type AttendanceInstance } from '@/lib/reports/attendance'

const RANGES = [30, 60, 90]

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function AttendanceReportPage(ctx: { searchParams: Promise<{ days?: string }> }) {
  const { supabase, profile, boxName, box } = await requireOwnerPage()
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

  const cell = { padding: '10px 12px', fontSize: 13.5, color: 'var(--c-ink)', textAlign: 'right' as const }
  const head = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="reports" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Attendance &amp; no-shows</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Check-ins, fill rates and no-shows for classes held in the selected range.</p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {RANGES.map((d) => (
                <Link
                  key={d}
                  href={`/dashboard/reports/attendance?days=${d}`}
                  style={{
                    padding: '5px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
                    border: days === d ? '1px solid var(--circle-lime-ink)' : '1px solid var(--c-border)',
                    background: days === d ? 'var(--circle-lime-soft)' : 'var(--c-surface)',
                    color: days === d ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)',
                  }}
                >
                  Last {d} days
                </Link>
              ))}
            </div>

            {summary.classesHeld === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No classes in this range.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
                  {cards.map((c) => (
                    <div key={c.label} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                      <div className="mono" style={{ fontSize: 26, color: 'var(--c-ink)', marginTop: 4, letterSpacing: '-0.02em', fontWeight: 700 }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <DownloadCsvButton
                    filename="attendance.csv"
                    headers={['Class', 'Classes held', 'Avg attended', 'Fill %', 'No-show %']}
                    rows={byTemplate.map((t) => [t.name, t.classesHeld, t.avgAttended, t.fillPct, t.noShowPct])}
                  />
                </div>

                <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <th style={{ ...head, textAlign: 'left' }}>Class</th>
                        <th style={head}>Held</th>
                        <th style={head}>Avg attended</th>
                        <th style={head}>Fill %</th>
                        <th style={head}>No-show %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byTemplate.map((t, i) => (
                        <tr key={t.name} style={{ borderBottom: i < byTemplate.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                          <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{t.name}</td>
                          <td style={cell}>{t.classesHeld}</td>
                          <td style={cell}>{t.avgAttended}</td>
                          <td style={{ ...cell, color: t.fillPct >= 80 ? 'var(--circle-lime-ink)' : 'var(--c-ink)' }}>{t.fillPct}%</td>
                          <td style={{ ...cell, color: 'var(--c-ink-muted)' }}>{t.noShowPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '22px 0 8px' }}>Busiest classes</div>
                <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
                  {busiest.map((t, i) => (
                    <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < busiest.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-ink-muted)', width: 18 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{t.name}</span>
                      <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>{t.avgAttended} avg &middot; {t.fillPct}% full</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
