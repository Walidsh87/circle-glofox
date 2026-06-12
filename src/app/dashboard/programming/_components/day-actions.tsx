'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { saveTemplate } from '../_actions/save-template'
import { copyWodToDates, type WodFields } from '../_actions/copy-wod-to-dates'
import { clearDay } from '../_actions/clear-day'

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
    <div className="mt-3.5 flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onSaveTemplate}>
          Save as template
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setCopyOpen((v) => !v)}>
          Copy to dates…
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-danger hover:border-danger"
          disabled={pending}
          onClick={onClear}
        >
          Clear day
        </Button>
      </div>

      {copyOpen && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface-2 px-3.5 py-3">
          {copyDates.map((d, i) => (
            <input
              key={i}
              type="date"
              value={d}
              onChange={(e) => setCopyDates((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
              className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCopyDates((p) => [...p, ''])}>
              + Add date
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={onCopy}>
              Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
