import { test, expect } from 'vitest'
import { validateMessage, messagePreview, withinSessionWindow } from './inbox'

test('validateMessage accepts normal text', () => {
  expect(validateMessage('Hi, is the 6am on?')).toBeNull()
})

test('validateMessage rejects empty / whitespace-only', () => {
  expect(validateMessage('   ')).toMatch(/message/i)
})

test('validateMessage rejects over 4000 chars', () => {
  expect(validateMessage('x'.repeat(4001))).toMatch(/4000|long/i)
})

test('messagePreview collapses whitespace and truncates', () => {
  expect(messagePreview('  hello   world  ')).toBe('hello world')
  const long = 'a'.repeat(80)
  const out = messagePreview(long)
  expect(out.length).toBeLessThanOrEqual(61)
  expect(out.endsWith('…')).toBe(true)
})

test('withinSessionWindow: null is closed', () => {
  expect(withinSessionWindow(null, '2026-06-10T12:00:00Z')).toBe(false)
})

test('withinSessionWindow: under 24h is open, over 24h is closed', () => {
  const now = '2026-06-10T12:00:00Z'
  expect(withinSessionWindow('2026-06-10T00:00:00Z', now)).toBe(true)
  expect(withinSessionWindow('2026-06-09T11:59:00Z', now)).toBe(false)
})
