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
