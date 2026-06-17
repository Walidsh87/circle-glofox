export type PayRateRow = {
  coach_id: string
  base_type: string | null      // 'per_class' | 'monthly'
  base_rate_aed: number | null
  pt_rate_aed: number | null
}
export type PayrollInstance = {
  starts_at: string
  coach_id: string | null
  template_id?: string | null
  template_coach_id?: string | null
}
export type PtSessionRow = { coach_id: string; scheduled_at: string; status: string }
export type ClassRateRow = { coach_id: string; template_id: string; rate_aed: number }
export type AdjustmentRow = { coach_id: string; amount_aed: number }
export type PayrollRow = {
  coachId: string
  coachName: string
  baseType: string | null
  baseRate: number | null
  ptRate: number | null
  classesTaught: number
  ptCount: number
  adjustmentsAed: number
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

/** Validates a per-class-type override rate. */
export function validateClassRate(rateAed: number | null): string | null {
  if (rateAed === null || Number.isNaN(rateAed) || rateAed < 0) return 'Rate must be 0 or more.'
  return null
}

/** Validates a manual monthly adjustment line. */
export function validateAdjustment(amountAed: number, note: string, month: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 'Invalid month.'
  if (!Number.isFinite(amountAed) || amountAed === 0) return 'Amount must be non-zero.'
  if (!note.trim()) return 'A note is required.'
  if (note.trim().length > 200) return 'Note must be 200 characters or fewer.'
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
  classRates: ClassRateRow[] = [],
  adjustments: AdjustmentRow[] = [],
): { rows: PayrollRow[]; totals: { classesTaught: number; ptCount: number; payAed: number }; unassignedClasses: number } {
  const rateByCoach = new Map(rates.map((r) => [r.coach_id, r]))
  const overrideRate = new Map(classRates.map((cr) => [`${cr.coach_id}:${cr.template_id}`, cr.rate_aed]))
  const now = new Date(nowIso).getTime()

  const held = instances.filter((i) => new Date(i.starts_at).getTime() <= now && monthKeyOf(i.starts_at, timeZone) === monthKey)
  // Substitution-accurate payee: the instance's own coach, falling back to the template's.
  const taughtTemplatesByCoach = new Map<string, (string | null)[]>()
  let unassignedClasses = 0
  for (const i of held) {
    const payee = i.coach_id ?? i.template_coach_id ?? null
    if (!payee) { unassignedClasses += 1; continue }
    const list = taughtTemplatesByCoach.get(payee) ?? []
    list.push(i.template_id ?? null)
    taughtTemplatesByCoach.set(payee, list)
  }

  const ptByCoach = new Map<string, number>()
  for (const s of ptSessions) {
    if (s.status === 'cancelled') continue
    if (monthKeyOf(s.scheduled_at, timeZone) !== monthKey) continue
    ptByCoach.set(s.coach_id, (ptByCoach.get(s.coach_id) ?? 0) + 1)
  }

  const adjByCoach = new Map<string, number>()
  for (const a of adjustments) {
    adjByCoach.set(a.coach_id, Math.round(((adjByCoach.get(a.coach_id) ?? 0) + a.amount_aed) * 100) / 100)
  }

  const rows: PayrollRow[] = coaches.map((c) => {
    const r = rateByCoach.get(c.id)
    const taught = taughtTemplatesByCoach.get(c.id) ?? []
    const classesTaught = taught.length
    const ptCount = ptByCoach.get(c.id) ?? 0
    const ovFor = (tid: string | null) => (tid !== null ? overrideRate.get(`${c.id}:${tid}`) : undefined)

    let basePay = 0
    if (r?.base_type === 'per_class') {
      for (const tid of taught) basePay += ovFor(tid) ?? (r.base_rate_aed ?? 0)
    } else if (r?.base_type === 'monthly') {
      basePay = r.base_rate_aed ?? 0
      for (const tid of taught) {
        const ov = ovFor(tid)
        if (ov !== undefined) basePay += ov
      }
    } else {
      // No base set: overridden classes still pay (display stays '—' via hasRate).
      for (const tid of taught) {
        const ov = ovFor(tid)
        if (ov !== undefined) basePay += ov
      }
    }

    const ptPay = (r?.pt_rate_aed ?? 0) * ptCount
    const adjustmentsAed = adjByCoach.get(c.id) ?? 0
    return {
      coachId: c.id,
      coachName: c.full_name ?? 'Coach',
      baseType: r?.base_type ?? null,
      baseRate: r?.base_rate_aed ?? null,
      ptRate: r?.pt_rate_aed ?? null,
      classesTaught,
      ptCount,
      adjustmentsAed,
      payAed: Math.round((basePay + ptPay + adjustmentsAed) * 100) / 100,
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
