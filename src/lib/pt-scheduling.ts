const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 'HH:MM' (or 'HH:MM:SS') → minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** PT session input validation. Returns a human message or null. */
export function validatePtSchedule(dateISO: string, startTime: string, durationMinutes: number): string | null {
  if (!DATE_RE.test(dateISO) || Number.isNaN(Date.parse(`${dateISO}T00:00:00Z`))) return 'Enter a valid date.'
  if (!TIME_RE.test(startTime)) return 'Enter a valid start time (HH:MM).'
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
    return 'Duration must be 15–240 minutes.'
  }
  return null
}

/** Half-open interval overlap: true if [aStart,aEnd) and [bStart,bEnd) intersect. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** True if [startMin,endMin] fits inside one of the coach's windows for `weekday`. */
export function withinAvailability(
  windows: { weekday: number; start_time: string; end_time: string }[],
  weekday: number, startMin: number, endMin: number,
): boolean {
  return windows.some(
    (w) => w.weekday === weekday && toMinutes(w.start_time) <= startMin && endMin <= toMinutes(w.end_time),
  )
}
