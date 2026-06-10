import { test, expect } from 'vitest'
import { validateLeadSubmission } from './lead-capture'

test('accepts a name with an email', () => {
  expect(validateLeadSubmission('Sarah Lee', 'sarah@example.com', '')).toBeNull()
})

test('accepts a name with only a phone', () => {
  expect(validateLeadSubmission('Sarah Lee', '', '0501234567')).toBeNull()
})

test('requires a name', () => {
  expect(validateLeadSubmission('   ', 'sarah@example.com', '')).toMatch(/name/i)
})

test('requires at least one contact method', () => {
  expect(validateLeadSubmission('Sarah Lee', '', '')).toMatch(/email or phone/i)
})

test('rejects a malformed email', () => {
  expect(validateLeadSubmission('Sarah Lee', 'not-an-email', '')).toMatch(/email/i)
})

test('rejects an over-long name', () => {
  expect(validateLeadSubmission('x'.repeat(121), 'sarah@example.com', '')).toMatch(/name/i)
})
