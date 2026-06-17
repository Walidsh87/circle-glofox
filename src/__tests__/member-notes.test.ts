import { test, expect } from 'vitest'
import { validateNote, NOTE_TYPES } from '@/lib/member-notes'

test('valid note passes', () => {
  expect(validateNote('Called re: renewal', 'call')).toBeNull()
})
test('empty note rejected', () => {
  expect(validateNote('   ', 'general')).toMatch(/note/i)
})
test('over-long note rejected', () => {
  expect(validateNote('x'.repeat(2001), 'general')).toMatch(/long|2000/i)
})
test('bad category rejected', () => {
  expect(validateNote('hi', 'bogus')).toMatch(/category/i)
})
test('every NOTE_TYPE is valid', () => {
  for (const t of NOTE_TYPES) expect(validateNote('hi', t)).toBeNull()
})
