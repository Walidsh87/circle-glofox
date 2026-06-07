'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTemplate } from '../_actions/save-template'
import { copyWodToDates, type WodFields } from '../_actions/copy-wod-to-dates'
import { clearDay } from '../_actions/clear-day'

const btn: React.CSSProperties = {
  height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)',
  background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)',
  cursor: 'pointer', fontFamily: 'inherit',
}

export function DayActions({ date, fields }: { date: string; fields: WodFields }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyDates, setCopyDates] = useState<string[]>([''])

  function onSaveTemplate() {
    const fd = new FormData()
    fd.set('title', fields.title)
    fd.set('description', fields.description)
    fd.set('scoringType', fields.scoringType)
    fd.set('strengthTitle', fields.strengthTitle ?? '')
    fd.set('strengthDescription', fields.strengthDescription ?? '')
    fd.set('strengthLift', fields.strengthLift ?? '')
    fd.set('strengthSets', JSON.stringify(fields.strengthSets ?? []))
    start(async () => {
      const res = await saveTemplate({ error: null }, fd)
      alert(res.error ?? 'Saved to library.')
    })
  }

  function onCopy() {
    const dates = copyDates.filter(Boolean)
    start(async () => {
      const res = await copyWodToDates(fields, dates)
      if (res.error) { alert(res.error); return }
      setCopyOpen(false); setCopyDates([''])
      router.refresh()
    })
  }

  function onClear() {
    if (!confirm('Clear this day\'s WOD?')) return
    start(async () => {
      const res = await clearDay(date)
      if (res.error) { alert(res.error); return }
      router.push('/dashboard/programming')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={btn} disabled={pending} onClick={onSaveTemplate}>Save as template</button>
        <button type="button" style={btn} disabled={pending} onClick={() => setCopyOpen((v) => !v)}>Copy to dates…</button>
        <button type="button" style={{ ...btn, color: 'var(--c-danger)' }} disabled={pending} onClick={onClear}>Clear day</button>
      </div>

      {copyOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)' }}>
          {copyDates.map((d, i) => (
            <input
              key={i}
              type="date"
              value={d}
              onChange={(e) => setCopyDates((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
              style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 13, color: 'var(--c-ink)', fontFamily: 'inherit' }}
            />
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn} onClick={() => setCopyDates((p) => [...p, ''])}>+ Add date</button>
            <button type="button" style={{ ...btn, background: 'var(--circle-lime)', border: 'none', color: 'var(--circle-ink)' }} disabled={pending} onClick={onCopy}>Copy</button>
          </div>
        </div>
      )}
    </div>
  )
}
