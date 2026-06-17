import { overlaps } from '@/lib/pt-scheduling'

const MAX_NOTE = 300

/** Optional cover note. Returns a human message or null. */
export function validateSubNote(note: string): string | null {
  if ((note ?? '').length > MAX_NOTE) return `Note is too long (max ${MAX_NOTE} characters).`
  return null
}

/** Can this coach claim a class at [startMin,endMin]? Blocked by approved leave
 *  or any overlapping commitment. `busy` = the coach's other class/PT intervals
 *  that day (gym-tz minute-of-day). `onLeave` = isCoachOff for that date. */
export function eligibleToClaim(
  onLeave: boolean,
  busy: { start: number; end: number }[],
  startMin: number,
  endMin: number,
): { ok: boolean; reason?: 'on_leave' | 'conflict' } {
  if (onLeave) return { ok: false, reason: 'on_leave' }
  if (busy.some((b) => overlaps(startMin, endMin, b.start, b.end))) return { ok: false, reason: 'conflict' }
  return { ok: true }
}
