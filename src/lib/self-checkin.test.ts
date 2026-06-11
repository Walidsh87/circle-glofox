import { test, expect } from 'vitest'
import { checkInWindow } from './self-checkin'

const START = '2026-06-11T18:00:00.000Z'

test('open exactly 60 minutes before start (inclusive)', () => {
  expect(checkInWindow(START, '2026-06-11T17:00:00.000Z')).toBe('open')
})

test('early 60 minutes and 1 second before start', () => {
  expect(checkInWindow(START, '2026-06-11T16:59:59.000Z')).toBe('early')
})

test('open at start time', () => {
  expect(checkInWindow(START, '2026-06-11T18:00:00.000Z')).toBe('open')
})

test('open exactly 30 minutes after start (inclusive)', () => {
  expect(checkInWindow(START, '2026-06-11T18:30:00.000Z')).toBe('open')
})

test('closed 30 minutes and 1 second after start', () => {
  expect(checkInWindow(START, '2026-06-11T18:30:01.000Z')).toBe('closed')
})

test('early the morning of an evening class', () => {
  expect(checkInWindow(START, '2026-06-11T08:00:00.000Z')).toBe('early')
})
