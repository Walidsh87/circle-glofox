import { test, expect } from 'vitest'
import { buildChurnTrend, type ChurnMembershipRow } from './churn'

const TODAY = '2026-06-11'

function row(athlete: string, start: string, end: string | null, trial = false): ChurnMembershipRow {
  return { athlete_id: athlete, start_date: start, end_date: end, is_trial: trial }
}

function month(res: ReturnType<typeof buildChurnTrend>, key: string) {
  const m = res.find((r) => r.monthKey === key)
  if (!m) throw new Error(`month ${key} missing`)
  return m
}

test('counts a join and a churn in the right months', () => {
  const res = buildChurnTrend([row('a', '2026-01-10', '2026-03-31')], 12, TODAY)
  expect(month(res, '2026-01').joined).toBe(1)
  expect(month(res, '2026-03').churned).toBe(1)
  expect(month(res, '2026-04').churned).toBe(0)
  expect(month(res, '2026-02').activeAtStart).toBe(1) // covered on Feb 1
})

test('a back-to-back renewal is not churn', () => {
  const res = buildChurnTrend([row('a', '2026-01-01', '2026-03-31'), row('a', '2026-04-01', null)], 12, TODAY)
  expect(month(res, '2026-03').churned).toBe(0)
  expect(month(res, '2026-06').activeAtStart).toBe(1)
})

test('an open-ended membership never churns', () => {
  const res = buildChurnTrend([row('a', '2026-01-01', null)], 12, TODAY)
  expect(res.every((m) => m.churned === 0)).toBe(true)
})

test('a gap then a rejoin counts one churn and no second join', () => {
  const res = buildChurnTrend([row('a', '2026-01-01', '2026-02-28'), row('a', '2026-05-01', null)], 12, TODAY)
  expect(month(res, '2026-02').churned).toBe(1)
  expect(month(res, '2026-01').joined).toBe(1)
  expect(month(res, '2026-05').joined).toBe(0) // first-ever start was January
  expect(month(res, '2026-06').activeAtStart).toBe(1)
})

test('trial rows are ignored everywhere', () => {
  const res = buildChurnTrend([row('a', '2026-01-01', '2026-01-14', true)], 12, TODAY)
  expect(res.every((m) => m.joined === 0 && m.churned === 0 && m.activeAtStart === 0)).toBe(true)
})

test('activeAtStart counts coverage on the 1st only', () => {
  const res = buildChurnTrend([row('a', '2026-03-15', null)], 12, TODAY)
  expect(month(res, '2026-03').activeAtStart).toBe(0) // joined mid-March
  expect(month(res, '2026-04').activeAtStart).toBe(1)
})

test('returns monthsBack months oldest-first and flags the current month partial', () => {
  const res = buildChurnTrend([], 12, TODAY)
  expect(res).toHaveLength(12)
  expect(res[0].monthKey).toBe('2025-07')
  expect(res[11].monthKey).toBe('2026-06')
  expect(res[11].partial).toBe(true)
  expect(res[10].partial).toBe(false)
})

test('a zero-active month has a null churn rate', () => {
  const res = buildChurnTrend([], 3, TODAY)
  expect(res.every((m) => m.churnRate === null)).toBe(true)
})
