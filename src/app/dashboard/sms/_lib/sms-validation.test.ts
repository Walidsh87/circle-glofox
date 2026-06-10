import { test, expect } from 'vitest'
import { validateSmsCampaign } from './sms-validation'

test('accepts a valid SMS campaign', () => {
  expect(validateSmsCampaign('Hi team, class at 6pm', 'all')).toBeNull()
})

test('rejects an empty body', () => {
  expect(validateSmsCampaign('   ', 'all')).toMatch(/message/i)
})

test('rejects a body over 1000 chars', () => {
  expect(validateSmsCampaign('a'.repeat(1001), 'all')).toMatch(/message/i)
})

test('rejects a bad audience', () => {
  expect(validateSmsCampaign('Hi', 'nope')).toMatch(/audience/i)
})
