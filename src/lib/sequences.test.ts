import { test, expect } from 'vitest'
import { nextDueStep, enrollmentStillValid, type SequenceStep } from './sequences'

const steps: SequenceStep[] = [
  { offset_days: 0, subject: 'Hi', body_blocks: [{ type: 'heading', text: 'Hi' }] },
  { offset_days: 3, subject: 'Day 3', body_blocks: [{ type: 'heading', text: '3' }] },
  { offset_days: 7, subject: 'Day 7', body_blocks: [{ type: 'heading', text: '7' }] },
]

test('nextDueStep returns step 0 on enroll day when offset is 0', () => {
  expect(nextDueStep(steps, '2026-06-09', '2026-06-09', 0)).toBe(0)
})

test('nextDueStep returns null when the next step is not yet due', () => {
  // step 1 has offset 3; only 1 day elapsed
  expect(nextDueStep(steps, '2026-06-09', '2026-06-10', 1)).toBeNull()
})

test('nextDueStep returns the next unsent step once its offset is reached', () => {
  expect(nextDueStep(steps, '2026-06-09', '2026-06-12', 1)).toBe(1) // 3 days elapsed, step1 offset 3
})

test('nextDueStep returns just the next step even when several are overdue', () => {
  // 10 days elapsed; steps 1 and 2 both overdue, but sentCount=1 → returns 1 only
  expect(nextDueStep(steps, '2026-06-09', '2026-06-19', 1)).toBe(1)
})

test('nextDueStep returns null when all steps are sent', () => {
  expect(nextDueStep(steps, '2026-06-09', '2026-07-09', 3)).toBeNull()
})

test('enrollmentStillValid: joined and birthday always hold', () => {
  expect(enrollmentStillValid('joined', { trialEndDate: null, lastCheckIn: '2026-06-08' }, '2026-06-01')).toBe(true)
  expect(enrollmentStillValid('birthday', { trialEndDate: null, lastCheckIn: null }, '2026-06-01')).toBe(true)
})

test('enrollmentStillValid: trial_ending holds while an active trial exists', () => {
  expect(enrollmentStillValid('trial_ending', { trialEndDate: '2026-06-20', lastCheckIn: null }, '2026-06-01')).toBe(true)
  expect(enrollmentStillValid('trial_ending', { trialEndDate: null, lastCheckIn: null }, '2026-06-01')).toBe(false)
})

test('enrollmentStillValid: no_checkin exits once they check in after enrolling', () => {
  // still quiet (no check-in since enrolling)
  expect(enrollmentStillValid('no_checkin', { trialEndDate: null, lastCheckIn: null }, '2026-06-01')).toBe(true)
  expect(enrollmentStillValid('no_checkin', { trialEndDate: null, lastCheckIn: '2026-05-20' }, '2026-06-01')).toBe(true)
  // checked in AFTER enrolling → exit
  expect(enrollmentStillValid('no_checkin', { trialEndDate: null, lastCheckIn: '2026-06-05' }, '2026-06-01')).toBe(false)
})
