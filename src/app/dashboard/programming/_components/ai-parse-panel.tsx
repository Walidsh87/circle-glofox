'use client'

import { useState, useTransition } from 'react'
import { aiParseProgramming } from '../_actions/ai-parse-programming'

export function AiParsePanel({ onParsed }: { onParsed: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [freeform, setFreeform] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onParse() {
    setErr(null)
    start(async () => {
      const res = await aiParseProgramming(freeform)
      if (res.error || !res.text) { setErr(res.error ?? 'No output.'); return }
      onParsed(res.text)
      setFreeform('')
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ marginBottom: 12, height: 32, padding: '0 14px', borderRadius: 8, border: '1px dashed var(--c-border-strong)', background: 'var(--c-surface-alt)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
        ✨ Parse with AI
      </button>
    )
  }

  return (
    <div style={{ marginBottom: 14, padding: '14px 16px', borderRadius: 12, background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)' }}>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginBottom: 8, lineHeight: 1.5 }}>
        Paste a coach&apos;s week however it&apos;s written — AI structures it into the format below. Review and edit before importing.
      </p>
      <textarea
        value={freeform}
        onChange={(e) => setFreeform(e.target.value)}
        placeholder="Mon: Fran 21-15-9 thrusters/pullups. Tue: 20min AMRAP Cindy…"
        spellCheck={false}
        style={{ width: '100%', minHeight: 120, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button type="button" disabled={pending || !freeform.trim()} onClick={onParse} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', fontSize: 12.5, fontWeight: 700, color: 'var(--circle-ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {pending ? 'Parsing…' : '✨ Parse'}
        </button>
        <button type="button" disabled={pending} onClick={() => { setOpen(false); setErr(null) }} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
        {err && <span style={{ fontSize: 12, color: 'var(--c-danger)' }}>{err}</span>}
      </div>
    </div>
  )
}
