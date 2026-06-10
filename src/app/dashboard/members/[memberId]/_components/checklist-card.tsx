'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleChecklistStep } from '../_actions/toggle-checklist-step'
import type { ChecklistStep } from '@/lib/checklists'

export function ChecklistCard({ memberId, steps, total, done }: { memberId: string; steps: ChecklistStep[]; total: number; done: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function onToggle(itemId: string, next: boolean) {
    start(async () => { await toggleChecklistStep(memberId, itemId, next); router.refresh() })
  }

  if (total === 0) {
    return <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No steps defined yet — add them in Settings.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginBottom: 2 }}>{done} of {total} done</div>
      {steps.map((s) => (
        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--c-ink)', cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          <input type="checkbox" checked={s.done} disabled={pending} onChange={(e) => onToggle(s.id, e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--circle-lime-ink)', cursor: 'pointer' }} />
          <span style={{ textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--c-ink-muted)' : 'var(--c-ink)' }}>{s.label}</span>
        </label>
      ))}
    </div>
  )
}
