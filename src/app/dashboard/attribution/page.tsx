import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Table, Th, Td } from '@/components/ui/table'
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

  return (
    <DashboardShell
      active="attribution"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Attribution"
    >
      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-ink-2">
          Where your members come from — leads, conversions, and paying revenue by source.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-2">No leads or members with a source yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th className="text-right">Leads</Th>
                <Th className="text-right">Members</Th>
                <Th className="text-right">Conv %</Th>
                <Th className="text-right">Paying</Th>
                <Th className="text-right">MRR · AED</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source}>
                  <Td className="font-semibold">{r.label}</Td>
                  <Td className="text-right">{r.leads}</Td>
                  <Td className="text-right">{r.members}</Td>
                  <Td className={r.conversionPct >= 50 ? 'text-right text-accent-ink' : 'text-right text-ink-3'}>
                    {r.conversionPct}%
                  </Td>
                  <Td className="text-right">{r.paying}</Td>
                  <Td className="text-right">{r.mrr > 0 ? r.mrr.toLocaleString() : '—'}</Td>
                </tr>
              ))}
              <tr className="bg-canvas [&>td]:border-0">
                <Td className="font-bold">Total</Td>
                <Td className="text-right font-bold">{totals.leads}</Td>
                <Td className="text-right font-bold">{totals.members}</Td>
                <Td className="text-right font-bold">{totals.conversionPct}%</Td>
                <Td className="text-right font-bold">{totals.paying}</Td>
                <Td className="text-right font-bold">{totals.mrr > 0 ? totals.mrr.toLocaleString() : '—'}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </div>
    </DashboardShell>
  )
}
