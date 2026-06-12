// #59 part 2: informational hours from staff clock-in/out. NOT part of pay math.

export type TimecardRow = { staff_id: string; clock_in: string; clock_out: string | null }
export type StaffHours = { hours: number; cards: number; open: number }

/** 'YYYY-MM' of an ISO timestamp in the given timezone (mirrors payroll's monthKeyOf). */
function monthKeyOf(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}`
}

/** Whether an ISO timestamp falls in the given gym-timezone month. */
export function inMonth(iso: string, monthKey: string, timeZone: string): boolean {
  return monthKeyOf(iso, timeZone) === monthKey
}

/** Hours per staff member for the month. A card belongs to its clock-in's month;
 *  open cards add 0 hours and increment `open`. Hours rounded to 0.1. */
export function sumHoursByStaff(cards: TimecardRow[], monthKey: string, timeZone: string): Map<string, StaffHours> {
  const map = new Map<string, StaffHours>()
  for (const c of cards) {
    if (!inMonth(c.clock_in, monthKey, timeZone)) continue
    const entry = map.get(c.staff_id) ?? { hours: 0, cards: 0, open: 0 }
    entry.cards += 1
    if (c.clock_out) {
      const ms = Date.parse(c.clock_out) - Date.parse(c.clock_in)
      if (ms > 0) entry.hours = Math.round((entry.hours + ms / 3600000) * 10) / 10
    } else {
      entry.open += 1
    }
    map.set(c.staff_id, entry)
  }
  return map
}

export function fmtHours(h: number): string {
  return h > 0 ? `${h}h` : '—'
}
