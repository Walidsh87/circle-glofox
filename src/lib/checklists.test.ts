import { test, expect } from 'vitest'
import { CHECKLIST_KINDS, validateChecklistItem, mergeChecklist, countIncompleteOnboarding } from './checklists'

test('CHECKLIST_KINDS is onboarding + offboarding', () => {
  expect([...CHECKLIST_KINDS]).toEqual(['onboarding', 'offboarding'])
})

test('validateChecklistItem enforces 1–200 chars', () => {
  expect(validateChecklistItem('Send welcome email')).toBeNull()
  expect(validateChecklistItem('   ')).toMatch(/step/i)
  expect(validateChecklistItem('x'.repeat(201))).toMatch(/long/i)
})

test('mergeChecklist marks done by id and counts, preserving order', () => {
  const res = mergeChecklist(
    [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }, { id: 'c', label: 'Three' }],
    new Set(['b']),
  )
  expect(res.steps.map((s) => [s.id, s.done])).toEqual([['a', false], ['b', true], ['c', false]])
  expect(res.total).toBe(3)
  expect(res.done).toBe(1)
})

test('countIncompleteOnboarding: 0 total → 0, counts members below total', () => {
  expect(countIncompleteOnboarding([0, 2, 3], 0)).toBe(0)
  expect(countIncompleteOnboarding([0, 2, 3], 3)).toBe(2)
  expect(countIncompleteOnboarding([3, 3], 3)).toBe(0)
})
