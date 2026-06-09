import { test, expect } from 'vitest'
import { triggerLabel, TRIGGER_OPTIONS } from './automation-copy'

test('labels read naturally per trigger', () => {
  expect(triggerLabel('no_checkin', 14)).toBe('No check-in for 14 days')
  expect(triggerLabel('trial_ending', 2)).toBe('Trial ending in 2 days')
  expect(triggerLabel('joined', 7)).toBe('7 days after joining')
  expect(triggerLabel('birthday', null)).toBe('On birthday')
})

test('TRIGGER_OPTIONS covers all four triggers with a usesDays flag', () => {
  expect(TRIGGER_OPTIONS.map((o) => o.type)).toEqual(['no_checkin', 'trial_ending', 'joined', 'birthday'])
  expect(TRIGGER_OPTIONS.find((o) => o.type === 'birthday')?.usesDays).toBe(false)
  expect(TRIGGER_OPTIONS.find((o) => o.type === 'no_checkin')?.usesDays).toBe(true)
})
