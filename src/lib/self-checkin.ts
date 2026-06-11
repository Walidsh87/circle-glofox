// Self check-in window (#61): a member can check into a booked class from
// 60 minutes before start until 30 minutes after start, inclusive.
const OPEN_BEFORE_MS = 60 * 60_000
const CLOSE_AFTER_MS = 30 * 60_000

export function checkInWindow(startsAtIso: string, nowIso: string): 'open' | 'early' | 'closed' {
  const start = new Date(startsAtIso).getTime()
  const now = new Date(nowIso).getTime()
  if (now < start - OPEN_BEFORE_MS) return 'early'
  if (now > start + CLOSE_AFTER_MS) return 'closed'
  return 'open'
}
