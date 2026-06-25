import { test, expect } from 'vitest'
import { safeNextPath } from './safe-redirect'

test('keeps a same-origin relative path', () => {
  expect(safeNextPath('/dashboard/members')).toBe('/dashboard/members')
  expect(safeNextPath('/dashboard?tab=x')).toBe('/dashboard?tab=x')
})

test('falls back to /dashboard for empty/missing', () => {
  expect(safeNextPath(null)).toBe('/dashboard')
  expect(safeNextPath('')).toBe('/dashboard')
})

test('rejects absolute and scheme-relative URLs (open redirect)', () => {
  expect(safeNextPath('https://evil.com')).toBe('/dashboard')
  expect(safeNextPath('http://evil.com/x')).toBe('/dashboard')
  expect(safeNextPath('//evil.com')).toBe('/dashboard')
  expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard')
})

test('rejects backslash and non-rooted paths', () => {
  expect(safeNextPath('/\\evil.com')).toBe('/dashboard')
  expect(safeNextPath('dashboard')).toBe('/dashboard')
})
