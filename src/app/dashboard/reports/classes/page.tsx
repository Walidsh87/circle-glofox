import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { buildClassPerformance, type PerfBooking, type PerfInstance } from '@/lib/reports/class-performance'

const RANGES = [30, 60, 90]

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function ClassPerformanceReportPage(ctx: { searchParams: Promise<{ days?: string }> }) {
  const { supabase, profile, boxName } = await requireOwnerPage()
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

  const cell = { padding: '10px 12px', fontSize: 13.5, color: 'var(--c-ink)', textAlign: 'right' as const }
  const head = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }
  const sectionTitle = { fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 8 }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="reports" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Class &amp; coach performance</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Fill rate and no-show rate for every class template and coach, over classes already held.</p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {RANGES.map((d) => (
                <Link
                  key={d}
                  href={`/dashboard/reports/classes?days=${d}`}
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

            {byTemplate.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No classes in this range.</p>
            ) : (
              <>
                <div style={sectionTitle}>Coaches</div>
                <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)', marginBottom: 24 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <th style={{ ...head, textAlign: 'left' }}>Coach</th>
                        <th style={head}>Classes held</th>
                        <th style={head}>Check-ins</th>
                        <th style={head}>Avg fill %</th>
                        <th style={head}>No-show %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCoach.map((r) => (
                        <tr key={r.coachName} style={{ borderBottom: '1px solid var(--c-border)' }}>
                          <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{r.coachName}</td>
                          <td style={cell}>{r.classesHeld}</td>
                          <td style={cell}>{r.totalCheckIns}</td>
                          <td style={{ ...cell, color: r.avgFillPct >= 50 ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{r.avgFillPct}%</td>
                          <td style={cell}>{r.noShowPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ ...sectionTitle, marginBottom: 0 }}>Classes</div>
                  <DownloadCsvButton
                    filename="class-performance.csv"
                    headers={['Class', 'Coach', 'Classes held', 'Check-ins', 'Avg fill %', 'No-show %']}
                    rows={byTemplate.map((r) => [r.name, r.coachName, r.classesHeld, r.totalCheckIns, r.avgFillPct, r.noShowPct])}
                  />
                </div>
                <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <th style={{ ...head, textAlign: 'left' }}>Class</th>
                        <th style={{ ...head, textAlign: 'left' }}>Coach</th>
                        <th style={head}>Classes held</th>
                        <th style={head}>Check-ins</th>
                        <th style={head}>Avg fill %</th>
                        <th style={head}>No-show %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byTemplate.map((r, i) => (
                        <tr key={`${r.name}-${i}`} style={{ borderBottom: '1px solid var(--c-border)' }}>
                          <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{r.name}</td>
                          <td style={{ ...cell, textAlign: 'left' }}>{r.coachName}</td>
                          <td style={cell}>{r.classesHeld}</td>
                          <td style={cell}>{r.totalCheckIns}</td>
                          <td style={{ ...cell, color: r.avgFillPct >= 50 ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{r.avgFillPct}%</td>
                          <td style={cell}>{r.noShowPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
