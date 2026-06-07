import { lastAttendedByAthlete, relativeDay } from '@/app/dashboard/prep/_lib/roster'

describe('lastAttendedByAthlete', () => {
  const now = '2026-06-10T06:00:00Z'

  test('keeps the latest checked-in instance strictly before now, per athlete', () => {
    const map = lastAttendedByAthlete([
      { athlete_id: 'a', starts_at: '2026-06-01T06:00:00Z' },
      { athlete_id: 'a', starts_at: '2026-06-08T06:00:00Z' },
      { athlete_id: 'b', starts_at: '2026-06-05T06:00:00Z' },
    ], now)
    expect(map.get('a')).toBe('2026-06-08T06:00:00Z')
    expect(map.get('b')).toBe('2026-06-05T06:00:00Z')
  })

  test('ignores future-dated and null starts_at', () => {
    const map = lastAttendedByAthlete([
      { athlete_id: 'a', starts_at: '2026-06-12T06:00:00Z' }, // future
      { athlete_id: 'a', starts_at: null },
    ], now)
    expect(map.has('a')).toBe(false)
  })
})

describe('relativeDay', () => {
  const today = '2026-06-10'
  test('null → first time', () => {
    expect(relativeDay(null, today)).toBe('first time')
  })
  test('same day → Today', () => {
    expect(relativeDay('2026-06-10T05:00:00Z', today)).toBe('Today')
  })
  test('within the last 7 days → a weekday name', () => {
    expect(relativeDay('2026-06-08T06:00:00Z', today)).toMatch(/^[A-Z][a-z]{2}$/)
  })
  test('more than 7 days ago → "Nd ago"', () => {
    expect(relativeDay('2026-05-20T06:00:00Z', today)).toMatch(/^\d+d ago$/)
  })
})
