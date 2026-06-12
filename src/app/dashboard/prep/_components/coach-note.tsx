'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { saveCoachNote } from '../_actions/save-coach-note'

export function CoachNote({ athleteId, note }: { athleteId: string; note: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSave() {
    setErr(null)
    start(async () => {
      const res = await saveCoachNote(athleteId, value)
      if (res.error) { setErr(res.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {note
          ? <span className="text-xs text-ink-2">{note}</span>
          : <span className="text-xs italic text-ink-3">No note</span>}
        <button
          type="button"
          onClick={() => { setValue(note); setEditing(true) }}
          className="p-0 text-[11.5px] text-ink-3 underline transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >Edit</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. bad shoulder — scale overhead"
        className="w-full resize-y rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-xs text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 px-3 text-xs" type="button" disabled={pending} onClick={onSave}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" type="button" disabled={pending} onClick={() => setEditing(false)}>
          Cancel
        </Button>
        {err && <span role="alert" className="text-[11.5px] text-danger">{err}</span>}
      </div>
    </div>
  )
}
