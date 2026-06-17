'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { NOTE_TYPES, NOTE_TYPE_LABELS } from '@/lib/member-notes'
import { addNote } from '@/app/dashboard/members/[memberId]/_actions/add-note'

export function DeskAddNote({ athleteId }: { athleteId: string }) {
  const [text, setText] = useState('')
  const [type, setType] = useState<string>('call')
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()
  const submit = () => {
    if (!text.trim()) return
    start(async () => {
      const r = await addNote(athleteId, text, type)
      if (r.error) { alert(r.error); return }
      setText(''); setDone(true)
    })
  }
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      {done && <p className="mb-2 text-[12px] text-accent-ink">✓ Note added.</p>}
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(false) }}
        placeholder="Add a note…"
        rows={2}
        className="w-full rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="mt-2 flex items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink">
          {NOTE_TYPES.map((t) => <option key={t} value={t}>{NOTE_TYPE_LABELS[t]}</option>)}
        </select>
        <Button size="sm" className="h-8 px-3 text-xs" onClick={submit} disabled={pending}>Save note</Button>
      </div>
    </div>
  )
}
