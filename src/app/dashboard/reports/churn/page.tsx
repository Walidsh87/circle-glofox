import { Sidebar } from '@/components/sidebar'
import { requireManagerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { buildChurnTrend, type ChurnMembershipRow } from '@/lib/reports/churn'

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export default async function ChurnReportPage() {
  const { supabase, profile, boxName, box } = await requireManagerPage()

  const tz = box.timezone ?? 'Asia/Dubai'
  const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())

  const { data: rows } = await supabase
    .from('memberships')
    .select('athlete_id, start_date, end_date, is_trial')
    .eq('box_id', profile.box_id)

  const trend = buildChurnTrend((rows ?? []) as ChurnMembershipRow[], 12, todayDate)

  const fmtRate = (r: number | null) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`)
  const cell = { padding: '10px 12px', fontSize: 13.5, color: 'var(--c-ink)', textAlign: 'right' as const }
  const head = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="reports" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Churn trend</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Joins, churns, and churn rate per month for the last 12 months.</p>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', marginBottom: 10 }}>
              <DownloadCsvButton
                filename="churn-trend.csv"
                headers={['Month', 'Active at start', 'Joined', 'Churned', 'Net', 'Churn rate']}
                rows={trend.map((t) => [t.monthKey, t.activeAtStart, t.joined, t.churned, t.net, t.churnRate === null ? '' : (t.churnRate * 100).toFixed(1) + '%'])}
              />
            </div>
            <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <th style={{ ...head, textAlign: 'left' }}>Month</th>
                    <th style={head}>Active at start</th>
                    <th style={head}>Joined</th>
                    <th style={head}>Churned</th>
                    <th style={head}>Net</th>
                    <th style={head}>Churn rate</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((t) => (
                    <tr key={t.monthKey} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>
                        {monthLabel(t.monthKey)}{t.partial && <span style={{ fontWeight: 400, color: 'var(--c-ink-muted)' }}> (so far)</span>}
                      </td>
                      <td style={cell}>{t.activeAtStart}</td>
                      <td style={{ ...cell, color: t.joined > 0 ? 'var(--c-ok-ink)' : 'var(--c-ink)' }}>{t.joined}</td>
                      <td style={{ ...cell, color: t.churned > 0 ? 'var(--c-danger)' : 'var(--c-ink)' }}>{t.churned}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{t.net > 0 ? `+${t.net}` : t.net}</td>
                      <td style={{ ...cell, fontWeight: 700 }} className="mono">{fmtRate(t.churnRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginTop: 10 }}>
              A member churns the month their last membership ends with nothing after. Trials excluded.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
