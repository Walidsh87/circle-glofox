'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { saveChecklistItem } from '../_actions/save-checklist-item'
import { deleteChecklistItem } from '../_actions/delete-checklist-item'
import { moveChecklistItem } from '../_actions/move-checklist-item'
import type { ChecklistKind } from '@/lib/checklists'

export type EditorItem = { id: string; label: string; kind: string }

const iconBtn =
  'rounded-md border border-line bg-transparent px-2 py-1 text-xs text-ink-3 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40'

function KindList({ kind, title, items }: { kind: ChecklistKind; title: string; items: EditorItem[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [pending, start] = useTransition()

  function add() {
    if (!label.trim()) return
    start(async () => { await saveChecklistItem({ kind, label }); setLabel(''); router.refresh() })
  }
  function act(fn: () => Promise<unknown>) { start(async () => { await fn(); router.refresh() }) }

  return (
    <div className="mb-[18px]">
      <div className="mb-2 text-[12.5px] font-bold uppercase tracking-[0.04em] text-ink-3">{title}</div>
      <div className="mb-2 flex flex-col gap-1.5">
        {items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-1.5">
            <span className="flex-1 text-[13.5px] text-ink">{it.label}</span>
            <button onClick={() => act(() => moveChecklistItem(it.id, 'up'))} disabled={pending || i === 0} className={iconBtn} aria-label="Move up">↑</button>
            <button onClick={() => act(() => moveChecklistItem(it.id, 'down'))} disabled={pending || i === items.length - 1} className={iconBtn} aria-label="Move down">↓</button>
            <button onClick={() => { if (confirm('Delete this step?')) act(() => deleteChecklistItem(it.id)) }} disabled={pending} className={cn(iconBtn, 'text-danger hover:border-danger')} aria-label="Delete">×</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-[12.5px] text-ink-3">No steps yet.</p>}
      </div>
      <div className="flex gap-1.5">
        <input
          className="flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          placeholder={`Add a ${kind} step…`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <Button size="sm" onClick={add} disabled={pending || !label.trim()}>Add</Button>
      </div>
    </div>
  )
}

export function ChecklistEditor({ items }: { items: EditorItem[] }) {
  const onboarding = items.filter((i) => i.kind === 'onboarding')
  const offboarding = items.filter((i) => i.kind === 'offboarding')
  return (
    <div className="mt-6 rounded-[14px] border border-line bg-surface px-[22px] py-5">
      <div className="mb-1 text-sm font-semibold text-ink">Member checklists</div>
      <p className="mb-4 text-[12.5px] leading-normal text-ink-3">Steps staff tick off on each member’s profile — onboarding for new members, offboarding when they cancel.</p>
      <KindList kind="onboarding" title="Onboarding" items={onboarding} />
      <KindList kind="offboarding" title="Offboarding" items={offboarding} />
    </div>
  )
}
