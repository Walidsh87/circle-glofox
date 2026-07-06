'use client'

import type { ReactNode } from 'react'
import { DESK_SEARCH_ID } from './DeskSearch'

// Three front-desk action tiles. Every desk flow (check-in, take-payment, walk-in)
// starts by finding the person, so each tile focuses the search box above.
const TILES: { title: string; caption: string; icon: ReactNode }[] = [
  {
    title: 'Check in',
    caption: 'Scan or tap a member into class',
    icon: <path d="M20 6L9 17l-5-5" />,
  },
  {
    title: 'Take payment',
    caption: 'Mark paid or send a payment link',
    icon: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10.5h18" /></>,
  },
  {
    title: 'Walk-in sign-up',
    caption: 'New lead or trial in under a minute',
    icon: <><circle cx="12" cy="8" r="3.5" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></>,
  },
]

export function DeskActionTiles() {
  const focusSearch = () => document.getElementById(DESK_SEARCH_ID)?.focus()

  return (
    <div className="grid grid-cols-3 gap-3">
      {TILES.map((t) => (
        <button
          key={t.title}
          type="button"
          onClick={focusSearch}
          className="flex flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {t.icon}
            </svg>
          </div>
          <div className="text-[13.5px] font-semibold text-ink">{t.title}</div>
          <div className="text-[11.5px] text-ink-3">{t.caption}</div>
        </button>
      ))}
    </div>
  )
}
