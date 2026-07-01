import { nextInLine } from '@/app/dashboard/schedule/_lib/waitlist'

const e = (id: string, at: string) => ({ athlete_id: id, created_at: at })

describe('nextInLine', () => {
  test('returns the earliest entry', () => {
    expect(nextInLine([e('b', '2026-06-02'), e('a', '2026-06-01'), e('c', '2026-06-03')])?.athlete_id).toBe('a')
  })
  test('empty → null', () => {
    expect(nextInLine([])).toBeNull()
  })
})
