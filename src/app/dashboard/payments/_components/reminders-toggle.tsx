'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { toggleReminders } from '../_actions/toggle-reminders'

export function RemindersToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      const { error } = await toggleReminders(next)
      if (error) {
        setEnabled(!next)
        alert(error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={enabled}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed',
        enabled ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-ink-3'
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', enabled ? 'bg-ok' : 'bg-ink-faint')} />
      {enabled ? 'ON' : 'OFF'}
    </button>
  )
}
