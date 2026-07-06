'use client'

import { useState, type ReactNode } from 'react'

// Payments header: kicker + title, right-aligned unpaid pill + Export CSV + a
// "+ Add membership" button that toggles a collapsible panel holding AddMembershipForm.
export function PaymentsHeader({
  boxName,
  count,
  unpaidCount,
  exportSlot,
  addForm,
}: {
  boxName: string
  count: number
  unpaidCount: number
  exportSlot: ReactNode
  addForm: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            {boxName} · {count} membership{count === 1 ? '' : 's'}
          </div>
          <h2 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">
            Payments
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unpaidCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {unpaidCount} unpaid
            </span>
          )}
          {exportSlot}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-contrast shadow-card transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {open ? 'Close' : '+ Add membership'}
          </button>
        </div>
      </div>
      {open && <div className="mt-3 rounded-xl border border-line bg-surface p-5 shadow-card">{addForm}</div>}
    </div>
  )
}
