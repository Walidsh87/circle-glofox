import { requireOwnerPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import { buildAttribution } from '@/lib/attribution'

export default async function AttributionPage() {
  const { supabase, profile, boxName } = await requireOwnerPage()

  const [{ data: leadRows }, { data: memberRows }, { data: membershipRows }] = await Promise.all([
    supabase.from('leads').select('source').eq('box_id', profile.box_id),
    supabase.from('profiles').select('id, source').eq('box_id', profile.box_id).eq('role', 'athlete'),
    supabase.from('memberships').select('athlete_id, payment_status, monthly_price_aed').eq('box_id', profile.box_id),
  ])

  const paidByAthlete = new Map<string, number>()
  for (const m of (membershipRows ?? []) as { athlete_id: string; payment_status: string; monthly_price_aed: number | null }[]) {
    if (m.payment_status !== 'paid') continue
    paidByAthlete.set(m.athlete_id, (paidByAthlete.get(m.athlete_id) ?? 0) + (m.monthly_price_aed ?? 0))
  }

  const { rows, totals } = buildAttribution({
    leads: (leadRows ?? []) as { source: string | null }[],
    members: ((memberRows ?? []) as { id: string; source: string | null }[]).map((m) => ({ athlete_id: m.id, source: m.source })),
    paidByAthlete,
  })

  const cell = { padding: '10px 12px', fontSize: 13.5, color: 'var(--c-ink)', textAlign: 'right' as const }
  const head = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="attribution" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Attribution</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Where your members come from — leads, conversions, and paying revenue by source.</p>
            {rows.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No leads or members with a source yet.</p>
            ) : (
              <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <th style={{ ...head, textAlign: 'left' }}>Source</th>
                      <th style={head}>Leads</th>
                      <th style={head}>Members</th>
                      <th style={head}>Conv %</th>
                      <th style={head}>Paying</th>
                      <th style={head}>MRR · AED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.source} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{r.label}</td>
                        <td style={cell}>{r.leads}</td>
                        <td style={cell}>{r.members}</td>
                        <td style={{ ...cell, color: r.conversionPct >= 50 ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{r.conversionPct}%</td>
                        <td style={cell}>{r.paying}</td>
                        <td style={cell}>{r.mrr > 0 ? r.mrr.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--c-bg)' }}>
                      <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Total</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.leads}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.members}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.conversionPct}%</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.paying}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.mrr > 0 ? totals.mrr.toLocaleString() : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
