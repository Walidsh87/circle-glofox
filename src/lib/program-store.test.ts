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

import { weekUnlockDate, isWeekUnlocked } from '@/lib/program-store'

test('weekUnlockDate adds 7×(week-1) days to the start date', () => {
  expect(weekUnlockDate('2026-06-01', 1)).toBe('2026-06-01')
  expect(weekUnlockDate('2026-06-01', 2)).toBe('2026-06-08')
  expect(weekUnlockDate('2026-06-29', 2)).toBe('2026-07-06') // month rollover
})

test('isWeekUnlocked: true on/after the unlock day, false before; null week/start = always unlocked', () => {
  expect(isWeekUnlocked('2026-06-01', 2, '2026-06-07')).toBe(false) // day before
  expect(isWeekUnlocked('2026-06-01', 2, '2026-06-08')).toBe(true)  // unlock day
  expect(isWeekUnlocked('2026-06-01', 2, '2026-06-09')).toBe(true)  // after
  expect(isWeekUnlocked('2026-06-01', 1, '2026-06-01')).toBe(true)  // week 1 = start
  expect(isWeekUnlocked(null, 3, '2026-06-08')).toBe(true)          // no start
  expect(isWeekUnlocked('2026-06-01', null, '2026-06-01')).toBe(true) // no week structure
})
