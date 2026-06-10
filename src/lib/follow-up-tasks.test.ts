import { test, expect } from 'vitest'
import { validateTask, bucketTasks } from './follow-up-tasks'

test('validateTask accepts a titled task with a valid date', () => {
  expect(validateTask('Call about trial', '2026-06-15')).toBeNull()
})

test('validateTask rejects an empty title', () => {
  expect(validateTask('   ', '2026-06-15')).toMatch(/title/i)
})

test('validateTask rejects an over-long title', () => {
  expect(validateTask('x'.repeat(201), '2026-06-15')).toMatch(/title/i)
})

test('validateTask rejects a missing or malformed date', () => {
  expect(validateTask('Call', '')).toMatch(/date/i)
  expect(validateTask('Call', '15-06-2026')).toMatch(/date/i)
  expect(validateTask('Call', '2026-13-40')).toMatch(/date/i)
})

test('bucketTasks splits overdue / today / upcoming (today inclusive)', () => {
  const tasks = [
    { id: 'a', due_date: '2026-06-14' },
    { id: 'b', due_date: '2026-06-15' },
    { id: 'c', due_date: '2026-06-16' },
  ]
  const { overdue, today, upcoming } = bucketTasks(tasks, '2026-06-15')
  expect(overdue.map((t) => t.id)).toEqual(['a'])
  expect(today.map((t) => t.id)).toEqual(['b'])
  expect(upcoming.map((t) => t.id)).toEqual(['c'])
})
