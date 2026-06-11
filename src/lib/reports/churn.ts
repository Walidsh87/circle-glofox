// Monthly churn trend (#51). Lapse-based: a member churns the month their
// membership coverage ends with nothing after; trials are excluded everywhere.
// All math on calendar-date strings — membership dates carry no timezone.
export type ChurnMembershipRow = {
  athlete_id: string
  start_date: string
  end_date: string | null
  is_trial: boolean
}

export type ChurnMonth = {
  monthKey: string
  activeAtStart: number
  joined: number
  churned: number
  net: number
  churnRate: number | null
  partial: boolean
}

function firstOfMonth(monthKey: string): string {
  return `${monthKey}-01`
}

function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1)) // JS months are 0-based, so `m` IS the next month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function buildChurnTrend(rows: ChurnMembershipRow[], monthsBack: number, todayDate: string): ChurnMonth[] {
  const real = rows.filter((r) => !r.is_trial)

  const byAthlete = new Map<string, ChurnMembershipRow[]>()
  for (const r of real) {
    const arr = byAthlete.get(r.athlete_id) ?? []
    arr.push(r)
    byAthlete.set(r.athlete_id, arr)
  }

  const coveredOn = (ms: ChurnMembershipRow[], day: string) =>
    ms.some((m) => m.start_date <= day && (m.end_date === null || m.end_date >= day))

  const currentKey = todayDate.slice(0, 7)
  const keys: string[] = []
  let [y, m] = currentKey.split('-').map(Number)
  for (let i = 0; i < monthsBack; i++) {
    keys.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m--
    if (m === 0) { m = 12; y-- }
  }

  return keys.map((key) => {
    const first = firstOfMonth(key)
    const nextFirst = firstOfMonth(nextMonthKey(key))
    let activeAtStart = 0
    let joined = 0
    let churned = 0
    for (const ms of byAthlete.values()) {
      if (coveredOn(ms, first)) activeAtStart++
      const firstStart = ms.reduce((a, r) => (r.start_date < a ? r.start_date : a), ms[0].start_date)
      if (firstStart.slice(0, 7) === key) joined++
      const hasEndInMonth = ms.some((r) => r.end_date !== null && r.end_date.slice(0, 7) === key)
      if (hasEndInMonth && !coveredOn(ms, nextFirst)) churned++
    }
    return {
      monthKey: key,
      activeAtStart,
      joined,
      churned,
      net: joined - churned,
      churnRate: activeAtStart === 0 ? null : churned / activeAtStart,
      partial: key === currentKey,
    }
  })
}
