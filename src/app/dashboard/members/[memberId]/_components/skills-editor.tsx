'use client'

import { useState, useTransition } from 'react'
import { SKILLS, BELTS, overallBelt } from '@/lib/skills'
import { BeltChip } from '@/components/belt-chip'
import { setSkillLevel } from '../_actions/set-skill-level'

const selClass =
  'h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function SkillsEditor({ athleteId, levels: initial }: { athleteId: string; levels: Record<string, string> }) {
  const [levels, setLevels] = useState<Record<string, string>>(initial)
  const [pending, start] = useTransition()
  const overall = overallBelt(levels)
  const categories = [...new Set(SKILLS.map((s) => s.category))]

  function set(key: string, belt: string) {
    setLevels((prev) => {
      const n = { ...prev }
      if (belt) n[key] = belt
      else delete n[key]
      return n
    })
    start(async () => { const r = await setSkillLevel(athleteId, key, belt); if (r.error) alert(r.error) })
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2 text-xs text-ink-3">
        Overall belt: {overall ? <BeltChip belt={overall} /> : <span>not assessed</span>}
      </div>
      {categories.map((cat) => (
        <div key={cat}>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{cat}</div>
          <div className="flex flex-col gap-1.5">
            {SKILLS.filter((s) => s.category === cat).map((s) => (
              <div key={s.key} className="flex items-center gap-2.5">
                <span className="flex-1 text-[13px] text-ink-2">{s.label}</span>
                <select value={levels[s.key] ?? ''} disabled={pending} onChange={(e) => set(s.key, e.target.value)} className={selClass}>
                  <option value="">—</option>
                  {BELTS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
