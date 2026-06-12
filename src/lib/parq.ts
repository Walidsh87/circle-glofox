// PAR-Q (#70) pure logic: editor parsing, form-answer parsing, flag zipping.

export function parseParqQuestions(text: string): { questions: string[] } | { error: string } {
  const questions = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  if (questions.length === 0) return { error: 'Enter at least one question.' }
  if (questions.length > 20) return { error: 'Maximum 20 questions.' }
  if (questions.some((q) => q.length > 300)) return { error: 'Each question must be 300 characters or fewer.' }
  return { questions }
}

/** Reads parq_0…parq_{count-1}; every answer must be 'yes' or 'no'. true = YES. */
export function parseParqAnswers(
  get: (key: string) => string | null,
  count: number,
): { answers: boolean[] } | { error: string } {
  const answers: boolean[] = []
  for (let i = 0; i < count; i++) {
    const v = get(`parq_${i}`)
    if (v !== 'yes' && v !== 'no') return { error: 'Please answer every PAR-Q question.' }
    answers.push(v === 'yes')
  }
  return { answers }
}

/** Question text for each YES; index drift (edited questions) falls back to "Question N". */
export function flaggedQuestions(questions: string[], answers: boolean[]): string[] {
  return answers
    .map((yes, i) => (yes ? (questions[i] ?? `Question ${i + 1}`) : null))
    .filter((q): q is string => q !== null)
}
