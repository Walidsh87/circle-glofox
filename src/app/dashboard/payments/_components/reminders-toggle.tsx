'use client'

import { useState, useTransition } from 'react'
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
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '6px 10px', borderRadius: 999,
        border: '1px solid var(--c-border)',
        background: enabled ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
        cursor: pending ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
        color: enabled ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: enabled ? 'var(--c-ok-ink)' : 'var(--c-ink-faint)',
      }} />
      {enabled ? 'ON' : 'OFF'}
    </button>
  )
}
