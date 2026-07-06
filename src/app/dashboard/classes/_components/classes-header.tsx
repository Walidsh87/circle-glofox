'use client'

import { useState, type ReactNode } from 'react'

// Header for the Class Schedule page: kicker + title, with "Generate instances" and
// "+ Add template" buttons that each toggle a collapsible panel holding the existing
// form (default closed). Buttons/panels render only when the forms are provided (staff).
export function ClassesHeader({
  boxName,
  count,
  addForm,
  generateForm,
}: {
  boxName: string
  count: number
  addForm: ReactNode | null
  generateForm: ReactNode | null
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const panel = 'mt-3 rounded-xl border border-line bg-surface p-5 shadow-card'

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
            {boxName} · {count} template{count === 1 ? '' : 's'}
          </div>
          <h2 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">
            Class Schedule
          </h2>
        </div>
        {(addForm || generateForm) && (
          <div className="flex shrink-0 items-center gap-2">
            {generateForm && (
              <button
                type="button"
                onClick={() => setGenOpen((o) => !o)}
                aria-expanded={genOpen}
                className="inline-flex items-center rounded-[9px] border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {genOpen ? 'Close' : 'Generate instances'}
              </button>
            )}
            {addForm && (
              <button
                type="button"
                onClick={() => setAddOpen((o) => !o)}
                aria-expanded={addOpen}
                className="inline-flex items-center rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-contrast shadow-card transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {addOpen ? 'Close' : '+ Add template'}
              </button>
            )}
          </div>
        )}
      </div>
      {genOpen && generateForm && <div className={panel}>{generateForm}</div>}
      {addOpen && addForm && <div className={panel}>{addForm}</div>}
    </div>
  )
}
