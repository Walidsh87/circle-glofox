import * as React from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string
  body?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-6 py-12 text-center',
        className
      )}
    >
      <div className="font-display text-lg font-semibold text-ink">{title}</div>
      {body && <p className="max-w-sm text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
