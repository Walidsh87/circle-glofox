'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveChecklistItem } from '../_actions/save-checklist-item'
import { deleteChecklistItem } from '../_actions/delete-checklist-item'
import { moveChecklistItem } from '../_actions/move-checklist-item'
import type { ChecklistKind } from '@/lib/checklists'

export type EditorItem = { id: string; label: string; kind: string }

function KindList({ kind, title, items }: { kind: ChecklistKind; title: string; items: EditorItem[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [pending, start] = useTransition()
  const inputStyle = { flex: 1, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)' } as const
  const iconBtn = { padding: '4px 9px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 12 } as const

  function add() {
    if (!label.trim()) return
    start(async () => { await saveChecklistItem({ kind, label }); setLabel(''); router.refresh() })
  }
  function act(fn: () => Promise<unknown>) { start(async () => { await fn(); router.refresh() }) }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {items.map((it, i) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-ink)' }}>{it.label}</span>
            <button onClick={() => act(() => moveChecklistItem(it.id, 'up'))} disabled={pending || i === 0} style={{ ...iconBtn, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
            <button onClick={() => act(() => moveChecklistItem(it.id, 'down'))} disabled={pending || i === items.length - 1} style={{ ...iconBtn, opacity: i === items.length - 1 ? 0.4 : 1 }}>↓</button>
            <button onClick={() => { if (confirm('Delete this step?')) act(() => deleteChecklistItem(it.id)) }} disabled={pending} style={{ ...iconBtn, color: 'var(--c-danger)' }}>×</button>
          </div>
        ))}
        {items.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No steps yet.</p>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input style={inputStyle} placeholder={`Add a ${kind} step…`} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button onClick={add} disabled={pending || !label.trim()} style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: pending || !label.trim() ? 0.6 : 1 }}>Add</button>
      </div>
    </div>
  )
}

export function ChecklistEditor({ items }: { items: EditorItem[] }) {
  const onboarding = items.filter((i) => i.kind === 'onboarding')
  const offboarding = items.filter((i) => i.kind === 'offboarding')
  return (
    <div style={{ marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 4 }}>Member checklists</div>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginBottom: 16, lineHeight: 1.5 }}>Steps staff tick off on each member’s profile — onboarding for new members, offboarding when they cancel.</p>
      <KindList kind="onboarding" title="Onboarding" items={onboarding} />
      <KindList kind="offboarding" title="Offboarding" items={offboarding} />
    </div>
  )
}
