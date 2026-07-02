'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SKILL_BESTS, SKILL_BEST_CATEGORIES, skillByKey, validateBestInput } from '@/lib/skill-bests'
import { logBest } from '../_actions/log-best'

const inputCls = 'h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

const PLACEHOLDERS = { reps: 'Reps', weight: 'kg', distance_m: 'Meters', time: 'mm:ss' } as const

export function LogBestForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [skillKey, setSkillKey] = useState(SKILL_BESTS[0].key)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const measure = skillByKey(skillKey)?.measure ?? 'reps'

  function submit() {
    const err = validateBestInput(skillKey, value)
    if (err) { setError(err); setSaved(false); return }
    setError(null)
    start(async () => {
      const r = await logBest(skillKey, value)
      if (r.error) { setError(r.error); setSaved(false); return }
      setValue('')
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="best-skill" className="sr-only">Skill</label>
        <select
          id="best-skill"
          value={skillKey}
          onChange={(e) => { setSkillKey(e.target.value); setValue(''); setError(null); setSaved(false) }}
          className={inputCls}
        >
          {SKILL_BEST_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={cat}>
              {SKILL_BESTS.filter((s) => s.category === cat).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <label htmlFor="best-value" className="sr-only">Value</label>
        {measure === 'time' ? (
          <input
            id="best-value"
            placeholder={PLACEHOLDERS.time}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${inputCls} w-24`}
          />
        ) : (
          <input
            id="best-value"
            type="number"
            min="1"
            step={measure === 'weight' ? '0.5' : '1'}
            placeholder={PLACEHOLDERS[measure]}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${inputCls} w-24`}
          />
        )}

        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Log best'}
        </button>
      </div>
      {measure === 'time' && <p className="text-[11.5px] text-ink-3">Faster is better — enter your time as mm:ss.</p>}
      {error && <p className="text-[12px] text-danger" role="alert">{error}</p>}
      {saved && !error && <p className="text-[12px] text-accent-ink">Logged. 🎉</p>}
    </div>
  )
}
