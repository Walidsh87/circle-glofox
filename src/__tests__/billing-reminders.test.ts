import { getDueDate, getReminderStage } from '@/lib/billing-reminders'

describe('getReminderStage', () => {
  test('returns pre when due is 3 days from today', () => {
    expect(getReminderStage('2026-05-23', '2026-05-26')).toBe('pre')
  })

  test('returns due when due is today', () => {
    expect(getReminderStage('2026-05-26', '2026-05-26')).toBe('due')
  })

  test('returns overdue when due was 3 days ago', () => {
    expect(getReminderStage('2026-05-29', '2026-05-26')).toBe('overdue')
  })

  test('returns null when today is 2 days before due', () => {
    expect(getReminderStage('2026-05-24', '2026-05-26')).toBeNull()
  })

  test('returns null when today is 10 days past due', () => {
    expect(getReminderStage('2026-06-05', '2026-05-26')).toBeNull()
  })
})

describe('getDueDate', () => {
  test('returns last_paid_date + 1 month when last_paid_date is set', () => {
    expect(getDueDate({
      last_paid_date: '2026-04-26',
      start_date: '2026-01-01',
      end_date: null,
    })).toBe('2026-05-26')
  })

  test('falls back to start_date + 1 month when last_paid_date is null', () => {
    expect(getDueDate({
      last_paid_date: null,
      start_date: '2026-04-26',
      end_date: null,
    })).toBe('2026-05-26')
  })
})
