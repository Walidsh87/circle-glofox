export type PrResult = { isPr: boolean; deltaGrams: number }

// previousGrams === null means first-ever entry for this lift → baseline, not a PR.
export function detectPr(previousGrams: number | null, newGrams: number): PrResult {
  if (previousGrams === null) return { isPr: false, deltaGrams: 0 }
  if (newGrams > previousGrams) return { isPr: true, deltaGrams: newGrams - previousGrams }
  return { isPr: false, deltaGrams: 0 }
}
