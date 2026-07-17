'use client'

import { useEffect, useRef, useState } from 'react'
import { searchPeople } from '../_actions/search-people'
import type { PersonHit } from '../_lib/search'
import { ResultRow } from './ResultRow'
import { WalkInPanel } from './WalkInPanel'

export const DESK_SEARCH_ID = 'desk-search-input'

export function DeskSearch() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PersonHit[]>([])
  const [loading, setLoading] = useState(false)
  const [walkIn, setWalkIn] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (!query) { setHits([]); return }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      const res = await searchPeople(query)
      if (mine !== seq.current) return
      setHits(res.hits ?? [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  // "/" focuses the search from anywhere on the page (unless already typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      e.preventDefault()
      document.getElementById(DESK_SEARCH_ID)?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-[18px] py-[15px] text-ink-faint shadow-pop transition-colors focus-within:border-line-strong">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          id={DESK_SEARCH_ID}
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setWalkIn(false) }}
          placeholder="Search members & leads by name, phone, email, Emirates ID…"
          aria-label="Search people"
          className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <kbd className="shrink-0 rounded-[5px] border border-line px-[7px] py-px font-mono text-[11px] text-ink-3">/</kbd>
      </div>
      {/* The whole desk flow starts here, and results arrive asynchronously —
          without a live region a screen-reader user gets no cue that anything
          happened (WCAG 4.1.3). aria-live sits on a permanently-rendered node:
          a region that only mounts with its message is often missed. */}
      <div role="status" aria-live="polite">
        {loading && <p className="text-[13px] text-ink-3">Searching…</p>}
        {!loading && q.trim() && hits.length === 0 && <p className="text-[13px] text-ink-3">No match.</p>}
        {!loading && hits.length > 0 && (
          <p className="sr-only">{hits.length} {hits.length === 1 ? 'result' : 'results'} found.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {hits.map((h) => <ResultRow key={`${h.kind}:${h.id}`} hit={h} />)}
      </div>
      {q.trim() && (
        walkIn
          ? <WalkInPanel initialName={q.trim()} onDone={() => { setWalkIn(false); setQ('') }} />
          : <button onClick={() => setWalkIn(true)} className="self-start rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-2">+ New walk-in &quot;{q.trim()}&quot;</button>
      )}
    </div>
  )
}
