import { sortLeaderboard } from '@/app/tv/_lib/leaderboard'

const row = (id: string, v: number) => ({ athlete_id: id, score_value: v })

describe('sortLeaderboard', () => {
  test('time: ascending (faster first)', () => {
    const out = sortLeaderboard([row('a', 240), row('b', 210), row('c', 222)], 'time')
    expect(out.map((r) => r.athlete_id)).toEqual(['b', 'c', 'a'])
  })
  test('non-time: descending (more is better)', () => {
    expect(sortLeaderboard([row('a', 120), row('b', 150), row('c', 140)], 'amrap').map((r) => r.athlete_id)).toEqual(['b', 'c', 'a'])
    expect(sortLeaderboard([row('a', 95), row('b', 102)], 'load_kg').map((r) => r.athlete_id)).toEqual(['b', 'a'])
  })
  test('does not mutate the input and handles empty', () => {
    const input = [row('a', 1), row('b', 2)]
    sortLeaderboard(input, 'time')
    expect(input.map((r) => r.athlete_id)).toEqual(['a', 'b'])
    expect(sortLeaderboard([], 'time')).toEqual([])
  })
})
