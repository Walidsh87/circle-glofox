// Add n days to an ISO 'YYYY-MM-DD' date, returning a 'YYYY-MM-DD' UTC date.
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
}

/** True if `s` matches the 'YYYY-MM-DD' shape (format only — not a calendar-validity check). */
export function isIsoDateFormat(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/** Short 'D Mon' date (en-GB) from an ISO timestamp, e.g. '20 Jun'. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
