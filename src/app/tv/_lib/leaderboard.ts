// time → ascending (faster first); everything else → descending (more is better).
export function sortLeaderboard<T extends { score_value: number }>(scores: T[], scoringType: string): T[] {
  const lowerBetter = scoringType === 'time'
  return [...scores].sort((a, b) => (lowerBetter ? a.score_value - b.score_value : b.score_value - a.score_value))
}
