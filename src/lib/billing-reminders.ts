export type ReminderStage = 'pre' | 'due' | 'overdue'

export type MembershipForReminder = {
  last_paid_date: string | null
  start_date: string
  end_date: string | null
}

export function getDueDate(m: MembershipForReminder): string | null {
  const anchor = m.last_paid_date ?? m.start_date
  if (!anchor) return null
  const d = new Date(anchor + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export function getReminderStage(today: string, dueDate: string): ReminderStage | null {
  const a = Date.parse(today + 'T00:00:00Z')
  const b = Date.parse(dueDate + 'T00:00:00Z')
  const days = Math.round((b - a) / 86_400_000)
  if (days === 3) return 'pre'
  if (days === 0) return 'due'
  if (days === -3) return 'overdue'
  return null
}
