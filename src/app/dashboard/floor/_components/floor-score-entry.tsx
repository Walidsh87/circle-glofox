'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logScoreForAthlete } from '../_actions/log-score-for'

// For time scores the coach enters mm:ss; otherwise a raw number (reps/kg).
function parseScore(raw: string, scoringType: string): number | null {
  const t = raw.trim()
  if (!t) return null
  if (scoringType === 'time' && t.includes(':')) {
    const [m, s] = t.split(':')
    const mm = Number(m), ss = Number(s)
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null
    return mm * 60 + ss
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function FloorScoreEntry({
  workoutId, athleteId, scoringType, existing,
}: {
  workoutId: string
  athleteId: string
  scoringType: string
  existing: { score_value: number; rx: boolean } | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [rx, setRx] = useState(existing?.rx ?? true)

  function save() {
    const value = parseScore(raw, scoringType)
    if (value == null || value < 0) { alert('Enter a valid score.'); return }
    start(async () => {
      const res = await logScoreForAthlete(workoutId, athleteId, value, rx, null)
      if (res.error) { alert(res.error); return }
      setOpen(false); setRaw(''); router.refresh()
    })
  }

  return (
    <div className="mt-2 border-t border-line pt-2">
      {!open ? (
        <button type="button" className="text-[12px] text-ink-3 underline" onClick={() => setOpen(true)}>
          {existing ? `Score: ${existing.score_value}${existing.rx ? ' Rx' : ''} · edit` : '+ Log score'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            className="h-8 w-24 rounded-lg border border-line-strong bg-surface px-2 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
            placeholder={scoringType === 'time' ? 'mm:ss' : 'score'}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            inputMode={scoringType === 'time' ? 'text' : 'numeric'}
          />
          <label className="flex items-center gap-1 text-[12px] text-ink-2">
            <input type="checkbox" checked={rx} onChange={(e) => setRx(e.target.checked)} /> Rx
          </label>
          <button type="button" className="rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink disabled:opacity-50" disabled={pending || !raw.trim()} onClick={save}>
            {pending ? '…' : 'Save'}
          </button>
          <button type="button" className="text-[11.5px] text-ink-3" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
