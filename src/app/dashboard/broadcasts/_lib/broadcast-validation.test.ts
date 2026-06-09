import { test, expect } from 'vitest'
import { validateBroadcast } from './broadcast-validation'

test('valid input returns null', () => {
  expect(validateBroadcast('Hello', 'Body here', 'all')).toBeNull()
})

test('empty subject is rejected', () => {
  expect(validateBroadcast('   ', 'Body', 'all')).toMatch(/subject/i)
})

test('over-long subject is rejected', () => {
  expect(validateBroadcast('x'.repeat(151), 'Body', 'all')).toMatch(/subject/i)
})

test('empty body is rejected', () => {
  expect(validateBroadcast('Subject', '   ', 'all')).toMatch(/body/i)
})

test('bad audience status is rejected', () => {
  expect(validateBroadcast('Subject', 'Body', 'platinum')).toMatch(/audience/i)
})
