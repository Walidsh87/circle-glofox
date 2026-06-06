'use client'

import { useTransition } from 'react'
import { togglePackage } from '../_actions/toggle-package'
import { deletePackage } from '../_actions/delete-package'

const btn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--c-border)', borderRadius: 6,
  padding: '4px 9px', fontSize: 12, cursor: 'pointer', color: 'var(--c-ink-2)',
}

export function PackageActions({ packageId, active }: { packageId: string; active: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button
        style={btn}
        disabled={pending}
        onClick={() => startTransition(async () => {
          const res = await togglePackage(packageId, !active)
          if (res.error) alert(res.error)
        })}
      >
        {active ? 'Deactivate' : 'Activate'}
      </button>
      <button
        style={{ ...btn, color: 'var(--c-danger-ink)' }}
        disabled={pending}
        onClick={() => {
          if (!confirm('Delete this package? This cannot be undone.')) return
          startTransition(async () => {
            const res = await deletePackage(packageId)
            if (res.error) alert(res.error)
          })
        }}
      >
        Delete
      </button>
    </div>
  )
}
