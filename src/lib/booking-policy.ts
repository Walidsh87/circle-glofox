// Booking has closed if 'now' is within closeMinutes of the start (or past). 0 → never closed.
export function bookingClosed(startsAt: string, now: string, closeMinutes: number): boolean {
  if (closeMinutes <= 0) return false
  return Date.parse(startsAt) - Date.parse(now) < closeMinutes * 60_000
}

// A cancel is "late" if 'now' is within lateCancelHours of the start (or past). 0 → never late.
export function isLateCancel(startsAt: string, now: string, lateCancelHours: number): boolean {
  if (lateCancelHours <= 0) return false
  return Date.parse(startsAt) - Date.parse(now) < lateCancelHours * 3_600_000
}
