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

export type FeedItem = ScoreItem | PrItem

// ISO timestamps sort correctly as strings. Newest first.
export function mergeTimeline(scores: FeedItem[], prs: FeedItem[], limit = 30): FeedItem[] {
  return [...scores, ...prs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
