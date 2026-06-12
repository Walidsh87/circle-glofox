'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
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
  channel: string
  sent_count: number
}

const actionBtn =
  'rounded-md border border-line px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

export function AutomationsList({ rows }: { rows: AutomationRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (rows.length === 0) {
    return <p className="text-[13.5px] text-ink-3">No automations yet. Create one to email members automatically when they hit a lifecycle moment.</p>
  }

  function onToggle(id: string, enabled: boolean) {
    start(async () => { await toggleAutomation(id, enabled); router.refresh() })
  }
  function onDelete(id: string) {
    if (!confirm('Delete this automation?')) return
    start(async () => { await deleteAutomation(id); router.refresh() })
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{a.name}</div>
            <div className="font-mono text-xs text-ink-3">
              {triggerLabel(a.trigger_type, a.trigger_days)} · {a.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} · {a.sent_count} sent
            </div>
          </div>
          <button
            onClick={() => onToggle(a.id, !a.enabled)}
            disabled={pending}
            className={cn(actionBtn, 'font-semibold', a.enabled ? 'bg-accent-soft text-accent-ink' : 'bg-transparent text-ink-3')}
          >
            {a.enabled ? 'On' : 'Off'}
          </button>
          <Link href={`/dashboard/automations/${a.id}`} className={cn(actionBtn, 'text-ink hover:border-line-strong')}>
            Edit
          </Link>
          <button
            onClick={() => onDelete(a.id)}
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
