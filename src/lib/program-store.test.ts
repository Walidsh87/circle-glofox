import { validateTemplate } from '@/lib/program-store'
import type { ProgramInput } from '@/lib/program'

const sess = (week: number | null | undefined) => ({
  client_uid: '11111111-1111-4111-8111-111111111111', title: 'Wk', week, exercises: [],
})

test('validateTemplate requires a positive integer week on every session', () => {
  const base: ProgramInput = { title: 'Strength', notes: null, sessions: [sess(1)] }
  expect(validateTemplate(base)).toBeNull()
  expect(validateTemplate({ ...base, sessions: [sess(undefined)] })).toBe('Every session needs a week number (1 or higher).')
  expect(validateTemplate({ ...base, sessions: [sess(0)] })).toBe('Every session needs a week number (1 or higher).')
  expect(validateTemplate({ ...base, sessions: [sess(1.5)] })).toBe('Every session needs a week number (1 or higher).')
})

test('validateTemplate still enforces the base program rules', () => {
  expect(validateTemplate({ title: '', notes: null, sessions: [sess(1)] })).toBe('Give the program a title.')
})
