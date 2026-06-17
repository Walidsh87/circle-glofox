import { test, expect } from 'vitest'
import { validatePtSchedule, toMinutes, overlaps, withinAvailability } from '@/lib/pt-scheduling'

test('toMinutes parses HH:MM', () => {
  expect(toMinutes('06:30')).toBe(390)
  expect(toMinutes('00:00')).toBe(0)
  expect(toMinutes('23:59')).toBe(1439)
})

test('validatePtSchedule accepts a valid slot', () => {
  expect(validatePtSchedule('2026-07-01', '06:00', 60)).toBeNull()
})
test('validatePtSchedule rejects a bad date', () => {
  expect(validatePtSchedule('2026-13-40', '06:00', 60)).toMatch(/date/i)
})
test('validatePtSchedule rejects a bad time', () => {
  expect(validatePtSchedule('2026-07-01', '6am', 60)).toMatch(/time/i)
  expect(validatePtSchedule('2026-07-01', '24:00', 60)).toMatch(/time/i)
})
test('validatePtSchedule rejects duration out of 15..240', () => {
  expect(validatePtSchedule('2026-07-01', '06:00', 10)).toMatch(/duration|minutes/i)
  expect(validatePtSchedule('2026-07-01', '06:00', 300)).toMatch(/duration|minutes/i)
})

test('overlaps is half-open (back-to-back do not collide)', () => {
  expect(overlaps(360, 420, 420, 480)).toBe(false) // 06:00-07:00 vs 07:00-08:00
  expect(overlaps(360, 420, 419, 480)).toBe(true)  // 1-min overlap
  expect(overlaps(360, 480, 390, 420)).toBe(true)  // nested
  expect(overlaps(360, 420, 480, 540)).toBe(false) // disjoint
})

const windows = [
  { weekday: 1, start_time: '06:00:00', end_time: '10:00:00' },
  { weekday: 1, start_time: '16:00:00', end_time: '20:00:00' },
]
test('withinAvailability true when inside a window', () => {
  expect(withinAvailability(windows, 1, toMinutes('06:30'), toMinutes('07:30'))).toBe(true)
})
test('withinAvailability false when outside every window', () => {
  expect(withinAvailability(windows, 1, toMinutes('11:00'), toMinutes('12:00'))).toBe(false)
})
test('withinAvailability false when it spills past a window edge', () => {
  expect(withinAvailability(windows, 1, toMinutes('09:30'), toMinutes('10:30'))).toBe(false)
})
test('withinAvailability false on a weekday with no windows', () => {
  expect(withinAvailability(windows, 2, toMinutes('06:30'), toMinutes('07:30'))).toBe(false)
})
test('withinAvailability true at exact window edges', () => {
  expect(withinAvailability(windows, 1, toMinutes('06:00'), toMinutes('10:00'))).toBe(true)
})
