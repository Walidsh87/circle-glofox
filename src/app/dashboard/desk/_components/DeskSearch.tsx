'use client'

import { useEffect, useRef, useState } from 'react'
import { searchPeople } from '../_actions/search-people'
import type { PersonHit } from '../_lib/search'
import { ResultRow } from './ResultRow'
import { WalkInPanel } from './WalkInPanel'

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

  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => { setQ(e.target.value); setWalkIn(false) }}
        placeholder="Search name / phone / email / Emirates ID…"
        aria-label="Search people"
        className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {loading && <p className="text-[13px] text-ink-3">Searching…</p>}
      {!loading && q.trim() && hits.length === 0 && <p className="text-[13px] text-ink-3">No match.</p>}
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
