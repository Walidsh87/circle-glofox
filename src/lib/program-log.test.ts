import { describe, it, expect } from 'vitest'
import { groupLogsByDate, validateSetEntries, isValidPerformedOn, kgToGrams, type SetLog, type SetEntry } from './program-log'

const log = (o: Partial<SetLog>): SetLog => ({ performed_on: '2026-06-20', set_number: 1, weight_grams: 100000, reps: 5, note: null, ...o })

describe('groupLogsByDate', () => {
  it('groups by date, newest first, sets ordered', () => {
    const out = groupLogsByDate([
      log({ performed_on: '2026-06-18', set_number: 2 }),
      log({ performed_on: '2026-06-20', set_number: 2 }),
      log({ performed_on: '2026-06-20', set_number: 1 }),
      log({ performed_on: '2026-06-18', set_number: 1 }),
    ])
    expect(out.map((d) => d.date)).toEqual(['2026-06-20', '2026-06-18'])
    expect(out[0].sets.map((s) => s.set_number)).toEqual([1, 2])
  })
  it('returns empty for no logs', () => {
    expect(groupLogsByDate([])).toEqual([])
  })
})

describe('isValidPerformedOn', () => {
  it('accepts an ISO date', () => expect(isValidPerformedOn('2026-06-20')).toBe(true))
  it('rejects garbage', () => expect(isValidPerformedOn('not-a-date')).toBe(false))
  it('rejects an impossible date', () => expect(isValidPerformedOn('2026-13-40')).toBe(false))
})

describe('validateSetEntries', () => {
  const e = (o: Partial<SetEntry>): SetEntry => ({ setNumber: 1, weightKg: 100, reps: 5, ...o })
  it('accepts valid entries', () => {
    expect(validateSetEntries([e({ setNumber: 1 }), e({ setNumber: 2 })])).toBeNull()
  })
  it('rejects an empty list', () => {
    expect(validateSetEntries([])).toMatch(/at least one/i)
  })
  it('rejects a duplicate set number', () => {
    expect(validateSetEntries([e({ setNumber: 1 }), e({ setNumber: 1 })])).toMatch(/duplicate/i)
  })
  it('rejects an out-of-range weight', () => {
    expect(validateSetEntries([e({ weightKg: 5000 })])).toMatch(/weight/i)
  })
  it('rejects negative reps', () => {
    expect(validateSetEntries([e({ reps: -1 })])).toMatch(/reps/i)
  })
  it('allows null weight + null reps (bodyweight / skipped)', () => {
    expect(validateSetEntries([e({ weightKg: null, reps: null })])).toBeNull()
  })
})

describe('kgToGrams', () => {
  it('converts kg to integer grams', () => {
    expect(kgToGrams(102.5)).toBe(102500)
  })
})
