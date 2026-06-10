'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTask } from '../_actions/create-task'

export function QuickAdd({ leadId = null, memberId = null, placeholder = 'New follow-up…' }: { leadId?: string | null; memberId?: string | null; placeholder?: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onAdd() {
    if (!title.trim()) return
    setError(null)
    start(async () => {
      const res = await createTask({ title, dueDate, leadId, memberId })
      if (res.error) { setError(res.error); return }
      setTitle('')
      router.refresh()
    })
  }

  const input = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)', fontFamily: 'inherit' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...input, flex: 1, minWidth: 160 }} placeholder={placeholder} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }} />
        <input type="date" style={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button onClick={onAdd} disabled={pending || !title.trim()} style={{ padding: '9px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: pending || !title.trim() ? 0.6 : 1 }}>Add</button>
      </div>
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 12.5 }}>{error}</p>}
    </div>
  )
}
