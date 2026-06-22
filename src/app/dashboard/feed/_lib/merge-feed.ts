export type ScoreItem = {
  kind: 'score'
  id: string
  at: string // ISO timestamp (logged_at)
  athleteId: string
  athleteName: string
  wodTitle: string
  scoringType: string
  scoreValue: number
  rx: boolean
  isPr: boolean
}

export type PrItem = {
  kind: 'pr'
  id: string
  at: string // ISO timestamp (created_at)
  athleteId: string
  athleteName: string
  liftName: string
  kg: number
}

export type AchievementItem = {
  kind: 'achievement'
  id: string
  at: string // ISO timestamp (earned_at)
  athleteId: string
  athleteName: string
  achievementKind: 'milestone' | 'streak'
  threshold: number
}

export type DebriefItem = {
  kind: 'debrief'
  id: string
  at: string // ISO timestamp (created_at)
  coachName: string
  wodTitle: string | null
  body: string
}

export type FeedItem = ScoreItem | PrItem | AchievementItem | DebriefItem

// ISO timestamps sort correctly as strings. Newest first.
export function mergeTimeline(scores: FeedItem[], prs: FeedItem[], achievements: FeedItem[] = [], debriefs: FeedItem[] = [], limit = 30): FeedItem[] {
  return [...scores, ...prs, ...achievements, ...debriefs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
