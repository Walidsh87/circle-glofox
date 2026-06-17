export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

export type TimeOff = { coach_id: string; start_date: string; end_date: string }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_REASON = 500

/** Weekly availability window validation. Returns a human message or null. */
export function validateAvailabilityWindow(weekday: number, start: string, end: string): string | null {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return 'Pick a valid day of the week.'
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return 'Enter valid start and end times (HH:MM).'
  if (end <= start) return 'End time must be after the start time.'
  return null
}

/** Time-off request validation. Returns a human message or null. */
export function validateTimeOff(startDate: string, endDate: string, reason: string): string | null {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return 'Enter valid start and end dates.'
  if (Number.isNaN(Date.parse(`${startDate}T00:00:00Z`)) || Number.isNaN(Date.parse(`${endDate}T00:00:00Z`))) {
    return 'Enter valid start and end dates.'
  }
  if (endDate < startDate) return 'End date must be on or after the start date.'
  if ((reason ?? '').length > MAX_REASON) return `Reason is too long (max ${MAX_REASON} characters).`
  return null
}

/** True if `coachId` has an approved leave covering `dateISO` (YYYY-MM-DD, inclusive).
 *  `approvedTimeOff` MUST already be filtered to status='approved' by the caller. */
export function isCoachOff(coachId: string, dateISO: string, approvedTimeOff: TimeOff[]): boolean {
  return approvedTimeOff.some(
    (t) => t.coach_id === coachId && dateISO >= t.start_date && dateISO <= t.end_date,
  )
}

/** Instance ids whose assigned coach is on approved leave on the instance's date.
 *  `approvedTimeOff` MUST already be filtered to status='approved' by the caller. */
export function findCoachConflicts(
  instances: { id: string; coach_id: string | null; date: string }[],
  approvedTimeOff: TimeOff[],
): Set<string> {
  const conflicts = new Set<string>()
  for (const inst of instances) {
    if (inst.coach_id && isCoachOff(inst.coach_id, inst.date, approvedTimeOff)) conflicts.add(inst.id)
  }
  return conflicts
}
