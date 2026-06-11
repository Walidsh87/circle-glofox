// Minimal RFC 5545 calendar feed (#81). UID = booking id, so a cancelled
// booking (row deleted) disappears from the feed on the calendar's next poll.
export type CalendarEvent = {
  uid: string
  title: string
  startsAtIso: string
  durationMinutes: number
  location: string
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

export function buildCalendarFeed(input: { calendarName: string; events: CalendarEvent[] }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Circle//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(input.calendarName)}`,
  ]
  for (const e of input.events) {
    const endIso = new Date(new Date(e.startsAtIso).getTime() + e.durationMinutes * 60_000).toISOString()
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${icsDate(e.startsAtIso)}`,
      `DTSTART:${icsDate(e.startsAtIso)}`,
      `DTEND:${icsDate(endIso)}`,
      `SUMMARY:${esc(e.title)}`,
      `LOCATION:${esc(e.location)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
