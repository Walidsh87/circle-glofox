/** GCC timezone hour offsets — the app's supported gym timezones.
 *  Gulf timezones have no DST, so fixed offsets are safe (house convention). */
export const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}

/** YYYY-MM-DD "today" in the gym's timezone (offset-shifted UTC). */
export function todayInTimezone(timezone: string) {
  const offset = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offset * 3600000).toISOString().slice(0, 10)
}

/** Fixed GCC offset as an ISO suffix, e.g. 4 → "+04:00", -3 → "-03:00". */
export function formatTimezoneOffset(hours: number): string {
  const sign = hours >= 0 ? '+' : '-'
  return `${sign}${String(Math.abs(hours)).padStart(2, '0')}:00`
}

/** UTC window [start, end] covering a gym-local calendar date (closed: 00:00:00 … 23:59:59). */
export function dayBoundaries(dateISO: string, timezone: string): { start: string; end: string } {
  const offset = formatTimezoneOffset(TIMEZONE_OFFSETS[timezone] ?? 4)
  return { start: `${dateISO}T00:00:00${offset}`, end: `${dateISO}T23:59:59${offset}` }
}

/** UTC window [start, end] covering "today" in the gym's timezone (closed). */
export function todayWindow(timezone: string): { start: string; end: string } {
  return dayBoundaries(todayInTimezone(timezone), timezone)
}

/** Minute-of-day (0–1439) of an instant rendered in the gym's timezone.
 *  en-GB + hour12:false can emit "24:00" for midnight in some ICU builds — normalized to "00:00". */
export function minuteOfDay(iso: string, timeZone: string): number {
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso))
    .replace(/^24:/, '00:')
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}
