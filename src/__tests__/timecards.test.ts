import { describe, test, expect } from 'vitest'
import { sumHoursByStaff, fmtHours, inMonth } from '@/lib/timecards'

const TZ = 'Asia/Dubai'

describe('sumHoursByStaff', () => {
  test('sums completed cards, rounded to 0.1h', () => {
    const map = sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-06-05T03:00:00Z', clock_out: '2026-06-05T05:30:00Z' }, // 2.5h
      { staff_id: 's1', clock_in: '2026-06-06T03:00:00Z', clock_out: '2026-06-06T04:10:00Z' }, // ~1.2h
    ], '2026-06', TZ)
    expect(map.get('s1')).toEqual({ hours: 3.7, cards: 2, open: 0 })
  })

  test('open cards add 0 hours and are flagged', () => {
    const map = sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-06-05T03:00:00Z', clock_out: null },
    ], '2026-06', TZ)
    expect(map.get('s1')).toEqual({ hours: 0, cards: 1, open: 1 })
  })

  test('month boundary respects the gym timezone', () => {
    // 2026-05-31T21:30Z is 01:30 on 1 June in Dubai (+04) → counts in June.
    const map = sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-05-31T21:30:00Z', clock_out: '2026-05-31T23:30:00Z' },
    ], '2026-06', TZ)
    expect(map.get('s1')?.hours).toBe(2)
    expect(sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-05-31T21:30:00Z', clock_out: '2026-05-31T23:30:00Z' },
    ], '2026-05', TZ).get('s1')).toBeUndefined()
  })

  test('keeps staff separate', () => {
    const map = sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-06-05T03:00:00Z', clock_out: '2026-06-05T04:00:00Z' },
      { staff_id: 's2', clock_in: '2026-06-05T03:00:00Z', clock_out: '2026-06-05T06:00:00Z' },
    ], '2026-06', TZ)
    expect(map.get('s1')?.hours).toBe(1)
    expect(map.get('s2')?.hours).toBe(3)
  })
})

describe('helpers', () => {
  test('fmtHours and inMonth', () => {
    expect(fmtHours(12.5)).toBe('12.5h')
    expect(fmtHours(0)).toBe('—')
    expect(inMonth('2026-06-05T03:00:00Z', '2026-06', TZ)).toBe(true)
    expect(inMonth('2026-05-31T19:00:00Z', '2026-06', TZ)).toBe(false) // 23:00 on 31 May in Dubai
  })
})
