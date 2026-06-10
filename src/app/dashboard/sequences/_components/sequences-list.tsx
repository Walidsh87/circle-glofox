'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { triggerLabel } from '@/app/dashboard/automations/_lib/automation-copy'
import { toggleSequence } from '../_actions/toggle-sequence'
import { deleteSequence } from '../_actions/delete-sequence'
import type { TriggerType } from '@/lib/automations'

export type SequenceRow = {
  id: string
  name: string
  trigger_type: TriggerType
  trigger_days: number | null
  enabled: boolean
  step_count: number
  active_count: number
  sent_count: number
}

export function SequencesList({ rows }: { rows: SequenceRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (rows.length === 0) {
    return <p style={{ fontSize: 13.5, color: 'var(--c-ink-muted)' }}>No sequences yet. Build a multi-step drip — a welcome series, win-back, or trial nudge. (If you also run a single Automation for the same moment, members get both.)</p>
  }

  function onToggle(id: string, enabled: boolean) {
    start(async () => { await toggleSequence(id, enabled); router.refresh() })
  }
  function onDelete(id: string) {
    if (!confirm('Delete this sequence? Enrollments stop immediately.')) return
    start(async () => { await deleteSequence(id); router.refresh() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{s.name}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{triggerLabel(s.trigger_type, s.trigger_days)} · {s.step_count} steps · {s.active_count} active · {s.sent_count} sent</div>
          </div>
          <button onClick={() => onToggle(s.id, !s.enabled)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: s.enabled ? 'var(--circle-lime-soft)' : 'transparent', color: s.enabled ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{s.enabled ? 'On' : 'Off'}</button>
          <a href={`/dashboard/sequences/${s.id}`} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', color: 'var(--c-ink)', textDecoration: 'none', fontSize: 12.5 }}>Edit</a>
          <button onClick={() => onDelete(s.id)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12.5 }}>Delete</button>
        </div>
      ))}
    </div>
  )
}
