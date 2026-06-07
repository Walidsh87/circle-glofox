const SCORING_TYPES = ['time', 'rounds_reps', 'load_kg', 'amrap']

export function validateTemplateInput(
  title: string,
  description: string,
  scoringType: string,
): string | null {
  if (!title?.trim()) return 'Give the template a title.'
  if (!description?.trim()) return 'Add a description.'
  if (!SCORING_TYPES.includes(scoringType)) return 'Pick a scoring type.'
  return null
}
