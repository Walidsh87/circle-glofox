'use client'

import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { togglePackage } from '../_actions/toggle-package'
import { deletePackage } from '../_actions/delete-package'

const btnClass =
  'rounded-md border border-line bg-transparent px-2 py-1 text-xs text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

export function PackageActions({ packageId, active }: { packageId: string; active: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex justify-end gap-1.5">
      <button
        className={btnClass}
        disabled={pending}
        onClick={() => startTransition(async () => {
          const res = await togglePackage(packageId, !active)
          if (res.error) alert(res.error)
        })}
      >
        {active ? 'Deactivate' : 'Activate'}
      </button>
      <button
        className={cn(btnClass, 'text-danger hover:border-danger hover:text-danger')}
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
