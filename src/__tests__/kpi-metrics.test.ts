import {
  monthEnds, monthStart, mrrAt, activeAt, packageRevInMonth, churnForMonth, avgTenureMonths, computeKpis,
  type MembershipRow, type PurchaseRow,
} from '@/app/dashboard/kpi/_lib/metrics'

const rows: MembershipRow[] = [
  { athlete_id: 'a', monthly_price_aed: 500, start_date: '2025-01-01', end_date: null },
  { athlete_id: 'b', monthly_price_aed: 400, start_date: '2025-06-01', end_date: '2026-01-15' },
]
const purchases: PurchaseRow[] = [
  { created_at: '2026-05-10T08:00:00Z', price_aed: 300 },
  { created_at: '2026-06-02T00:00:00Z', price_aed: 200 },
]

describe('monthEnds / monthStart', () => {
  test('last 12 complete month-ends, ascending, excludes current partial month', () => {
    const ends = monthEnds('2026-06-08', 12)
    expect(ends).toHaveLength(12)
    expect(ends[0]).toBe('2025-06-30')
    expect(ends[11]).toBe('2026-05-31')
  })
  test('monthStart is the 1st of the month', () => {
    expect(monthStart('2026-05-31')).toBe('2026-05-01')
  })
})

describe('mrrAt / activeAt', () => {
  test('counts only memberships active on the date', () => {
    expect(mrrAt(rows, '2025-12-01')).toBe(900)
    expect(mrrAt(rows, '2026-02-01')).toBe(500)
    expect(activeAt(rows, '2025-12-01')).toBe(2)
    expect(activeAt(rows, '2026-02-01')).toBe(1)
  })
})

describe('packageRevInMonth', () => {
  test('sums only purchases within the calendar month', () => {
    expect(packageRevInMonth(purchases, '2026-05-01', '2026-05-31')).toBe(300)
    expect(packageRevInMonth(purchases, '2026-06-01', '2026-06-30')).toBe(200)
  })
})

describe('churnForMonth', () => {
  test('ended-in-month / active-at-start', () => {
    // Jan 2026: active at start {a,b}=2; b ends 2026-01-15 and is gone at month end → 1/2
    expect(churnForMonth(rows, '2026-01-01', '2026-01-31')).toBeCloseTo(0.5, 5)
  })
  test('0 when no one active at month start', () => {
    expect(churnForMonth(rows, '2020-01-01', '2020-01-31')).toBe(0)
  })
})

describe('avgTenureMonths', () => {
  test('single ended membership → span in months', () => {
    const one: MembershipRow[] = [{ athlete_id: 'x', monthly_price_aed: 100, start_date: '2025-01-01', end_date: '2025-12-31' }]
    expect(avgTenureMonths(one, '2026-06-08')).toBeCloseTo(12.0, 1)
  })
  test('multi-row athlete counts once (min start → max end)', () => {
    const switched: MembershipRow[] = [
      { athlete_id: 'x', monthly_price_aed: 300, start_date: '2025-01-01', end_date: '2025-07-01' },
      { athlete_id: 'x', monthly_price_aed: 600, start_date: '2025-07-01', end_date: null },
    ]
    // one athlete: 2025-01-01 → today(2026-01-01) ≈ 12 months
    expect(avgTenureMonths(switched, '2026-01-01')).toBeCloseTo(12.0, 1)
  })
})

describe('computeKpis', () => {
  test('assembles snapshot + 12-point trend', () => {
    const k = computeKpis(rows, purchases, '2026-06-08')
    expect(k.trend).toHaveLength(12)
    expect(k.snapshot.activeMembers).toBe(1)          // only 'a' active today
    expect(k.snapshot.mrr).toBe(500)
    expect(k.snapshot.ltv).toBeCloseTo(k.snapshot.arm * k.snapshot.leg, 1)
    expect(typeof k.snapshot.churnPct).toBe('number')
  })
  test('empty input → all-zero snapshot + 12 zero points', () => {
    const k = computeKpis([], [], '2026-06-08')
    expect(k.trend).toHaveLength(12)
    expect(k.snapshot).toEqual({ activeMembers: 0, mrr: 0, arm: 0, leg: 0, ltv: 0, churnPct: 0 })
  })
})
