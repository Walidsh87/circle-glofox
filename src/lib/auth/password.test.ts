import { test, expect } from 'vitest'
import { validateNewPassword } from './password'

test('rejects passwords under 8 characters', () => {
  expect(validateNewPassword('short7!', 'short7!')).toBe('Password must be at least 8 characters.')
})

test('rejects mismatched confirmation', () => {
  expect(validateNewPassword('longenough', 'different')).toBe('Passwords do not match.')
})

test('rejects empty confirmation', () => {
  expect(validateNewPassword('longenough', '')).toBe('Passwords do not match.')
})

test('accepts a valid pair (exactly 8 chars)', () => {
  expect(validateNewPassword('12345678', '12345678')).toBeNull()
})

test('length check runs before match check', () => {
  expect(validateNewPassword('short', 'different')).toBe('Password must be at least 8 characters.')
})
