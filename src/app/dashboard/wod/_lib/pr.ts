export type WodPrResult = { isPr: boolean; prevBest: number | null }

// priorScores = the athlete's prior scores for the SAME benchmark + SAME rx bracket,
// excluding the current workout. Empty (first time) → baseline, not a PR.
export function decideWodPr(scoringType: string, newScore: number, priorScores: number[]): WodPrResult {
  if (priorScores.length === 0) return { isPr: false, prevBest: null }
  const lowerBetter = scoringType === 'time'
  const prevBest = lowerBetter ? Math.min(...priorScores) : Math.max(...priorScores)
  const isPr = lowerBetter ? newScore < prevBest : newScore > prevBest
  return { isPr, prevBest }
}
