import { describe, it, expect } from 'vitest'
import { nextAbove, buildAchievements, type AchievementRecord } from './achievements'

// ---------------------------------------------------------------------------
// nextAbove
// ---------------------------------------------------------------------------
describe('nextAbove', () => {
  it('returns the first value strictly above earnedMax', () => {
    expect(nextAbove([25, 50, 100], 50)).toBe(100)
  })

  it('returns the lowest value above earnedMax when earnedMax is 0', () => {
    expect(nextAbove([25, 50, 100], 0)).toBe(25)
  })

  it('returns null when all values have been earned', () => {
    expect(nextAbove([25, 50, 100], 100)).toBeNull()
  })

  it('returns null when earnedMax exceeds all values', () => {
    expect(nextAbove([25, 50, 100], 200)).toBeNull()
  })

  it('returns null on an empty values array', () => {
    expect(nextAbove([], 0)).toBeNull()
  })

  it('handles a partial earned set — returns correct next', () => {
    // earned 25 → next should be 50
    expect(nextAbove([25, 50, 100, 250, 500, 1000], 25)).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// buildAchievements — grouping & sorting
// ---------------------------------------------------------------------------
describe('buildAchievements — grouping', () => {
  it('groups milestone and streak rows into their respective buckets', () => {
    const rows: AchievementRecord[] = [
      { kind: 'milestone', threshold: 25, earned_at: '2026-01-10T10:00:00Z' },
      { kind: 'streak', threshold: 4, earned_at: '2026-02-01T10:00:00Z' },
      { kind: 'milestone', threshold: 50, earned_at: '2026-03-05T10:00:00Z' },
    ]
    const view = buildAchievements(rows, 'Asia/Dubai')
    expect(view.milestones).toHaveLength(2)
    expect(view.streaks).toHaveLength(1)
  })

  it('ignores rows with unknown kind', () => {
    const rows: AchievementRecord[] = [
      { kind: 'unknown_future_kind', threshold: 99, earned_at: '2026-01-01T00:00:00Z' },
      { kind: 'milestone', threshold: 25, earned_at: '2026-01-10T10:00:00Z' },
    ]
    const view = buildAchievements(rows, 'Asia/Dubai')
    expect(view.milestones).toHaveLength(1)
    expect(view.streaks).toHaveLength(0)
  })

  it('counts are correct', () => {
    const rows: AchievementRecord[] = [
      { kind: 'milestone', threshold: 25, earned_at: '2026-01-10T10:00:00Z' },
      { kind: 'milestone', threshold: 50, earned_at: '2026-02-10T10:00:00Z' },
      { kind: 'streak', threshold: 4, earned_at: '2026-03-01T10:00:00Z' },
    ]
    const { counts } = buildAchievements(rows, 'Asia/Dubai')
    expect(counts.milestones).toBe(2)
    expect(counts.streaks).toBe(1)
    expect(counts.total).toBe(3)
  })
})

describe('buildAchievements — sorting', () => {
  it('sorts badges ascending by threshold regardless of input order', () => {
    const rows: AchievementRecord[] = [
      { kind: 'milestone', threshold: 100, earned_at: '2026-03-01T10:00:00Z' },
      { kind: 'milestone', threshold: 25, earned_at: '2026-01-01T10:00:00Z' },
      { kind: 'milestone', threshold: 50, earned_at: '2026-02-01T10:00:00Z' },
    ]
    const view = buildAchievements(rows, 'Asia/Dubai')
    const thresholds = view.milestones.map((b) => b.threshold)
    expect(thresholds).toEqual([25, 50, 100])
  })
})

// ---------------------------------------------------------------------------
// buildAchievements — nextMilestone / nextStreak derivation
// ---------------------------------------------------------------------------
describe('buildAchievements — next derivation', () => {
  it('derives nextMilestone from partial earned set (earned 25, 50 → next 100)', () => {
    const rows: AchievementRecord[] = [
      { kind: 'milestone', threshold: 25, earned_at: '2026-01-01T10:00:00Z' },
      { kind: 'milestone', threshold: 50, earned_at: '2026-02-01T10:00:00Z' },
    ]
    const { nextMilestone } = buildAchievements(rows, 'Asia/Dubai')
    expect(nextMilestone).toBe(100)
  })

  it('derives nextStreak from partial earned set (earned 4, 8 → next 12)', () => {
    const rows: AchievementRecord[] = [
      { kind: 'streak', threshold: 4, earned_at: '2026-01-15T10:00:00Z' },
      { kind: 'streak', threshold: 8, earned_at: '2026-02-12T10:00:00Z' },
    ]
    const { nextStreak } = buildAchievements(rows, 'Asia/Dubai')
    expect(nextStreak).toBe(12)
  })

  it('returns nextMilestone null when all milestones earned', () => {
    const rows: AchievementRecord[] = [25, 50, 100, 250, 500, 1000].map((threshold) => ({
      kind: 'milestone',
      threshold,
      earned_at: '2026-01-01T10:00:00Z',
    }))
    const { nextMilestone } = buildAchievements(rows, 'Asia/Dubai')
    expect(nextMilestone).toBeNull()
  })

  it('returns nextStreak null when all streak landmarks earned', () => {
    const rows: AchievementRecord[] = [4, 8, 12, 26, 52].map((threshold) => ({
      kind: 'streak',
      threshold,
      earned_at: '2026-01-01T10:00:00Z',
    }))
    const { nextStreak } = buildAchievements(rows, 'Asia/Dubai')
    expect(nextStreak).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildAchievements — gym-tz earnedLabel
// ---------------------------------------------------------------------------
describe('buildAchievements — gym-tz earnedLabel', () => {
  it('converts a late-UTC instant to the correct gym-tz date (proves tz, not UTC)', () => {
    // 2026-03-19 22:30 UTC → 2026-03-20 02:30 Asia/Dubai (+4)
    const rows: AchievementRecord[] = [
      { kind: 'milestone', threshold: 25, earned_at: '2026-03-19T22:30:00Z' },
    ]
    const view = buildAchievements(rows, 'Asia/Dubai')
    expect(view.milestones[0].earnedLabel).toBe('2026-03-20')
  })

  it('keeps the same date when UTC time is early in the day', () => {
    // 2026-03-19 10:00 UTC → 2026-03-19 14:00 Asia/Dubai (+4) — same day
    const rows: AchievementRecord[] = [
      { kind: 'milestone', threshold: 25, earned_at: '2026-03-19T10:00:00Z' },
    ]
    const view = buildAchievements(rows, 'Asia/Dubai')
    expect(view.milestones[0].earnedLabel).toBe('2026-03-19')
  })
})

// ---------------------------------------------------------------------------
// buildAchievements — empty input
// ---------------------------------------------------------------------------
describe('buildAchievements — empty input', () => {
  it('returns empty arrays, first MILESTONES value as nextMilestone (25), first STREAK_LANDMARKS value as nextStreak (4), all counts 0', () => {
    const view = buildAchievements([], 'Asia/Dubai')
    expect(view.milestones).toEqual([])
    expect(view.streaks).toEqual([])
    expect(view.nextMilestone).toBe(25)
    expect(view.nextStreak).toBe(4)
    expect(view.counts.milestones).toBe(0)
    expect(view.counts.streaks).toBe(0)
    expect(view.counts.total).toBe(0)
  })
})
