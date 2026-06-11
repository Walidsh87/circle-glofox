import { test, expect } from 'vitest'
import { validatePayRate, buildPayroll, type PayRateRow, type PayrollInstance, type PtSessionRow } from './payroll'

const TZ = 'Asia/Dubai'
const NOW = '2026-06-20T12:00:00Z'

function coach(id: string, name: string) { return { id, full_name: name } }
function rate(coachId: string, r: Partial<PayRateRow> = {}): PayRateRow {
  return { coach_id: coachId, base_type: null, base_rate_aed: null, pt_rate_aed: null, ...r }
}
function inst(coachId: string | null, startsAt: string): PayrollInstance {
  return { starts_at: startsAt, coach_id: coachId }
}
function pt(coachId: string, redeemedAt: string): PtSessionRow {
  return { coach_id: coachId, redeemed_at: redeemedAt }
}

test('validatePayRate accepts a clean per_class setup', () => {
  expect(validatePayRate('per_class', 100, 150)).toBeNull()
})

test('validatePayRate accepts all-null (clearing a rate)', () => {
  expect(validatePayRate(null, null, null)).toBeNull()
})

test('validatePayRate rejects base_type without base_rate', () => {
  expect(validatePayRate('monthly', null, null)).toBe('Set a base rate for the selected pay type.')
})

test('validatePayRate rejects base_rate without base_type', () => {
  expect(validatePayRate(null, 100, null)).toBe('Choose a pay type for the base rate.')
})

test('validatePayRate rejects negative rates', () => {
  expect(validatePayRate('per_class', -1, null)).toBe('Rates must be 0 or more.')
  expect(validatePayRate(null, null, -5)).toBe('Rates must be 0 or more.')
})

test('validatePayRate rejects an unknown base_type', () => {
  expect(validatePayRate('hourly', 100, null)).toBe('Invalid pay type.')
})

test('per_class base pays rate × taught classes', () => {
  const r = buildPayroll([coach('c1', 'Ahmed')], [rate('c1', { base_type: 'per_class', base_rate_aed: 100 })],
    [inst('c1', '2026-06-03T05:00:00Z'), inst('c1', '2026-06-10T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0]).toMatchObject({ coachName: 'Ahmed', classesTaught: 2, payAed: 200 })
})

test('monthly base ignores taught count for pay', () => {
  const r = buildPayroll([coach('c1', 'Sara')], [rate('c1', { base_type: 'monthly', base_rate_aed: 5000 })],
    [inst('c1', '2026-06-03T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0]).toMatchObject({ classesTaught: 1, payAed: 5000 })
})

test('PT add-on stacks on both base kinds', () => {
  const coaches = [coach('c1', 'Ahmed'), coach('c2', 'Sara')]
  const rates = [
    rate('c1', { base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: 150 }),
    rate('c2', { base_type: 'monthly', base_rate_aed: 5000, pt_rate_aed: 200 }),
  ]
  const r = buildPayroll(coaches, rates, [inst('c1', '2026-06-03T05:00:00Z')],
    [pt('c1', '2026-06-04T09:00:00Z'), pt('c2', '2026-06-05T09:00:00Z'), pt('c2', '2026-06-06T09:00:00Z')],
    '2026-06', TZ, NOW)
  expect(r.rows.find((x) => x.coachName === 'Ahmed')).toMatchObject({ ptCount: 1, payAed: 100 + 150 })
  expect(r.rows.find((x) => x.coachName === 'Sara')).toMatchObject({ ptCount: 2, payAed: 5000 + 400 })
})

test('PT-only coach pays rate × sessions; no-rate coach pays 0 with hasRate false', () => {
  const r = buildPayroll([coach('c1', 'A'), coach('c2', 'B')], [rate('c1', { pt_rate_aed: 150 })],
    [], [pt('c1', '2026-06-04T09:00:00Z')], '2026-06', TZ, NOW)
  expect(r.rows.find((x) => x.coachId === 'c1')).toMatchObject({ payAed: 150, hasRate: true })
  expect(r.rows.find((x) => x.coachId === 'c2')).toMatchObject({ payAed: 0, hasRate: false })
})

test('month boundary respects the box timezone', () => {
  // 2026-05-31T21:00:00Z is 2026-06-01 01:00 in Asia/Dubai (+04) → counts in June.
  const r = buildPayroll([coach('c1', 'A')], [rate('c1', { base_type: 'per_class', base_rate_aed: 10 })],
    [inst('c1', '2026-05-31T21:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0].classesTaught).toBe(1)
})

test('future instances in the month are excluded (pay-to-date)', () => {
  const r = buildPayroll([coach('c1', 'A')], [rate('c1', { base_type: 'per_class', base_rate_aed: 10 })],
    [inst('c1', '2026-06-25T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0].classesTaught).toBe(0)
})

test('unassigned classes are counted, not paid', () => {
  const r = buildPayroll([coach('c1', 'A')], [], [inst(null, '2026-06-03T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.unassignedClasses).toBe(1)
  expect(r.totals.payAed).toBe(0)
})

test('totals sum rows; rows sort by pay desc', () => {
  const coaches = [coach('c1', 'A'), coach('c2', 'B')]
  const rates = [rate('c1', { base_type: 'per_class', base_rate_aed: 10 }), rate('c2', { base_type: 'monthly', base_rate_aed: 900 })]
  const r = buildPayroll(coaches, rates, [inst('c1', '2026-06-03T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0].coachName).toBe('B')
  expect(r.totals).toMatchObject({ classesTaught: 1, ptCount: 0, payAed: 910 })
})
