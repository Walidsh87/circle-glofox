'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', opacity: pending ? 0.55 : 1 }}>
      <input type="checkbox" checked={task.done} onChange={onToggle} disabled={pending} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--circle-lime-ink)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--c-ink)', textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</div>
        {task.linkLabel && (
          task.linkHref
            ? <Link href={task.linkHref} style={{ fontSize: 12, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>{task.linkLabel} →</Link>
            : <span style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{task.linkLabel}</span>
        )}
      </div>
      {task.assigneeName && <span style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', whiteSpace: 'nowrap' }}>→ {task.assigneeName}</span>}
      <span className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{task.due_date}</span>
      <button onClick={onDelete} disabled={pending} style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 13 }}>×</button>
    </div>
  )
}
