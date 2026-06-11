import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { requireManagerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { buildLeadFunnel, type LeadFunnelLead } from '@/lib/reports/lead-funnel'

const RANGES = [30, 60, 90]

export default async function LeadFunnelReportPage(ctx: { searchParams: Promise<{ days?: string }> }) {
  const { supabase, profile, boxName } = await requireManagerPage()
  const sp = await ctx.searchParams
  const parsed = Number(sp.days)
  const days = RANGES.includes(parsed) ? parsed : 30
  const rangeStartIso = new Date(Date.now() - days * 86400000).toISOString()

  const { data: leadRows } = await supabase
    .from('leads')
    .select('source, status, created_at')
    .eq('box_id', profile.box_id)

  const { rows, totals } = buildLeadFunnel((leadRows ?? []) as LeadFunnelLead[], rangeStartIso)

  const cards = [
    { label: 'Total leads', value: String(totals.total) },
    { label: 'Engaged', value: String(totals.engaged) },
    { label: 'Converted', value: String(totals.converted) },
    { label: 'Conversion %', value: `${totals.conversionPct}%` },
  ]

  const cell = { padding: '10px 12px', fontSize: 13.5, color: 'var(--c-ink)', textAlign: 'right' as const }
  const head = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="reports" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Lead funnel</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>How leads move from first contact to membership, split by acquisition source.</p>

            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {RANGES.map((d) => (
                <Link
                  key={d}
                  href={`/dashboard/reports/lead-funnel?days=${d}`}
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

            {rows.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No leads in this range.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
                  {cards.map((c) => (
                    <div key={c.label} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                      <div className="mono" style={{ fontSize: 26, color: 'var(--c-ink)', marginTop: 4, letterSpacing: '-0.02em', fontWeight: 700 }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <DownloadCsvButton
                    filename="lead-funnel.csv"
                    headers={['Source', 'Total leads', 'Engaged', 'Converted', 'Conversion %']}
                    rows={rows.map((r) => [r.label, r.total, r.engaged, r.converted, r.conversionPct])}
                  />
                </div>

                <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <th style={{ ...head, textAlign: 'left' }}>Source</th>
                        <th style={head}>Total</th>
                        <th style={head}>Engaged</th>
                        <th style={head}>Converted</th>
                        <th style={head}>Conv %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.source} style={{ borderBottom: '1px solid var(--c-border)' }}>
                          <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{r.label}</td>
                          <td style={cell}>{r.total}</td>
                          <td style={cell}>{r.engaged}</td>
                          <td style={cell}>{r.converted}</td>
                          <td style={{ ...cell, color: r.conversionPct >= 50 ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{r.conversionPct}%</td>
                        </tr>
                      ))}
                      <tr style={{ background: 'var(--c-bg)' }}>
                        <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Total</td>
                        <td style={{ ...cell, fontWeight: 700 }}>{totals.total}</td>
                        <td style={{ ...cell, fontWeight: 700 }}>{totals.engaged}</td>
                        <td style={{ ...cell, fontWeight: 700 }}>{totals.converted}</td>
                        <td style={{ ...cell, fontWeight: 700 }}>{totals.conversionPct}%</td>
                      </tr>
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
