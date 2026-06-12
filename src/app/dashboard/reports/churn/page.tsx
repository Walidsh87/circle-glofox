import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireManagerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { Table, Th, Td } from '@/components/ui/table'
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

  return (
    <DashboardShell
      active="reports"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Churn trend"
    >
      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-ink-2">
          Joins, churns, and churn rate per month for the last 12 months.
        </p>

        <div className="mb-2.5 flex items-end justify-end">
          <DownloadCsvButton
            filename="churn-trend.csv"
            headers={['Month', 'Active at start', 'Joined', 'Churned', 'Net', 'Churn rate']}
            rows={trend.map((t) => [t.monthKey, t.activeAtStart, t.joined, t.churned, t.net, t.churnRate === null ? '' : (t.churnRate * 100).toFixed(1) + '%'])}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th className="text-right">Active at start</Th>
              <Th className="text-right">Joined</Th>
              <Th className="text-right">Churned</Th>
              <Th className="text-right">Net</Th>
              <Th className="text-right">Churn rate</Th>
            </tr>
          </thead>
          <tbody>
            {trend.map((t) => (
              <tr key={t.monthKey} className="last:[&>td]:border-0">
                <Td className="font-semibold">
                  {monthLabel(t.monthKey)}
                  {t.partial && <span className="font-normal text-ink-3"> (so far)</span>}
                </Td>
                <Td className="text-right">{t.activeAtStart}</Td>
                <Td className={t.joined > 0 ? 'text-right text-ok' : 'text-right'}>{t.joined}</Td>
                <Td className={t.churned > 0 ? 'text-right text-danger' : 'text-right'}>{t.churned}</Td>
                <Td className="text-right font-semibold">{t.net > 0 ? `+${t.net}` : t.net}</Td>
                <Td className="mono text-right font-bold">{fmtRate(t.churnRate)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2.5 text-xs text-ink-3">
          A member churns the month their last membership ends with nothing after. Trials excluded.
        </p>
      </div>
    </DashboardShell>
  )
}
