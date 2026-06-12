'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createTask } from '../_actions/create-task'

const inputClass =
  'rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function QuickAdd({ leadId = null, memberId = null, placeholder = 'New follow-up…', staff = [] }: {
  leadId?: string | null
  memberId?: string | null
  placeholder?: string
  staff?: { id: string; full_name: string | null }[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [assignedTo, setAssignedTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onAdd() {
    if (!title.trim()) return
    setError(null)
    start(async () => {
      const res = await createTask({ title, dueDate, leadId, memberId, assignedTo: assignedTo || null })
      if (res.error) { setError(res.error); return }
      setTitle('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <input className={cn(inputClass, 'min-w-40 flex-1')} placeholder={placeholder} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }} />
        <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        {staff.length > 0 && (
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass} aria-label="Assign to">
            <option value="">Anyone</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name ?? 'Staff'}</option>)}
          </select>
        )}
        <Button size="sm" onClick={onAdd} disabled={pending || !title.trim()}>Add</Button>
      </div>
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
    </div>
  )
}
