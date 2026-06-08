import {
  weekIndex, weeklyCounts, currentStreakWeeks, totalCheckins,
  currentMilestone, nextMilestone, crossedMilestone, reachedStreakLandmark,
} from '@/lib/consistency'

describe('weekIndex', () => {
  test('Monday starts a new week; Thu–Sun share a week', () => {
    expect(weekIndex('1970-01-01')).toBe(0) // Thu
    expect(weekIndex('1970-01-04')).toBe(0) // Sun, same week
    expect(weekIndex('1970-01-05')).toBe(1) // Mon, new week
  })
  test('a 7-day step is exactly one week', () => {
    expect(weekIndex('2026-06-15') - weekIndex('2026-06-08')).toBe(1)
  })
})

describe('weeklyCounts', () => {
  test('counts per week (duplicates accumulate)', () => {
    const c = weeklyCounts(['2026-06-01', '2026-06-01', '2026-06-08'])
    expect(c.size).toBe(2)
    expect(c.get(weekIndex('2026-06-01'))).toBe(2)
  })
})

describe('currentStreakWeeks', () => {
  const wk = (d: string, n: number) => Array(n).fill(d)
  test('clean streak with current week met', () => {
    const dates = [...wk('2026-06-15', 3), ...wk('2026-06-08', 3), ...wk('2026-06-01', 3), '2026-05-25']
    expect(currentStreakWeeks(dates, '2026-06-15')).toBe(3)
  })
  test('current week below target is grace (does not break)', () => {
    const dates = ['2026-06-15', ...wk('2026-06-08', 3), ...wk('2026-06-01', 3), '2026-05-25']
    expect(currentStreakWeeks(dates, '2026-06-15')).toBe(2)
  })
  test('a gap breaks the streak', () => {
    const dates = [...wk('2026-06-08', 3), ...wk('2026-05-25', 3)] // 06-01 week empty
    expect(currentStreakWeeks(dates, '2026-06-15')).toBe(1)
  })
  test('target boundary: exactly 3 counts, 2 does not', () => {
    expect(currentStreakWeeks(wk('2026-06-08', 3), '2026-06-15')).toBe(1)
    expect(currentStreakWeeks(wk('2026-06-08', 2), '2026-06-15')).toBe(0)
  })
})

describe('milestones & landmarks', () => {
  test('totalCheckins', () => {
    expect(totalCheckins(['a', 'b', 'c'])).toBe(3)
  })
  test('currentMilestone = highest reached', () => {
    expect(currentMilestone(24)).toBeNull()
    expect(currentMilestone(25)).toBe(25)
    expect(currentMilestone(130)).toBe(100)
    expect(currentMilestone(1200)).toBe(1000)
  })
  test('nextMilestone with remaining', () => {
    expect(nextMilestone(0)).toEqual({ threshold: 25, remaining: 25 })
    expect(nextMilestone(130)).toEqual({ threshold: 250, remaining: 120 })
    expect(nextMilestone(1000)).toBeNull()
  })
  test('crossedMilestone is exact-only', () => {
    expect(crossedMilestone(100)).toBe(100)
    expect(crossedMilestone(101)).toBeNull()
  })
  test('reachedStreakLandmark is exact-only', () => {
    expect(reachedStreakLandmark(8)).toBe(8)
    expect(reachedStreakLandmark(7)).toBeNull()
  })
})
