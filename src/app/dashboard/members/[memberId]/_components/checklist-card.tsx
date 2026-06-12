'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { toggleChecklistStep } from '../_actions/toggle-checklist-step'
import type { ChecklistStep } from '@/lib/checklists'

export function ChecklistCard({ memberId, steps, total, done }: { memberId: string; steps: ChecklistStep[]; total: number; done: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function onToggle(itemId: string, next: boolean) {
    start(async () => { await toggleChecklistStep(memberId, itemId, next); router.refresh() })
  }

  if (total === 0) {
    return <p className="text-xs text-ink-3">No steps defined yet — add them in Settings.</p>
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="mb-0.5 font-mono text-[11.5px] text-ink-3">{done} of {total} done</div>
      {steps.map((s) => (
        <label
          key={s.id}
          className={cn('flex cursor-pointer items-center gap-2 text-[13.5px] text-ink', pending && 'opacity-60')}
        >
          <input
            type="checkbox"
            checked={s.done}
            disabled={pending}
            onChange={(e) => onToggle(s.id, e.target.checked)}
            className="h-[15px] w-[15px] cursor-pointer accent-[var(--accent-ink)]"
          />
          <span className={cn(s.done ? 'text-ink-3 line-through' : 'text-ink')}>{s.label}</span>
        </label>
      ))}
    </div>
  )
}
