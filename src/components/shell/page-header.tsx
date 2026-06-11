import * as React from 'react'

export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string
  title: string
  actions?: React.ReactNode
}) {
  return (
    <div className="c-page-header flex items-end justify-between gap-4 pb-5">
      <div>
        {eyebrow && (
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">{eyebrow}</div>
        )}
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
