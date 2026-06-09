import { test, expect } from 'vitest'
import { validateAutomation } from './automation-validation'

test('accepts a valid day-based automation', () => {
  expect(validateAutomation('Win-back', 'no_checkin', 14)).toBeNull()
})

test('accepts birthday with null days', () => {
  expect(validateAutomation('Birthday', 'birthday', null)).toBeNull()
})

test('rejects an empty name', () => {
  expect(validateAutomation('  ', 'joined', 7)).toMatch(/name/i)
})

test('rejects an unknown trigger', () => {
  expect(validateAutomation('X', 'nope', 7)).toMatch(/trigger/i)
})

test('rejects day-based trigger without a positive day count', () => {
  expect(validateAutomation('X', 'joined', null)).toMatch(/days/i)
  expect(validateAutomation('X', 'joined', 0)).toMatch(/days/i)
  expect(validateAutomation('X', 'trial_ending', -3)).toMatch(/days/i)
})

test('rejects birthday with a day count', () => {
  expect(validateAutomation('X', 'birthday', 5)).toMatch(/birthday/i)
})
