import { describe, it, expect } from 'vitest'
import { groupLogsByDate, validateSetEntries, isValidPerformedOn, kgToGrams, parseDuration, formatDuration, bestSet, dayBests, type SetLog, type SetEntry } from './program-log'

const log = (o: Partial<SetLog>): SetLog => ({ performed_on: '2026-06-20', set_number: 1, weight_grams: 100000, reps: 5, note: null, duration_seconds: null, distance_meters: null, calories: null, ...o })

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
  const e = (o: Partial<SetEntry>): SetEntry => ({ setNumber: 1, weightKg: 100, reps: 5, durationSeconds: null, distanceMeters: null, calories: null, ...o })
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

describe('validateSetEntries per metric', () => {
  const e = (o: Partial<SetEntry>): SetEntry => ({ setNumber: 1, weightKg: null, reps: null, durationSeconds: null, distanceMeters: null, calories: null, ...o })
  it('time: requires a duration on every set', () => {
    expect(validateSetEntries([e({})], 'time')).toMatch(/time/i)
    expect(validateSetEntries([e({ durationSeconds: 462 })], 'time')).toBeNull()
  })
  it('time: rejects zero, non-integer, and > 6h', () => {
    expect(validateSetEntries([e({ durationSeconds: 0 })], 'time')).toMatch(/time/i)
    expect(validateSetEntries([e({ durationSeconds: 1.5 })], 'time')).toMatch(/time/i)
    expect(validateSetEntries([e({ durationSeconds: 6 * 3600 + 1 })], 'time')).toMatch(/time/i)
  })
  it('distance: requires meters in range', () => {
    expect(validateSetEntries([e({})], 'distance')).toMatch(/distance/i)
    expect(validateSetEntries([e({ distanceMeters: 2000 })], 'distance')).toBeNull()
    expect(validateSetEntries([e({ distanceMeters: 100_001 })], 'distance')).toMatch(/distance/i)
  })
  it('calories: requires calories in range', () => {
    expect(validateSetEntries([e({})], 'calories')).toMatch(/calories/i)
    expect(validateSetEntries([e({ calories: 25 })], 'calories')).toBeNull()
    expect(validateSetEntries([e({ calories: 5001 })], 'calories')).toMatch(/calories/i)
  })
  it('load: cardio fields are ignored, weight/reps rules apply', () => {
    expect(validateSetEntries([e({ weightKg: 100, reps: 5 })], 'load')).toBeNull()
    expect(validateSetEntries([e({ weightKg: 5000 })], 'load')).toMatch(/weight/i)
  })
})

describe('parseDuration / formatDuration', () => {
  it('parses m:ss', () => expect(parseDuration('7:42')).toBe(462))
  it('parses h:mm:ss', () => expect(parseDuration('1:07:42')).toBe(4062))
  it('parses bare seconds', () => expect(parseDuration('95')).toBe(95))
  it('rejects garbage and empties', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('7:99')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('0')).toBeNull()
  })
  it('formats round-trip', () => {
    expect(formatDuration(462)).toBe('7:42')
    expect(formatDuration(4062)).toBe('1:07:42')
    expect(formatDuration(5)).toBe('0:05')
  })
})

describe('bestSet', () => {
  it('load: heaviest wins; ties break to higher reps then newer date', () => {
    const logs = [
      log({ performed_on: '2026-06-01', weight_grams: 100000, reps: 5 }),
      log({ performed_on: '2026-06-02', weight_grams: 110000, reps: 3 }),
      log({ performed_on: '2026-06-03', weight_grams: 110000, reps: 5 }),
    ]
    const b = bestSet(logs, 'load')!
    expect(b.performed_on).toBe('2026-06-03')
    expect(b.reps).toBe(5)
  })
  it('time: fastest wins', () => {
    const logs = [
      log({ performed_on: '2026-06-01', weight_grams: null, reps: null, duration_seconds: 480 }),
      log({ performed_on: '2026-06-02', weight_grams: null, reps: null, duration_seconds: 462 }),
    ]
    expect(bestSet(logs, 'time')!.duration_seconds).toBe(462)
  })
  it('null when no set carries the metric', () => {
    expect(bestSet([log({ weight_grams: null, reps: 10 })], 'load')).toBeNull()
    expect(bestSet([], 'load')).toBeNull()
  })
})

describe('dayBests', () => {
  it('load: chronological day maxes; first day is baseline, later heavier days flag PR', () => {
    const days = groupLogsByDate([
      log({ performed_on: '2026-06-01', set_number: 1, weight_grams: 100000 }),
      log({ performed_on: '2026-06-01', set_number: 2, weight_grams: 90000 }),
      log({ performed_on: '2026-06-08', set_number: 1, weight_grams: 95000 }),
      log({ performed_on: '2026-06-15', set_number: 1, weight_grams: 105000 }),
    ])
    const out = dayBests(days, 'load')
    expect(out.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15'])
    expect(out.map((d) => d.value)).toEqual([100000, 95000, 105000])
    expect(out.map((d) => d.isPr)).toEqual([false, false, true])
  })
  it('time: a FASTER later day is the PR', () => {
    const days = groupLogsByDate([
      log({ performed_on: '2026-06-01', weight_grams: null, duration_seconds: 480 }),
      log({ performed_on: '2026-06-08', weight_grams: null, duration_seconds: 462 }),
      log({ performed_on: '2026-06-15', weight_grams: null, duration_seconds: 470 }),
    ])
    expect(dayBests(days, 'time').map((d) => d.isPr)).toEqual([false, true, false])
  })
  it('skips days with no metric value', () => {
    const days = groupLogsByDate([
      log({ performed_on: '2026-06-01', weight_grams: null, reps: 10 }),
      log({ performed_on: '2026-06-08', weight_grams: 90000 }),
    ])
    expect(dayBests(days, 'load').map((d) => d.date)).toEqual(['2026-06-08'])
  })
})
