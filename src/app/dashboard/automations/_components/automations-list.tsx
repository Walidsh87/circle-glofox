'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { triggerLabel } from '../_lib/automation-copy'
import { toggleAutomation } from '../_actions/toggle-automation'
import { deleteAutomation } from '../_actions/delete-automation'
import type { TriggerType } from '@/lib/automations'

export type AutomationRow = {
  id: string
  name: string
  trigger_type: TriggerType
  trigger_days: number | null
  enabled: boolean
  sent_count: number
}

export function AutomationsList({ rows }: { rows: AutomationRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (rows.length === 0) {
    return <p style={{ fontSize: 13.5, color: 'var(--c-ink-muted)' }}>No automations yet. Create one to email members automatically when they hit a lifecycle moment.</p>
  }

  function onToggle(id: string, enabled: boolean) {
    start(async () => { await toggleAutomation(id, enabled); router.refresh() })
  }
  function onDelete(id: string) {
    if (!confirm('Delete this automation?')) return
    start(async () => { await deleteAutomation(id); router.refresh() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{a.name}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{triggerLabel(a.trigger_type, a.trigger_days)} · {a.sent_count} sent</div>
          </div>
          <button onClick={() => onToggle(a.id, !a.enabled)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: a.enabled ? 'var(--circle-lime-soft)' : 'transparent', color: a.enabled ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{a.enabled ? 'On' : 'Off'}</button>
          <a href={`/dashboard/automations/${a.id}`} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', color: 'var(--c-ink)', textDecoration: 'none', fontSize: 12.5 }}>Edit</a>
          <button onClick={() => onDelete(a.id)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12.5 }}>Delete</button>
        </div>
      ))}
    </div>
  )
}
