'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
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

const actionBtn =
  'rounded-md border border-line px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

export function SequencesList({ rows }: { rows: SequenceRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (rows.length === 0) {
    return <p className="text-[13.5px] text-ink-3">No sequences yet. Build a multi-step drip — a welcome series, win-back, or trial nudge. (If you also run a single Automation for the same moment, members get both.)</p>
  }

  function onToggle(id: string, enabled: boolean) {
    start(async () => { await toggleSequence(id, enabled); router.refresh() })
  }
  function onDelete(id: string) {
    if (!confirm('Delete this sequence? Enrollments stop immediately.')) return
    start(async () => { await deleteSequence(id); router.refresh() })
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((s) => (
        <div key={s.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{s.name}</div>
            <div className="font-mono text-xs text-ink-3">
              {triggerLabel(s.trigger_type, s.trigger_days)} · {s.step_count} steps · {s.active_count} active · {s.sent_count} sent
            </div>
          </div>
          <button
            onClick={() => onToggle(s.id, !s.enabled)}
            disabled={pending}
            className={cn(actionBtn, 'font-semibold', s.enabled ? 'bg-accent-soft text-accent-ink' : 'bg-transparent text-ink-3')}
          >
            {s.enabled ? 'On' : 'Off'}
          </button>
          <Link href={`/dashboard/sequences/${s.id}`} className={cn(actionBtn, 'text-ink hover:border-line-strong')}>
            Edit
          </Link>
          <button
            onClick={() => onDelete(s.id)}
            disabled={pending}
            className={cn(actionBtn, 'bg-transparent text-danger hover:border-danger')}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}
