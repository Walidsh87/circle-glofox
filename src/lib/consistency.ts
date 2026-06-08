export const WEEK_TARGET = 3
export const MILESTONES = [25, 50, 100, 250, 500, 1000]
export const STREAK_LANDMARKS = [4, 8, 12, 26, 52]

// Monday-start integer week index (adjacency only). +3 shifts the Thursday epoch to Monday-start weeks.
export function weekIndex(date: string): number {
  const days = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000)
  return Math.floor((days + 3) / 7)
}

export function weeklyCounts(dates: string[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const d of dates) {
    const wi = weekIndex(d)
    m.set(wi, (m.get(wi) ?? 0) + 1)
  }
  return m
}

// Consecutive committed weeks ending at the current week. The current in-progress week
// counts only if already at target; if below target it is "grace" and does not break the streak.
export function currentStreakWeeks(dates: string[], today: string, target: number = WEEK_TARGET): number {
  const counts = weeklyCounts(dates)
  const committed = (wi: number) => (counts.get(wi) ?? 0) >= target
  const cur = weekIndex(today)
  let streak = 0
  if (committed(cur)) streak++
  let wi = cur - 1
  while (committed(wi)) {
    streak++
    wi--
  }
  return streak
}

export function totalCheckins(dates: string[]): number {
  return dates.length
}

export function currentMilestone(total: number): number | null {
  let reached: number | null = null
  for (const m of MILESTONES) if (total >= m) reached = m
  return reached
}

export function nextMilestone(total: number): { threshold: number; remaining: number } | null {
  for (const m of MILESTONES) if (total < m) return { threshold: m, remaining: m - total }
  return null
}

export function crossedMilestone(newTotal: number): number | null {
  return MILESTONES.includes(newTotal) ? newTotal : null
}

export function reachedStreakLandmark(streak: number): number | null {
  return STREAK_LANDMARKS.includes(streak) ? streak : null
}
