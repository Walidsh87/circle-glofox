import { test, expect } from 'vitest'
import {
  WEEKDAYS,
  validateAvailabilityWindow,
  validateTimeOff,
  isCoachOff,
  findCoachConflicts,
} from '@/lib/coach-availability'

test('WEEKDAYS is Sunday-indexed', () => {
  expect(WEEKDAYS[0]).toBe('Sunday')
  expect(WEEKDAYS[6]).toBe('Saturday')
})

// validateAvailabilityWindow
test('valid window passes', () => {
  expect(validateAvailabilityWindow(1, '06:00', '10:00')).toBeNull()
})
test('weekday out of range rejected', () => {
  expect(validateAvailabilityWindow(7, '06:00', '10:00')).toMatch(/day/i)
  expect(validateAvailabilityWindow(-1, '06:00', '10:00')).toMatch(/day/i)
})
test('non-integer weekday rejected', () => {
  expect(validateAvailabilityWindow(1.5, '06:00', '10:00')).toMatch(/day/i)
})
test('bad time format rejected', () => {
  expect(validateAvailabilityWindow(1, '6am', '10:00')).toMatch(/time/i)
  expect(validateAvailabilityWindow(1, '06:00', '25:00')).toMatch(/time/i)
})
test('end not after start rejected', () => {
  expect(validateAvailabilityWindow(1, '10:00', '10:00')).toMatch(/after/i)
  expect(validateAvailabilityWindow(1, '10:00', '06:00')).toMatch(/after/i)
})

// validateTimeOff
test('valid time-off passes', () => {
  expect(validateTimeOff('2026-07-01', '2026-07-05', 'Holiday')).toBeNull()
})
test('single-day time-off passes', () => {
  expect(validateTimeOff('2026-07-01', '2026-07-01', '')).toBeNull()
})
test('bad date rejected', () => {
  expect(validateTimeOff('2026-13-40', '2026-07-05', '')).toMatch(/date/i)
})
test('end before start rejected', () => {
  expect(validateTimeOff('2026-07-05', '2026-07-01', '')).toMatch(/on or after/i)
})
test('over-long reason rejected', () => {
  expect(validateTimeOff('2026-07-01', '2026-07-05', 'x'.repeat(501))).toMatch(/long|500/i)
})

// isCoachOff
const off = [{ coach_id: 'c1', start_date: '2026-07-01', end_date: '2026-07-05' }]
test('date inside range is off', () => {
  expect(isCoachOff('c1', '2026-07-03', off)).toBe(true)
})
test('range edges inclusive', () => {
  expect(isCoachOff('c1', '2026-07-01', off)).toBe(true)
  expect(isCoachOff('c1', '2026-07-05', off)).toBe(true)
})
test('date outside range is not off', () => {
  expect(isCoachOff('c1', '2026-06-30', off)).toBe(false)
  expect(isCoachOff('c1', '2026-07-06', off)).toBe(false)
})
test('different coach is not off', () => {
  expect(isCoachOff('c2', '2026-07-03', off)).toBe(false)
})

// findCoachConflicts
test('flags an instance whose coach is off that day', () => {
  const conflicts = findCoachConflicts(
    [{ id: 'i1', coach_id: 'c1', date: '2026-07-03' }],
    off,
  )
  expect(conflicts.has('i1')).toBe(true)
  expect(conflicts.size).toBe(1)
})
test('does not flag an available coach or a different date', () => {
  const conflicts = findCoachConflicts(
    [
      { id: 'i1', coach_id: 'c2', date: '2026-07-03' }, // different coach
      { id: 'i2', coach_id: 'c1', date: '2026-06-30' }, // outside range
    ],
    off,
  )
  expect(conflicts.size).toBe(0)
})
test('skips instances with no assigned coach', () => {
  const conflicts = findCoachConflicts(
    [{ id: 'i1', coach_id: null, date: '2026-07-03' }],
    off,
  )
  expect(conflicts.size).toBe(0)
})
