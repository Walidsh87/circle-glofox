import { bucketTasks } from '@/lib/follow-up-tasks'

export function dueNow<T extends { due_date: string; done: boolean }>(tasks: T[], today: string): T[] {
  const open = tasks.filter((t) => !t.done)
  const { overdue, today: dueToday } = bucketTasks(open, today)
  return [...overdue, ...dueToday]
}
