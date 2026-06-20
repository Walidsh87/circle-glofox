import { describe, it, expect } from 'vitest'
import { addDays, isIsoDateFormat } from './date-utils'

describe('addDays', () => {
  it('adds days across a month boundary (UTC)', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02')
  })
  it('subtracts with a negative offset', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('isIsoDateFormat', () => {
  it('accepts a YYYY-MM-DD string', () => {
    expect(isIsoDateFormat('2026-06-20')).toBe(true)
  })
  it('rejects other shapes', () => {
    expect(isIsoDateFormat('2026-6-20')).toBe(false)
    expect(isIsoDateFormat('20-06-2026')).toBe(false)
    expect(isIsoDateFormat('')).toBe(false)
    expect(isIsoDateFormat('2026-06-20T00:00:00')).toBe(false)
  })
})
