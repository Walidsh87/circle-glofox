import { MILESTONES, STREAK_LANDMARKS } from '@/lib/consistency'

export type AchievementRecord = { kind: string; threshold: number; earned_at: string }

export type Badge = { threshold: number; earnedLabel: string }

/**
 * Returns the lowest value in `values` that is strictly above `earnedMax`,
 * or null if all values have been earned (or `values` is empty).
 */
export function nextAbove(values: readonly number[], earnedMax: number): number | null {
  for (const v of [...values].sort((a, b) => a - b)) {
    if (v > earnedMax) return v
  }
  return null
}

function fmtGymDate(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString))
}

export function buildAchievements(
  rows: AchievementRecord[],
  timeZone: string,
): {
  milestones: Badge[]
  streaks: Badge[]
  nextMilestone: number | null
  nextStreak: number | null
  counts: { milestones: number; streaks: number; total: number }
} {
  const milestoneRows = rows.filter((r) => r.kind === 'milestone')
  const streakRows = rows.filter((r) => r.kind === 'streak')

  const toBadge = (r: AchievementRecord): Badge => ({
    threshold: r.threshold,
    earnedLabel: fmtGymDate(r.earned_at, timeZone),
  })

  const milestones = milestoneRows
    .map(toBadge)
    .sort((a, b) => a.threshold - b.threshold)

  const streaks = streakRows
    .map(toBadge)
    .sort((a, b) => a.threshold - b.threshold)

  const maxMilestone = milestones.length > 0 ? Math.max(...milestones.map((b) => b.threshold)) : 0
  const maxStreak = streaks.length > 0 ? Math.max(...streaks.map((b) => b.threshold)) : 0

  return {
    milestones,
    streaks,
    nextMilestone: nextAbove(MILESTONES, maxMilestone),
    nextStreak: nextAbove(STREAK_LANDMARKS, maxStreak),
    counts: {
      milestones: milestones.length,
      streaks: streaks.length,
      total: milestones.length + streaks.length,
    },
  }
}
