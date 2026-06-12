import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { Table, Th, Td } from '@/components/ui/table'
import { buildPayroll, type PayRateRow, type PayrollInstance, type PtSessionRow, type ClassRateRow, type AdjustmentRow } from '@/lib/reports/payroll'
import { PayRateEditor } from './_components/pay-rate-editor'
import { ClassRatesEditor } from './_components/class-rates-editor'
import { AdjustmentsSection } from './_components/adjustments-section'

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

  const [{ data: coachRows }, { data: rateRows }, { data: instRows }, { data: ptRows }, { data: classRateRows }, { data: adjRows }, { data: templateRows }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'coach').order('full_name'),
    supabase.from('coach_pay_rates').select('coach_id, base_type, base_rate_aed, pt_rate_aed').eq('box_id', profile.box_id),
    supabase.from('class_instances').select('starts_at, coach_id, template_id, class_templates(coach_id)').eq('box_id', profile.box_id).neq('status', 'cancelled').gte('starts_at', fetchStart).lte('starts_at', fetchEnd),
    supabase.from('pt_sessions').select('coach_id, redeemed_at').eq('box_id', profile.box_id).gte('redeemed_at', fetchStart).lte('redeemed_at', fetchEnd),
    supabase.from('coach_class_rates').select('id, coach_id, template_id, rate_aed').eq('box_id', profile.box_id),
    supabase.from('pay_adjustments').select('id, coach_id, amount_aed, note').eq('box_id', profile.box_id).eq('month', monthKey).order('created_at'),
    supabase.from('class_templates').select('id, name').eq('box_id', profile.box_id).order('name'),
  ])

  type InstRow = { starts_at: string; coach_id: string | null; template_id: string | null; class_templates: Embedded<{ coach_id: string | null }> }
  const instances: PayrollInstance[] = ((instRows ?? []) as InstRow[]).map((r) => ({
    starts_at: r.starts_at,
    coach_id: r.coach_id,
    template_id: r.template_id,
    template_coach_id: one(r.class_templates)?.coach_id ?? null,
  }))
  const rates = ((rateRows ?? []) as (PayRateRow & { base_rate_aed: number | string | null; pt_rate_aed: number | string | null })[]).map((r) => ({
    coach_id: r.coach_id,
    base_type: r.base_type,
    base_rate_aed: r.base_rate_aed === null ? null : Number(r.base_rate_aed),
    pt_rate_aed: r.pt_rate_aed === null ? null : Number(r.pt_rate_aed),
  }))

  const classRates: ClassRateRow[] = ((classRateRows ?? []) as { id: string; coach_id: string; template_id: string; rate_aed: number | string }[])
    .map((r) => ({ coach_id: r.coach_id, template_id: r.template_id, rate_aed: Number(r.rate_aed) }))
  const adjustments: AdjustmentRow[] = ((adjRows ?? []) as { id: string; coach_id: string; amount_aed: number | string; note: string }[])
    .map((r) => ({ coach_id: r.coach_id, amount_aed: Number(r.amount_aed) }))

  const report = buildPayroll(
    (coachRows ?? []) as { id: string; full_name: string | null }[],
    rates,
    instances,
    (ptRows ?? []) as PtSessionRow[],
    monthKey, tz, nowIso,
    classRates,
    adjustments,
  )

  const prevKey = shiftMonth(monthKey, -1)
  const nextKey = shiftMonth(monthKey, 1)
  const hasNext = nextKey <= currentKey

  const pagerClass =
    'rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

  return (
    <DashboardShell
      active="reports"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Payroll"
    >
      <div className="max-w-3xl">
        <p className="mb-4 text-sm text-ink-2">
          Per-coach pay for the month: base (per class or salary) plus attributed PT sessions. Mid-month shows pay-to-date.
        </p>

        <div className="mb-4 flex items-center gap-2.5">
          <Link href={`/dashboard/reports/payroll?month=${prevKey}`} aria-label="Previous month" className={pagerClass}>
            ‹
          </Link>
          <span className="min-w-[130px] text-center text-sm font-bold text-ink">{monthLabel(monthKey)}</span>
          {hasNext ? (
            <Link href={`/dashboard/reports/payroll?month=${nextKey}`} aria-label="Next month" className={pagerClass}>
              ›
            </Link>
          ) : (
            <span aria-hidden className="rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] text-ink-faint">
              ›
            </span>
          )}
        </div>

        {report.rows.length === 0 ? (
          <p className="text-sm text-ink-2">No coaches yet — add one from the People page.</p>
        ) : (
          <>
            <div className="mb-2.5 flex items-end justify-end">
              <DownloadCsvButton
                filename={`payroll-${monthKey}.csv`}
                headers={['Coach', 'Base', 'Classes taught', 'PT rate (AED)', 'PT sessions', 'Adjustments (AED)', 'Pay (AED)']}
                rows={report.rows.map((r) => [
                  r.coachName,
                  r.baseType ? `${BASE_LABEL[r.baseType]} ${r.baseRate ?? 0}` : '',
                  r.classesTaught,
                  r.ptRate ?? '',
                  r.ptCount,
                  r.adjustmentsAed,
                  r.payAed,
                ])}
              />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Coach</Th>
                  <Th>Base</Th>
                  <Th className="text-right">Classes</Th>
                  <Th className="text-right">PT rate</Th>
                  <Th className="text-right">PT sessions</Th>
                  <Th className="text-right">Adj.</Th>
                  <Th className="text-right">Pay (AED)</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.coachId}>
                    <Td className="font-semibold">{r.coachName}</Td>
                    <Td className={r.baseType ? undefined : 'text-ink-3'}>
                      {r.baseType ? `${BASE_LABEL[r.baseType]} · ${r.baseRate ?? 0} AED` : '—'}
                    </Td>
                    <Td className="text-right">{r.classesTaught}</Td>
                    <Td className={r.ptRate !== null ? 'text-right' : 'text-right text-ink-3'}>
                      {r.ptRate !== null ? r.ptRate : '—'}
                    </Td>
                    <Td className="text-right">{r.ptCount}</Td>
                    <Td className={r.adjustmentsAed !== 0 ? 'font-mono text-right' : 'text-right text-ink-3'}>
                      {r.adjustmentsAed !== 0 ? r.adjustmentsAed.toFixed(2) : '—'}
                    </Td>
                    <Td className="font-mono text-right font-bold">{r.hasRate ? r.payAed.toFixed(2) : '—'}</Td>
                    <Td>
                      <PayRateEditor coachId={r.coachId} baseType={r.baseType} baseRate={r.baseRate} ptRate={r.ptRate} />
                      <ClassRatesEditor
                        coachId={r.coachId}
                        templates={(templateRows ?? []) as { id: string; name: string }[]}
                        rates={((classRateRows ?? []) as { id: string; coach_id: string; template_id: string; rate_aed: number | string }[])
                          .filter((cr) => cr.coach_id === r.coachId)
                          .map((cr) => ({ id: cr.id, template_id: cr.template_id, rate_aed: Number(cr.rate_aed) }))}
                      />
                    </Td>
                  </tr>
                ))}
                <tr className="[&>td]:border-0">
                  <Td className="font-bold">Total</Td>
                  <Td></Td>
                  <Td className="text-right font-bold">{report.totals.classesTaught}</Td>
                  <Td></Td>
                  <Td className="text-right font-bold">{report.totals.ptCount}</Td>
                  <Td></Td>
                  <Td className="font-mono text-right font-bold">{report.totals.payAed.toFixed(2)}</Td>
                  <Td></Td>
                </tr>
              </tbody>
            </Table>

            <AdjustmentsSection
              month={monthKey}
              coaches={report.rows.map((r) => ({ id: r.coachId, name: r.coachName }))}
              items={((adjRows ?? []) as { id: string; coach_id: string; amount_aed: number | string; note: string }[])
                .map((a) => ({ id: a.id, coach_id: a.coach_id, amount_aed: Number(a.amount_aed), note: a.note }))}
            />

            {report.unassignedClasses > 0 && (
              <p className="mt-2.5 text-xs text-warn">
                {report.unassignedClasses} held {report.unassignedClasses === 1 ? 'class has' : 'classes have'} no coach on the instance or template — they pay nobody. Assign coaches under Classes.
              </p>
            )}
            <p className="mt-2.5 text-xs text-ink-3">
              PT sessions counted from 11 Jun 2026 (attribution start). Classes pay the coach on the instance — record substitutions with the coach picker on Class Prep.
            </p>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
