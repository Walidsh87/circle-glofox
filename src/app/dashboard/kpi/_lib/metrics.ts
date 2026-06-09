import { isFrozenOn } from '@/lib/membership-status'

export type MembershipRow = { athlete_id: string; monthly_price_aed: number | null; start_date: string; end_date: string | null; frozen_from?: string | null; frozen_until?: string | null }
export type PurchaseRow = { created_at: string; price_aed: number }

export type TrendPoint = { label: string; monthEnd: string; mrr: number; members: number; packageRev: number }
export type KpiSnapshot = { activeMembers: number; mrr: number; arm: number; leg: number; ltv: number; churnPct: number }
export type Kpis = { snapshot: KpiSnapshot; trend: TrendPoint[] }

const MS_DAY = 86400000
const AVG_DAYS_PER_MONTH = 30.44
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 'YYYY-MM-DD' → UTC ms (date-only).
function ms(date: string): number {
  return Date.parse(date + 'T00:00:00Z')
}
const round1 = (x: number) => Math.round(x * 10) / 10
const round2 = (x: number) => Math.round(x * 100) / 100

// Active on a date: started on/before it AND not yet ended by it (ISO strings compare lexicographically).
function activeOn(r: MembershipRow, onDate: string): boolean {
  return r.start_date <= onDate && (r.end_date === null || r.end_date > onDate) && !isFrozenOn(r, onDate)
}
function activeAthletes(rows: MembershipRow[], onDate: string): Set<string> {
  const set = new Set<string>()
  for (const r of rows) if (activeOn(r, onDate)) set.add(r.athlete_id)
  return set
}

// Last n COMPLETE calendar month-end dates, oldest → newest (current partial month excluded).
export function monthEnds(today: string, n: number): string[] {
  const y = Number(today.slice(0, 4))
  const mo = Number(today.slice(5, 7)) // 1-12
  const ends: string[] = []
  for (let k = n; k >= 1; k--) {
    // day 0 of (current month - (k-1)) = last day of the prior month
    const d = new Date(Date.UTC(y, (mo - 1) - (k - 1), 0))
    ends.push(d.toISOString().slice(0, 10))
  }
  return ends
}

export function monthStart(monthEnd: string): string {
  return monthEnd.slice(0, 7) + '-01'
}

export function mrrAt(rows: MembershipRow[], onDate: string): number {
  return rows.reduce((s, r) => (activeOn(r, onDate) ? s + (r.monthly_price_aed ?? 0) : s), 0)
}

export function activeAt(rows: MembershipRow[], onDate: string): number {
  return activeAthletes(rows, onDate).size
}

export function packageRevInMonth(purchases: PurchaseRow[], mStart: string, mEnd: string): number {
  return purchases.reduce((s, p) => {
    const d = p.created_at.slice(0, 10)
    return d >= mStart && d <= mEnd ? s + p.price_aed : s
  }, 0)
}

// Churn = athletes who ended in the month and are gone by month-end ÷ athletes active at month start.
export function churnForMonth(rows: MembershipRow[], mStart: string, mEnd: string): number {
  const start = activeAthletes(rows, mStart)
  if (start.size === 0) return 0
  const activeEnd = activeAthletes(rows, mEnd)
  const churned = new Set<string>()
  for (const r of rows) {
    if (r.end_date && r.end_date >= mStart && r.end_date <= mEnd && !activeEnd.has(r.athlete_id)) {
      churned.add(r.athlete_id)
    }
  }
  return churned.size / start.size
}

// Mean per-athlete tenure in months (min start → max end-or-today).
export function avgTenureMonths(rows: MembershipRow[], today: string): number {
  const byAthlete = new Map<string, { minStart: string; maxEnd: string }>()
  for (const r of rows) {
    const end = r.end_date ?? today
    const cur = byAthlete.get(r.athlete_id)
    if (!cur) byAthlete.set(r.athlete_id, { minStart: r.start_date, maxEnd: end })
    else {
      if (r.start_date < cur.minStart) cur.minStart = r.start_date
      if (end > cur.maxEnd) cur.maxEnd = end
    }
  }
  if (byAthlete.size === 0) return 0
  let total = 0
  for (const { minStart, maxEnd } of byAthlete.values()) {
    total += Math.max(0, (ms(maxEnd) - ms(minStart)) / MS_DAY) / AVG_DAYS_PER_MONTH
  }
  return round1(total / byAthlete.size)
}

export function computeKpis(memberships: MembershipRow[], purchases: PurchaseRow[], today: string): Kpis {
  const ends = monthEnds(today, 12)
  const trend: TrendPoint[] = ends.map((monthEnd) => ({
    label: MONTH_LABELS[Number(monthEnd.slice(5, 7)) - 1],
    monthEnd,
    mrr: round2(mrrAt(memberships, monthEnd)),
    members: activeAt(memberships, monthEnd),
    packageRev: round2(packageRevInMonth(purchases, monthStart(monthEnd), monthEnd)),
  }))

  const last = trend[trend.length - 1]
  const arm = last && last.members > 0 ? round2((last.mrr + last.packageRev) / last.members) : 0

  const last3 = ends.slice(-3)
  const churns = last3.map((e) => churnForMonth(memberships, monthStart(e), e))
  const churnPct = churns.length ? round1((churns.reduce((a, b) => a + b, 0) / churns.length) * 100) : 0

  const leg = avgTenureMonths(memberships, today)
  return {
    snapshot: {
      activeMembers: activeAt(memberships, today),
      mrr: round2(mrrAt(memberships, today)),
      arm,
      leg,
      ltv: round2(arm * leg),
      churnPct,
    },
    trend,
  }
}
