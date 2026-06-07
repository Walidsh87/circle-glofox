'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {note
          ? <span style={{ fontSize: 12.5, color: 'var(--c-ink-2)' }}>{note}</span>
          : <span style={{ fontSize: 12.5, color: 'var(--c-ink-faint)', fontStyle: 'italic' }}>No note</span>}
        <button type="button" onClick={() => { setValue(note); setEditing(true) }} style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Edit</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. bad shoulder — scale overhead"
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" disabled={pending} onClick={onSave} style={{ height: 28, padding: '0 12px', borderRadius: 7, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" disabled={pending} onClick={() => setEditing(false)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        {err && <span style={{ fontSize: 11.5, color: 'var(--c-danger)' }}>{err}</span>}
      </div>
    </div>
  )
}
