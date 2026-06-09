'use client'

import { useState, useTransition } from 'react'
import { SKILLS, BELTS, overallBelt } from '@/lib/skills'
import { BeltChip } from '@/components/belt-chip'
import { setSkillLevel } from '../_actions/set-skill-level'

const sel: React.CSSProperties = { height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 12.5, fontFamily: 'inherit' }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
        Overall belt: {overall ? <BeltChip belt={overall} /> : <span>not assessed</span>}
      </div>
      {categories.map((cat) => (
        <div key={cat}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SKILLS.filter((s) => s.category === cat).map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--c-ink-2)' }}>{s.label}</span>
                <select value={levels[s.key] ?? ''} disabled={pending} onChange={(e) => set(s.key, e.target.value)} style={sel}>
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
