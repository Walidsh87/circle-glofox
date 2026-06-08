import { nextInLine, waitlistPosition } from '@/app/dashboard/schedule/_lib/waitlist'

const e = (id: string, at: string) => ({ athlete_id: id, created_at: at })

describe('nextInLine', () => {
  test('returns the earliest entry', () => {
    expect(nextInLine([e('b', '2026-06-02'), e('a', '2026-06-01'), e('c', '2026-06-03')])?.athlete_id).toBe('a')
  })
  test('empty → null', () => {
    expect(nextInLine([])).toBeNull()
  })
})

describe('waitlistPosition', () => {
  const list = [e('b', '2026-06-02'), e('a', '2026-06-01'), e('c', '2026-06-03')]
  test('1-based rank by created_at', () => {
    expect(waitlistPosition(list, 'a')).toBe(1)
    expect(waitlistPosition(list, 'b')).toBe(2)
    expect(waitlistPosition(list, 'c')).toBe(3)
  })
  test('absent → null', () => {
    expect(waitlistPosition(list, 'z')).toBeNull()
  })
})
