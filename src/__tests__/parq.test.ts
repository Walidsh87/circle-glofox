import { describe, test, expect } from 'vitest'
import { parseParqQuestions, parseParqAnswers, flaggedQuestions } from '@/lib/parq'

describe('parseParqQuestions', () => {
  test('parses one question per line', () => {
    expect(parseParqQuestions('Q one?\nQ two?')).toEqual({ questions: ['Q one?', 'Q two?'] })
  })

  test('trims whitespace and drops blank lines', () => {
    expect(parseParqQuestions('  Q one?  \n\n   \nQ two?\n')).toEqual({ questions: ['Q one?', 'Q two?'] })
  })

  test('rejects empty input', () => {
    expect(parseParqQuestions('   \n  ')).toEqual({ error: 'Enter at least one question.' })
  })

  test('rejects more than 20 questions', () => {
    const text = Array.from({ length: 21 }, (_, i) => `Q ${i}?`).join('\n')
    expect(parseParqQuestions(text)).toEqual({ error: 'Maximum 20 questions.' })
  })

  test('rejects a question over 300 characters', () => {
    expect(parseParqQuestions('x'.repeat(301))).toEqual({ error: 'Each question must be 300 characters or fewer.' })
  })
})

describe('parseParqAnswers', () => {
  const form = (entries: Record<string, string>) => (key: string) => entries[key] ?? null

  test('maps yes/no to booleans (true = YES)', () => {
    expect(parseParqAnswers(form({ parq_0: 'yes', parq_1: 'no' }), 2)).toEqual({ answers: [true, false] })
  })

  test('rejects when an answer is missing', () => {
    expect(parseParqAnswers(form({ parq_0: 'yes' }), 2)).toEqual({ error: 'Please answer every PAR-Q question.' })
  })

  test('rejects unexpected values', () => {
    expect(parseParqAnswers(form({ parq_0: 'maybe' }), 1)).toEqual({ error: 'Please answer every PAR-Q question.' })
  })

  test('all-no produces all false', () => {
    expect(parseParqAnswers(form({ parq_0: 'no', parq_1: 'no' }), 2)).toEqual({ answers: [false, false] })
  })
})

describe('flaggedQuestions', () => {
  test('returns the question text for each YES', () => {
    expect(flaggedQuestions(['A?', 'B?', 'C?'], [true, false, true])).toEqual(['A?', 'C?'])
  })

  test('returns empty when nothing flagged', () => {
    expect(flaggedQuestions(['A?'], [false])).toEqual([])
  })

  test('falls back to Question N when answers outnumber questions', () => {
    expect(flaggedQuestions(['A?'], [false, true])).toEqual(['Question 2'])
  })
})
