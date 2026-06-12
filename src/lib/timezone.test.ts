import { describe, it, expect, vi, afterEach } from 'vitest'
import { TIMEZONE_OFFSETS, todayInTimezone } from './timezone'

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
