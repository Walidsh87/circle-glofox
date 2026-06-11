export type PayRateRow = {
  coach_id: string
  base_type: string | null      // 'per_class' | 'monthly'
  base_rate_aed: number | null
  pt_rate_aed: number | null
}
export type PayrollInstance = { starts_at: string; coach_id: string | null }
export type PtSessionRow = { coach_id: string; redeemed_at: string }
export type PayrollRow = {
  coachId: string
  coachName: string
  baseType: string | null
  baseRate: number | null
  ptRate: number | null
  classesTaught: number
  ptCount: number
  payAed: number
  hasRate: boolean
}

const BASE_TYPES = ['per_class', 'monthly']

/** Validates an owner-entered pay setup. Returns a human message or null. */
export function validatePayRate(baseType: string | null, baseRate: number | null, ptRate: number | null): string | null {
  if (baseType !== null && !BASE_TYPES.includes(baseType)) return 'Invalid pay type.'
  if ((baseRate !== null && baseRate < 0) || (ptRate !== null && ptRate < 0)) return 'Rates must be 0 or more.'
  if (baseType !== null && baseRate === null) return 'Set a base rate for the selected pay type.'
  if (baseType === null && baseRate !== null) return 'Choose a pay type for the base rate.'
  return null
}

/** 'YYYY-MM' of an ISO timestamp in the given timezone. */
function monthKeyOf(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}`
}

/** Monthly payroll: base (per_class × taught | monthly) + PT rate × attributed sessions.
 *  "Taught" = non-cancelled instances in the month that have already started (pay-to-date). */
export function buildPayroll(
  coaches: { id: string; full_name: string | null }[],
  rates: PayRateRow[],
  instances: PayrollInstance[],
  ptSessions: PtSessionRow[],
  monthKey: string,            // 'YYYY-MM'
  timeZone: string,
  nowIso: string,
): { rows: PayrollRow[]; totals: { classesTaught: number; ptCount: number; payAed: number }; unassignedClasses: number } {
  const rateByCoach = new Map(rates.map((r) => [r.coach_id, r]))
  const now = new Date(nowIso).getTime()

  const held = instances.filter((i) => new Date(i.starts_at).getTime() <= now && monthKeyOf(i.starts_at, timeZone) === monthKey)
  const taughtByCoach = new Map<string, number>()
  let unassignedClasses = 0
  for (const i of held) {
    if (!i.coach_id) { unassignedClasses += 1; continue }
    taughtByCoach.set(i.coach_id, (taughtByCoach.get(i.coach_id) ?? 0) + 1)
  }

  const ptByCoach = new Map<string, number>()
  for (const s of ptSessions) {
    if (monthKeyOf(s.redeemed_at, timeZone) !== monthKey) continue
    ptByCoach.set(s.coach_id, (ptByCoach.get(s.coach_id) ?? 0) + 1)
  }

  const rows: PayrollRow[] = coaches.map((c) => {
    const r = rateByCoach.get(c.id)
    const classesTaught = taughtByCoach.get(c.id) ?? 0
    const ptCount = ptByCoach.get(c.id) ?? 0
    const basePay = r?.base_type === 'per_class' ? (r.base_rate_aed ?? 0) * classesTaught
      : r?.base_type === 'monthly' ? (r.base_rate_aed ?? 0)
      : 0
    const ptPay = (r?.pt_rate_aed ?? 0) * ptCount
    return {
      coachId: c.id,
      coachName: c.full_name ?? 'Coach',
      baseType: r?.base_type ?? null,
      baseRate: r?.base_rate_aed ?? null,
      ptRate: r?.pt_rate_aed ?? null,
      classesTaught,
      ptCount,
      payAed: Math.round((basePay + ptPay) * 100) / 100,
      hasRate: !!r && (r.base_type !== null || r.pt_rate_aed !== null),
    }
  }).sort((a, b) => b.payAed - a.payAed || a.coachName.localeCompare(b.coachName))

  const totals = rows.reduce((t, x) => ({
    classesTaught: t.classesTaught + x.classesTaught,
    ptCount: t.ptCount + x.ptCount,
    payAed: Math.round((t.payAed + x.payAed) * 100) / 100,
  }), { classesTaught: 0, ptCount: 0, payAed: 0 })

  return { rows, totals, unassignedClasses }
}
