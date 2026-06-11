import { test, expect } from 'vitest'
import { buildCalendarFeed } from '@/lib/ics'

const EVENT = { uid: 'b1', title: 'CrossFit WOD', startsAtIso: '2026-06-15T18:00:00.000Z', durationMinutes: 60, location: 'Circle' }

test('wraps events in a VCALENDAR with the calendar name', () => {
  const ics = buildCalendarFeed({ calendarName: 'Circle — Classes', events: [EVENT] })
  expect(ics).toContain('BEGIN:VCALENDAR')
  expect(ics).toContain('VERSION:2.0')
  expect(ics).toContain('X-WR-CALNAME:Circle — Classes')
  expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
})

test('renders UTC basic-format start and end from ISO + duration', () => {
  const ics = buildCalendarFeed({ calendarName: 'C', events: [EVENT] })
  expect(ics).toContain('UID:b1')
  expect(ics).toContain('DTSTART:20260615T180000Z')
  expect(ics).toContain('DTEND:20260615T190000Z')
  expect(ics).toContain('SUMMARY:CrossFit WOD')
  expect(ics).toContain('LOCATION:Circle')
})

test('escapes commas, semicolons, backslashes and newlines in text fields', () => {
  const ics = buildCalendarFeed({ calendarName: 'C', events: [{ ...EVENT, title: 'Yoga; Flow, hot\nnew', location: 'Bay 1, back' }] })
  expect(ics).toContain('SUMMARY:Yoga\\; Flow\\, hot\\nnew')
  expect(ics).toContain('LOCATION:Bay 1\\, back')
})

test('an empty feed is still a valid calendar with no events', () => {
  const ics = buildCalendarFeed({ calendarName: 'C', events: [] })
  expect(ics).toContain('BEGIN:VCALENDAR')
  expect(ics).not.toContain('BEGIN:VEVENT')
})

test('uses CRLF line endings throughout', () => {
  const ics = buildCalendarFeed({ calendarName: 'C', events: [EVENT] })
  expect(ics.includes('\r\n')).toBe(true)
  expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
})
