import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  TIMEZONE_OFFSETS,
  todayInTimezone,
  formatTimezoneOffset,
  dayBoundaries,
  todayWindow,
  minuteOfDay,
} from './timezone'

describe('todayInTimezone', () => {
  afterEach(() => vi.useRealTimers())

  it('shifts the date by the GCC offset', () => {
    // 2026-06-11T21:30Z → Dubai (+4) is already 2026-06-12
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T21:30:00Z'))
    expect(todayInTimezone('Asia/Dubai')).toBe('2026-06-12')
    expect(todayInTimezone('Asia/Riyadh')).toBe('2026-06-12')
  })

  it('stays on the UTC date before the offset boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T19:30:00Z'))
    expect(todayInTimezone('Asia/Riyadh')).toBe('2026-06-11') // +3 → 22:30 same day
  })

  it('falls back to +4 for unknown timezones', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T20:30:00Z'))
    expect(todayInTimezone('Europe/Berlin')).toBe('2026-06-12') // fallback +4
  })

  it('covers all six GCC zones', () => {
    expect(Object.keys(TIMEZONE_OFFSETS).sort()).toEqual([
      'Asia/Bahrain', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Muscat', 'Asia/Qatar', 'Asia/Riyadh',
    ])
  })
})

describe('formatTimezoneOffset', () => {
  it('formats positive offsets with zero-padding', () => {
    expect(formatTimezoneOffset(4)).toBe('+04:00')
    expect(formatTimezoneOffset(3)).toBe('+03:00')
  })
  it('formats zero and negative offsets', () => {
    expect(formatTimezoneOffset(0)).toBe('+00:00')
    expect(formatTimezoneOffset(-5)).toBe('-05:00')
    expect(formatTimezoneOffset(-11)).toBe('-11:00')
  })
})

describe('dayBoundaries', () => {
  it('returns a closed window with the gym offset', () => {
    expect(dayBoundaries('2026-06-19', 'Asia/Dubai')).toEqual({
      start: '2026-06-19T00:00:00+04:00',
      end: '2026-06-19T23:59:59+04:00',
    })
    expect(dayBoundaries('2026-06-19', 'Asia/Riyadh')).toEqual({
      start: '2026-06-19T00:00:00+03:00',
      end: '2026-06-19T23:59:59+03:00',
    })
  })
  it('falls back to +04:00 for unknown timezones', () => {
    expect(dayBoundaries('2026-06-19', 'Europe/Berlin')).toEqual({
      start: '2026-06-19T00:00:00+04:00',
      end: '2026-06-19T23:59:59+04:00',
    })
  })
})

describe('todayWindow', () => {
  afterEach(() => vi.useRealTimers())
  it('wraps the offset-shifted "today" in a closed window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T21:30:00Z')) // Dubai +4 → already 2026-06-12
    expect(todayWindow('Asia/Dubai')).toEqual({
      start: '2026-06-12T00:00:00+04:00',
      end: '2026-06-12T23:59:59+04:00',
    })
  })
})

describe('minuteOfDay', () => {
  it('returns minutes-since-midnight in the gym timezone', () => {
    // 06:30Z → Dubai 10:30 → 630
    expect(minuteOfDay('2026-06-19T06:30:00Z', 'Asia/Dubai')).toBe(630)
    // 06:30Z → Riyadh 09:30 → 570
    expect(minuteOfDay('2026-06-19T06:30:00Z', 'Asia/Riyadh')).toBe(570)
  })
  it('normalizes midnight (handles the "24:00" ICU edge) to 0', () => {
    // 20:00Z → Dubai 00:00 next day → 0 whether ICU emits "00:00" or "24:00"
    expect(minuteOfDay('2026-06-19T20:00:00Z', 'Asia/Dubai')).toBe(0)
  })
})
