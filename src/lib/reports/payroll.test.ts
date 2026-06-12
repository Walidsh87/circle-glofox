import { describe, test, expect } from 'vitest'
import { validatePayRate, validateClassRate, validateAdjustment, buildPayroll, type PayRateRow, type PayrollInstance, type PtSessionRow } from './payroll'

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

describe('payroll accuracy (#59): payee resolution', () => {
  const coaches = [{ id: 'c1', full_name: 'Sara' }, { id: 'c2', full_name: 'Omar' }]
  const rates = [{ coach_id: 'c1', base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: null },
                 { coach_id: 'c2', base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: null }]

  test('instance coach wins over the template coach (substitution)', () => {
    const out = buildPayroll(coaches, rates, [
      { starts_at: '2026-06-05T07:00:00Z', coach_id: 'c2', template_id: 't1', template_coach_id: 'c1' },
    ], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z')
    expect(out.rows.find((r) => r.coachId === 'c2')!.classesTaught).toBe(1)
    expect(out.rows.find((r) => r.coachId === 'c1')!.classesTaught).toBe(0)
  })

  test('falls back to the template coach when the instance has none', () => {
    const out = buildPayroll(coaches, rates, [
      { starts_at: '2026-06-05T07:00:00Z', coach_id: null, template_id: 't1', template_coach_id: 'c1' },
    ], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z')
    expect(out.rows.find((r) => r.coachId === 'c1')!.classesTaught).toBe(1)
    expect(out.unassignedClasses).toBe(0)
  })

  test('neither coach → unassigned', () => {
    const out = buildPayroll(coaches, rates, [
      { starts_at: '2026-06-05T07:00:00Z', coach_id: null, template_id: 't1', template_coach_id: null },
    ], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z')
    expect(out.unassignedClasses).toBe(1)
  })
})

describe('payroll accuracy (#59): class-type rate overrides', () => {
  const coaches = [{ id: 'c1', full_name: 'Sara' }]
  const inst59 = (tid: string) => ({ starts_at: '2026-06-05T07:00:00Z', coach_id: 'c1', template_id: tid, template_coach_id: null })

  test('per_class: override replaces the default for that template only', () => {
    const out = buildPayroll(coaches,
      [{ coach_id: 'c1', base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: null }],
      [inst59('yoga'), inst59('crossfit')], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z',
      [{ coach_id: 'c1', template_id: 'yoga', rate_aed: 150 }])
    expect(out.rows[0].payAed).toBe(250) // 150 (yoga override) + 100 (default)
  })

  test('monthly: overrides pay on top of salary; plain classes stay covered', () => {
    const out = buildPayroll(coaches,
      [{ coach_id: 'c1', base_type: 'monthly', base_rate_aed: 5000, pt_rate_aed: null }],
      [inst59('yoga'), inst59('crossfit')], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z',
      [{ coach_id: 'c1', template_id: 'yoga', rate_aed: 150 }])
    expect(out.rows[0].payAed).toBe(5150) // salary + yoga add-on; crossfit covered by salary
  })

  test('no overrides → identical to base behavior', () => {
    const out = buildPayroll(coaches,
      [{ coach_id: 'c1', base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: null }],
      [inst59('yoga'), inst59('crossfit')], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z')
    expect(out.rows[0].payAed).toBe(200)
  })
})

describe('payroll accuracy (#59): adjustments', () => {
  test('sums per coach, negatives included, lands in adjustmentsAed and payAed', () => {
    const out = buildPayroll(
      [{ id: 'c1', full_name: 'Sara' }],
      [{ coach_id: 'c1', base_type: 'monthly', base_rate_aed: 5000, pt_rate_aed: null }],
      [], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z',
      [], [{ coach_id: 'c1', amount_aed: 500 }, { coach_id: 'c1', amount_aed: -200 }])
    expect(out.rows[0].adjustmentsAed).toBe(300)
    expect(out.rows[0].payAed).toBe(5300)
  })
})

describe('payroll accuracy (#59): validators', () => {
  test('validateClassRate', () => {
    expect(validateClassRate(-1)).toBe('Rate must be 0 or more.')
    expect(validateClassRate(null)).toBe('Rate must be 0 or more.')
    expect(validateClassRate(120)).toBeNull()
  })

  test('validateAdjustment', () => {
    expect(validateAdjustment(0, 'x', '2026-06')).toBe('Amount must be non-zero.')
    expect(validateAdjustment(100, '  ', '2026-06')).toBe('A note is required.')
    expect(validateAdjustment(100, 'x'.repeat(201), '2026-06')).toBe('Note must be 200 characters or fewer.')
    expect(validateAdjustment(100, 'bonus', '2026-13')).toBe('Invalid month.')
    expect(validateAdjustment(-150, 'late penalty', '2026-06')).toBeNull()
  })
})
