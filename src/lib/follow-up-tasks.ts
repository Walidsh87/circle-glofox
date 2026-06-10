const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateTask(title: string, dueDate: string): string | null {
  const t = title.trim()
  if (!t) return 'Please enter a task title.'
  if (t.length > 200) return 'Task title is too long (max 200 characters).'
  if (!DATE_RE.test(dueDate)) return 'Please choose a valid due date.'
  const d = new Date(`${dueDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dueDate) return 'Please choose a valid due date.'
  return null
}

export function bucketTasks<T extends { due_date: string }>(tasks: T[], today: string): { overdue: T[]; today: T[]; upcoming: T[] } {
  const overdue: T[] = []
  const todayList: T[] = []
  const upcoming: T[] = []
  for (const t of tasks) {
    if (t.due_date < today) overdue.push(t)
    else if (t.due_date === today) todayList.push(t)
    else upcoming.push(t)
  }
  return { overdue, today: todayList, upcoming }
}
