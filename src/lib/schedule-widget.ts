export type WidgetInstance = {
  id: string
  starts_at: string
  capacity: number
  booked: number
  className: string
  coachName: string
}

export type ScheduleDay = { key: string; label: string; items: WidgetInstance[] }

export function spotsRemaining(capacity: number, booked: number): number {
  return Math.max(0, capacity - booked)
}

export function spotsLabel(capacity: number, booked: number): string {
  const n = spotsRemaining(capacity, booked)
  if (n === 0) return 'Full'
  return `${n} spot${n === 1 ? '' : 's'} left`
}

function dayKey(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(new Date(startsAt))
}

function dayLabel(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(startsAt))
}

// Groups instances (already time-ordered) by the gym-timezone calendar date.
export function groupByDay(instances: WidgetInstance[], timezone: string): ScheduleDay[] {
  const days: ScheduleDay[] = []
  const byKey = new Map<string, ScheduleDay>()
  for (const i of instances) {
    const key = dayKey(i.starts_at, timezone)
    let day = byKey.get(key)
    if (!day) {
      day = { key, label: dayLabel(i.starts_at, timezone), items: [] }
      byKey.set(key, day)
      days.push(day)
    }
    day.items.push(i)
  }
  return days
}
