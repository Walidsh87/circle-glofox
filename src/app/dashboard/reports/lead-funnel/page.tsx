import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireManagerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { StatCard } from '@/components/ui/card'
import { Table, Th, Td } from '@/components/ui/table'
import { cn } from '@/lib/utils'
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

  return (
    <DashboardShell
      active="reports"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Lead funnel"
    >
      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-ink-2">
          How leads move from first contact to membership, split by acquisition source.
        </p>

        <div className="mb-4 flex gap-1.5">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/dashboard/reports/lead-funnel?days=${d}`}
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

        {rows.length === 0 ? (
          <p className="text-sm text-ink-2">No leads in this range.</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {cards.map((c) => (
                <StatCard key={c.label} label={c.label} value={c.value} />
              ))}
            </div>

            <div className="mb-2.5 flex justify-end">
              <DownloadCsvButton
                filename="lead-funnel.csv"
                headers={['Source', 'Total leads', 'Engaged', 'Converted', 'Conversion %']}
                rows={rows.map((r) => [r.label, r.total, r.engaged, r.converted, r.conversionPct])}
              />
            </div>

            <Table>
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Engaged</Th>
                  <Th className="text-right">Converted</Th>
                  <Th className="text-right">Conv %</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.source}>
                    <Td className="font-semibold">{r.label}</Td>
                    <Td className="text-right">{r.total}</Td>
                    <Td className="text-right">{r.engaged}</Td>
                    <Td className="text-right">{r.converted}</Td>
                    <Td className={r.conversionPct >= 50 ? 'text-right text-accent-ink' : 'text-right text-ink-3'}>
                      {r.conversionPct}%
                    </Td>
                  </tr>
                ))}
                <tr className="bg-canvas [&>td]:border-0">
                  <Td className="font-bold">Total</Td>
                  <Td className="text-right font-bold">{totals.total}</Td>
                  <Td className="text-right font-bold">{totals.engaged}</Td>
                  <Td className="text-right font-bold">{totals.converted}</Td>
                  <Td className="text-right font-bold">{totals.conversionPct}%</Td>
                </tr>
              </tbody>
            </Table>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
