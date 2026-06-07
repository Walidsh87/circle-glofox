import { monthGridDays, prevMonth, nextMonth, monthRange, formatMonth } from '@/app/dashboard/programming/_lib/calendar'

describe('calendar month logic', () => {
  test('prev/next month wrap years', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(nextMonth('2026-06')).toBe('2026-07')
  })

  test('monthRange returns first and last day of the month', () => {
    expect(monthRange('2026-06')).toEqual({ start: '2026-06-01', end: '2026-06-30' })
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  test('formatMonth is human readable', () => {
    expect(formatMonth('2026-06')).toBe('June 2026')
  })

  test('monthGridDays returns whole weeks, Monday-first, with the right in-month dates', () => {
    const cells = monthGridDays('2026-06') // June 2026: 1st is a Monday, 30 days
    expect(cells.length % 7).toBe(0)
    const inMonth = cells.filter((c) => c.inMonth)
    expect(inMonth[0].date).toBe('2026-06-01')
    expect(inMonth[inMonth.length - 1].date).toBe('2026-06-30')
    expect(inMonth).toHaveLength(30)
    expect(cells[0]).toEqual({ date: '2026-06-01', inMonth: true })
  })

  test('a month starting mid-week is left-padded to Monday', () => {
    // 2026-07-01 is a Wednesday → two leading pad cells (Mon, Tue)
    const cells = monthGridDays('2026-07')
    expect(cells[0].inMonth).toBe(false)
    expect(cells[1].inMonth).toBe(false)
    expect(cells[2]).toEqual({ date: '2026-07-01', inMonth: true })
  })
})
