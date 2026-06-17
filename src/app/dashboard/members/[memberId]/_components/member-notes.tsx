'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { NOTE_TYPES, NOTE_TYPE_LABELS } from '@/lib/member-notes'
import { addNote } from '../_actions/add-note'
import { deleteNote } from '../_actions/delete-note'

export type MemberNote = { id: string; note: string; note_type: string; created_by_name: string; created_at: string }

export function MemberNotes({ athleteId, notes, timeZone }: { athleteId: string; notes: MemberNote[]; timeZone: string }) {
  const [text, setText] = useState('')
  const [type, setType] = useState<string>('general')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => { const r = await fn(); if (r.error) alert(r.error) })
  const submit = () => { if (text.trim()) { const v = text; setText(''); run(() => addNote(athleteId, v, type)) } }
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  const label = (t: string) => NOTE_TYPE_LABELS[t as keyof typeof NOTE_TYPE_LABELS] ?? t

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note…"
          rows={2}
          className="w-full rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="flex items-center gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink">
            {NOTE_TYPES.map((t) => <option key={t} value={t}>{NOTE_TYPE_LABELS[t]}</option>)}
          </select>
          <Button size="sm" className="h-8 px-3 text-xs" onClick={submit} disabled={pending}>Add note</Button>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {notes.length === 0 && <li className="text-xs text-ink-3">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-line bg-surface-2 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono rounded bg-surface px-1.5 py-px text-[10px] uppercase text-ink-3">{label(n.note_type)}</span>
              <button onClick={() => run(() => deleteNote(n.id))} disabled={pending} aria-label="Delete note"
                className="text-[13px] leading-none text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">×</button>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-ink">{n.note}</p>
            <p className="mt-1 text-[11px] text-ink-3">{n.created_by_name} · {fmt.format(new Date(n.created_at))}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
