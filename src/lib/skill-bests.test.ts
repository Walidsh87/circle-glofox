import { describe, it, expect } from 'vitest'
import {
  SKILL_BESTS,
  MEASURES,
  skillByKey,
  formatBestValue,
  parseTimeToSeconds,
  toStoredValue,
  validateBestInput,
  currentBests,
} from './skill-bests'

describe('catalog', () => {
  it('has unique keys', () => {
    const keys = SKILL_BESTS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('only uses Gymnastics/Engine categories with known measures', () => {
    for (const s of SKILL_BESTS) {
      expect(['Gymnastics', 'Engine']).toContain(s.category)
      expect(MEASURES[s.measure]).toBeDefined()
    }
  })
  it('splits ring and bar muscle-ups and has no weightlifting or generic engine keys', () => {
    const keys = new Set(SKILL_BESTS.map((s) => s.key))
    expect(keys.has('ring_muscle_up')).toBe(true)
    expect(keys.has('bar_muscle_up')).toBe(true)
    expect(keys.has('muscle_up')).toBe(false)
    expect(keys.has('snatch')).toBe(false)
    expect(keys.has('row')).toBe(false)
  })
  it('skillByKey resolves a key and misses unknowns', () => {
    expect(skillByKey('row_2k')?.measure).toBe('time')
    expect(skillByKey('weighted_pullup')?.measure).toBe('weight')
    expect(skillByKey('handstand_walk')?.measure).toBe('distance_m')
    expect(skillByKey('nope')).toBeUndefined()
  })
})

describe('formatBestValue', () => {
  it('reps as a bare count', () => {
    expect(formatBestValue('pullup', 12)).toBe('12')
  })
  it('weight grams as kg (decimal trimmed)', () => {
    expect(formatBestValue('weighted_pullup', 12500)).toBe('12.5 kg')
    expect(formatBestValue('weighted_dip', 20000)).toBe('20 kg')
  })
  it('distance as meters', () => {
    expect(formatBestValue('handstand_walk', 15)).toBe('15 m')
  })
  it('time seconds as m:ss', () => {
    expect(formatBestValue('row_2k', 465)).toBe('7:45')
    expect(formatBestValue('run_400', 59)).toBe('0:59')
    expect(formatBestValue('row_500', 90)).toBe('1:30')
  })
  it('time over an hour as h:mm:ss', () => {
    expect(formatBestValue('run_5k', 3661)).toBe('1:01:01')
  })
})

describe('parseTimeToSeconds', () => {
  it('parses mm:ss', () => {
    expect(parseTimeToSeconds('7:45')).toBe(465)
    expect(parseTimeToSeconds('07:05')).toBe(425)
  })
  it('parses bare seconds', () => {
    expect(parseTimeToSeconds('90')).toBe(90)
  })
  it('rejects garbage, negatives, and out-of-range seconds parts', () => {
    expect(parseTimeToSeconds('')).toBeNull()
    expect(parseTimeToSeconds('abc')).toBeNull()
    expect(parseTimeToSeconds('7:99')).toBeNull()
    expect(parseTimeToSeconds('-1:30')).toBeNull()
    expect(parseTimeToSeconds('1:2:3')).toBeNull()
    expect(parseTimeToSeconds('7:4.5')).toBeNull()
  })
})

describe('toStoredValue', () => {
  it('reps/distance pass through as integers', () => {
    expect(toStoredValue('pullup', '12')).toBe(12)
    expect(toStoredValue('handstand_walk', '15')).toBe(15)
  })
  it('weight kg converts to grams', () => {
    expect(toStoredValue('weighted_pullup', '12.5')).toBe(12500)
  })
  it('time mm:ss converts to seconds', () => {
    expect(toStoredValue('row_2k', '7:45')).toBe(465)
  })
  it('unknown key or unparseable value is null', () => {
    expect(toStoredValue('nope', '5')).toBeNull()
    expect(toStoredValue('pullup', 'abc')).toBeNull()
    expect(toStoredValue('pullup', '2.5')).toBeNull() // reps must be whole
    expect(toStoredValue('row_2k', 'x:y')).toBeNull()
  })
})

describe('validateBestInput', () => {
  it('accepts valid input for every measure type', () => {
    expect(validateBestInput('pullup', '25')).toBeNull()
    expect(validateBestInput('weighted_pullup', '32.5')).toBeNull()
    expect(validateBestInput('handstand_walk', '30')).toBeNull()
    expect(validateBestInput('row_2k', '7:45')).toBeNull()
  })
  it('rejects an unknown skill', () => {
    expect(validateBestInput('flying', '5')).toMatch(/skill/i)
  })
  it('rejects unparseable values', () => {
    expect(validateBestInput('pullup', 'abc')).toBeTruthy()
    expect(validateBestInput('row_2k', 'seven')).toBeTruthy()
  })
  it('rejects out-of-range reps (1..1000)', () => {
    expect(validateBestInput('pullup', '0')).toBeTruthy()
    expect(validateBestInput('pullup', '1001')).toBeTruthy()
    expect(validateBestInput('pullup', '1000')).toBeNull()
  })
  it('rejects out-of-range weight (max 300 kg)', () => {
    expect(validateBestInput('weighted_dip', '0')).toBeTruthy()
    expect(validateBestInput('weighted_dip', '301')).toBeTruthy()
    expect(validateBestInput('weighted_dip', '300')).toBeNull()
  })
  it('rejects out-of-range distance (1..1000 m)', () => {
    expect(validateBestInput('handstand_walk', '1001')).toBeTruthy()
    expect(validateBestInput('handstand_walk', '1000')).toBeNull()
  })
  it('rejects out-of-range time (1..7200 s)', () => {
    expect(validateBestInput('run_5k', '2:00:01')).toBeTruthy()
    expect(validateBestInput('run_5k', '2:00:00')).toBeNull()
  })
})

describe('currentBests', () => {
  it('takes MAX for higher-is-better measures', () => {
    const bests = currentBests([
      { skill_key: 'pullup', value: 10 },
      { skill_key: 'pullup', value: 14 },
      { skill_key: 'pullup', value: 12 },
      { skill_key: 'weighted_pullup', value: 10000 },
      { skill_key: 'weighted_pullup', value: 15000 },
    ])
    expect(bests['pullup']).toBe(14)
    expect(bests['weighted_pullup']).toBe(15000)
  })
  it('takes MIN for time', () => {
    const bests = currentBests([
      { skill_key: 'row_2k', value: 480 },
      { skill_key: 'row_2k', value: 465 },
      { skill_key: 'row_2k', value: 470 },
    ])
    expect(bests['row_2k']).toBe(465)
  })
  it('skips unknown keys and handles empty input', () => {
    expect(currentBests([{ skill_key: 'ghost', value: 5 }])).toEqual({})
    expect(currentBests([])).toEqual({})
  })
})
