import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { buildPayroll, type PayRateRow, type PayrollInstance, type PtSessionRow } from '@/lib/reports/payroll'
import { PayRateEditor } from './_components/pay-rate-editor'

const BASE_LABEL: Record<string, string> = { per_class: 'Per class', monthly: 'Monthly' }

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)))
}
function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default async function PayrollReportPage(ctx: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, profile, boxName, box } = await requireOwnerPage()
  const sp = await ctx.searchParams
  const nowIso = new Date().toISOString()
  const tz = box.timezone ?? 'Asia/Dubai'
  const currentKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') && (sp.month as string) <= currentKey ? (sp.month as string) : currentKey

  // Generous fetch window (month ± 2 days); the lib applies the exact timezone month filter.
  const [y, m] = monthKey.split('-').map(Number)
  const fetchStart = new Date(Date.UTC(y, m - 1, 1) - 2 * 86400000).toISOString()
  const fetchEnd = new Date(Date.UTC(y, m, 1) + 2 * 86400000).toISOString()

  const [{ data: coachRows }, { data: rateRows }, { data: instRows }, { data: ptRows }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'coach').order('full_name'),
    supabase.from('coach_pay_rates').select('coach_id, base_type, base_rate_aed, pt_rate_aed').eq('box_id', profile.box_id),
    supabase.from('class_instances').select('starts_at, class_templates(coach_id)').eq('box_id', profile.box_id).neq('status', 'cancelled').gte('starts_at', fetchStart).lte('starts_at', fetchEnd),
    supabase.from('pt_sessions').select('coach_id, redeemed_at').eq('box_id', profile.box_id).gte('redeemed_at', fetchStart).lte('redeemed_at', fetchEnd),
  ])

  type InstRow = { starts_at: string; class_templates: Embedded<{ coach_id: string | null }> }
  const instances: PayrollInstance[] = ((instRows ?? []) as InstRow[]).map((r) => ({
    starts_at: r.starts_at,
    coach_id: one(r.class_templates)?.coach_id ?? null,
  }))
  const rates = ((rateRows ?? []) as (PayRateRow & { base_rate_aed: number | string | null; pt_rate_aed: number | string | null })[]).map((r) => ({
    coach_id: r.coach_id,
    base_type: r.base_type,
    base_rate_aed: r.base_rate_aed === null ? null : Number(r.base_rate_aed),
    pt_rate_aed: r.pt_rate_aed === null ? null : Number(r.pt_rate_aed),
  }))

  const report = buildPayroll(
    (coachRows ?? []) as { id: string; full_name: string | null }[],
    rates,
    instances,
    (ptRows ?? []) as PtSessionRow[],
    monthKey, tz, nowIso,
  )

  const prevKey = shiftMonth(monthKey, -1)
  const nextKey = shiftMonth(monthKey, 1)
  const hasNext = nextKey <= currentKey

  const cell = { padding: '10px 12px', fontSize: 13.5, color: 'var(--c-ink)', textAlign: 'right' as const }
  const head = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="reports" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Payroll</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 760 }}>
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Per-coach pay for the month: base (per class or salary) plus attributed PT sessions. Mid-month shows pay-to-date.</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <Link href={`/dashboard/reports/payroll?month=${prevKey}`} aria-label="Previous month" style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink-muted)', fontSize: 13, textDecoration: 'none' }}>‹</Link>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-ink)', minWidth: 130, textAlign: 'center' }}>{monthLabel(monthKey)}</span>
              {hasNext ? (
                <Link href={`/dashboard/reports/payroll?month=${nextKey}`} aria-label="Next month" style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink-muted)', fontSize: 13, textDecoration: 'none' }}>›</Link>
              ) : (
                <span aria-hidden style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-border)', fontSize: 13 }}>›</span>
              )}
            </div>

            {report.rows.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No coaches yet — add one from the People page.</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <DownloadCsvButton
                    filename={`payroll-${monthKey}.csv`}
                    headers={['Coach', 'Base', 'Classes taught', 'PT rate (AED)', 'PT sessions', 'Pay (AED)']}
                    rows={report.rows.map((r) => [
                      r.coachName,
                      r.baseType ? `${BASE_LABEL[r.baseType]} ${r.baseRate ?? 0}` : '',
                      r.classesTaught,
                      r.ptRate ?? '',
                      r.ptCount,
                      r.payAed,
                    ])}
                  />
                </div>
                <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <th style={{ ...head, textAlign: 'left' }}>Coach</th>
                        <th style={{ ...head, textAlign: 'left' }}>Base</th>
                        <th style={head}>Classes</th>
                        <th style={head}>PT rate</th>
                        <th style={head}>PT sessions</th>
                        <th style={head}>Pay (AED)</th>
                        <th style={{ ...head, textAlign: 'left' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((r) => (
                        <tr key={r.coachId} style={{ borderBottom: '1px solid var(--c-border)' }}>
                          <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{r.coachName}</td>
                          <td style={{ ...cell, textAlign: 'left', color: r.baseType ? 'var(--c-ink)' : 'var(--c-ink-muted)' }}>
                            {r.baseType ? `${BASE_LABEL[r.baseType]} · ${r.baseRate ?? 0} AED` : '—'}
                          </td>
                          <td style={cell}>{r.classesTaught}</td>
                          <td style={{ ...cell, color: r.ptRate !== null ? 'var(--c-ink)' : 'var(--c-ink-muted)' }}>{r.ptRate !== null ? r.ptRate : '—'}</td>
                          <td style={cell}>{r.ptCount}</td>
                          <td style={{ ...cell, fontWeight: 700 }} className="mono">{r.hasRate ? r.payAed.toFixed(2) : '—'}</td>
                          <td style={{ ...cell, textAlign: 'left' }}>
                            <PayRateEditor coachId={r.coachId} baseType={r.baseType} baseRate={r.baseRate} ptRate={r.ptRate} />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Total</td>
                        <td style={cell}></td>
                        <td style={{ ...cell, fontWeight: 700 }}>{report.totals.classesTaught}</td>
                        <td style={cell}></td>
                        <td style={{ ...cell, fontWeight: 700 }}>{report.totals.ptCount}</td>
                        <td style={{ ...cell, fontWeight: 700 }} className="mono">{report.totals.payAed.toFixed(2)}</td>
                        <td style={cell}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {report.unassignedClasses > 0 && (
                  <p style={{ fontSize: 12.5, color: 'var(--c-warn-ink)', marginTop: 10 }}>
                    {report.unassignedClasses} held {report.unassignedClasses === 1 ? 'class has' : 'classes have'} no coach on the template — they pay nobody. Assign coaches under Classes.
                  </p>
                )}
                <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginTop: 10 }}>
                  PT sessions counted from 11 Jun 2026 (attribution start). Class substitutions are not tracked — classes pay the rostered coach.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
