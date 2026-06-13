// Hijri (Umm al-Qura) helpers backed by native Intl — no library.
// All inputs/outputs are Gregorian 'YYYY-MM-DD'. Dates are anchored at noon UTC
// and formatted in UTC so the civil date never shifts under a timezone.

const LONG = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})
const NUMERIC = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC',
})

function atNoonUtc(ymd: string): Date {
  return new Date(ymd + 'T12:00:00Z')
}

function addDays(ymd: string, n: number): string {
  const d = atNoonUtc(ymd)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function hijriMonth(ymd: string): number {
  return Number(NUMERIC.formatToParts(atNoonUtc(ymd)).find((p) => p.type === 'month')?.value)
}

// "1 Ramadan 1447" — day-month-year, dropping the comma + "AH" the default string carries.
export function formatHijri(gregorianYMD: string): string {
  const parts = LONG.formatToParts(atNoonUtc(gregorianYMD))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}`
}

// First contiguous Hijri-month-9 span within the Gregorian year.
export function ramadanWindowForYear(year: number): { start: string; end: string } {
  let start: string | null = null
  let cur = `${year}-01-01`
  const stop = `${year}-12-31`
  while (cur <= stop) {
    if (hijriMonth(cur) === 9) {
      if (!start) start = cur
    } else if (start) {
      return { start, end: addDays(cur, -1) }
    }
    cur = addDays(cur, 1)
  }
  return { start: start ?? `${year}-01-01`, end: stop }
}

// The Ramadan window covering today, else next year's. Powers the Settings hint.
export function upcomingRamadanWindow(todayYMD: string): { start: string; end: string } {
  const year = Number(todayYMD.slice(0, 4))
  const thisYear = ramadanWindowForYear(year)
  return todayYMD <= thisYear.end ? thisYear : ramadanWindowForYear(year + 1)
}

// Inclusive, null-safe membership test for the stored window.
export function inRamadanWindow(ymd: string, start: string | null, end: string | null): boolean {
  return !!start && !!end && ymd >= start && ymd <= end
}
