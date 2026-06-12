'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toggleTask } from '../_actions/toggle-task'
import { deleteTask } from '../_actions/delete-task'

export type TaskRow = {
  id: string
  title: string
  due_date: string
  done: boolean
  linkLabel: string | null
  linkHref: string | null
  assigneeName: string | null
}

export function TaskItem({ task }: { task: TaskRow }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function onToggle() {
    start(async () => { await toggleTask(task.id, !task.done); router.refresh() })
  }
  function onDelete() {
    if (!confirm('Delete this task?')) return
    start(async () => { await deleteTask(task.id); router.refresh() })
  }

  return (
    <div className={cn('flex items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3.5 py-2.5', pending && 'opacity-55')}>
      <input type="checkbox" checked={task.done} onChange={onToggle} disabled={pending} className="h-4 w-4 cursor-pointer accent-accent" />
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm text-ink', task.done && 'line-through')}>{task.title}</div>
        {task.linkLabel && (
          task.linkHref
            ? <Link href={task.linkHref} className="text-xs text-ink-3 transition-colors hover:text-ink">{task.linkLabel} →</Link>
            : <span className="text-xs text-ink-3">{task.linkLabel}</span>
        )}
      </div>
      {task.assigneeName && <span className="whitespace-nowrap text-[11.5px] text-ink-3">→ {task.assigneeName}</span>}
      <span className="font-mono text-[11.5px] text-ink-3">{task.due_date}</span>
      <button
        onClick={onDelete}
        disabled={pending}
        className="rounded-md border border-line bg-transparent px-2 py-0.5 text-[13px] text-ink-3 transition-colors hover:border-danger hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        aria-label="Delete task"
      >
        ×
      </button>
    </div>
  )
}
