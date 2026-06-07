// Pure month-grid date logic for the programming calendar. Monday-first weeks
// (matches the app's week-start convention). 'YYYY-MM' month, 'YYYY-MM-DD' dates.

export type GridCell = { date: string | null; inMonth: boolean }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last day
  return { start: `${month}-01`, end: `${month}-${pad(last)}` }
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)))
}

// Monday=0 … Sunday=6 from a JS getUTCDay() (Sun=0).
function mondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}

export function monthGridDays(month: string): GridCell[] {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const firstDow = mondayIndex(new Date(Date.UTC(y, m - 1, 1)).getUTCDay())

  const cells: GridCell[] = []
  for (let i = 0; i < firstDow; i++) cells.push({ date: null, inMonth: false })
  for (let d = 1; d <= lastDay; d++) cells.push({ date: `${month}-${pad(d)}`, inMonth: true })
  while (cells.length % 7 !== 0) cells.push({ date: null, inMonth: false })
  return cells
}
