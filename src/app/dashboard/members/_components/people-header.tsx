'use client'

import { useState, type ReactNode } from 'react'

// Content header for the People page: kicker + "People" title on the left, Export CSV
// (owner) + a "+ Add …" button on the right. The button toggles a collapsible panel
// holding the existing add form — same disclosure pattern as EditMemberForm.
export function PeopleHeader({
  boxName,
  addLabel,
  exportSlot,
  addForm,
}: {
  boxName: string
  addLabel: string
  exportSlot: ReactNode
  addForm: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            {boxName}
          </div>
          <h2 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">
            People
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {exportSlot}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-contrast shadow-card transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {open ? 'Close' : `+ ${addLabel}`}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-5 shadow-card">
          {addForm}
        </div>
      )}
    </div>
  )
}
