'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { previewImport, commitImport, type PreviewRow } from '../_actions/import-batch'
import { AiParsePanel } from './ai-parse-panel'

const PLACEHOLDER = `2026-07-01 For Time
Fran
21-15-9
Thrusters 42.5kg
Pull-ups

2026-07-02 AMRAP
Cindy
20 min AMRAP: 5 pull-ups / 10 push-ups / 15 squats`

const BADGE: Record<PreviewRow['status'], { bg: string; fg: string }> = {
  NEW: { bg: 'var(--circle-lime)', fg: 'var(--circle-ink)' },
  REPLACE: { bg: 'var(--c-surface-alt)', fg: 'var(--c-ink-2)' },
  BLOCKED: { bg: 'var(--c-surface-alt)', fg: 'var(--c-danger)' },
  INVALID: { bg: 'var(--c-surface-alt)', fg: 'var(--c-danger)' },
}

export function ImportForm() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const writable = (rows ?? []).filter((r) => r.status === 'NEW' || r.status === 'REPLACE').length

  function onPreview() {
    setErr(null); setDone(null)
    start(async () => {
      const res = await previewImport(text)
      if (res.error) { setErr(res.error); setRows(null); return }
      setRows(res.rows)
    })
  }

  function onImport() {
    setErr(null)
    start(async () => {
      const res = await commitImport(text)
      if (res.error) { setErr(res.error); return }
      setDone(res.written); setRows(res.rows)
    })
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Paste one day per block: a date line (optionally with scoring — For Time, AMRAP, Rounds + Reps, Load), then the title, then the workout. Separate days with a blank line.
      </p>

      <AiParsePanel onParsed={setText} />

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(null) }}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        style={{ width: '100%', minHeight: 240, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'var(--font-geist-mono, monospace)', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" disabled={pending || !text.trim()} onClick={onPreview} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 13, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {pending ? 'Working…' : 'Preview'}
        </button>
        {rows && writable > 0 && done === null && (
          <button type="button" disabled={pending} onClick={onImport} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', fontSize: 13, fontWeight: 700, color: 'var(--circle-ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Import {writable} day{writable === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {err && <p style={{ fontSize: 13, color: 'var(--c-danger)', marginTop: 12 }}>{err}</p>}

      {done !== null && (
        <p style={{ fontSize: 13, color: 'var(--c-ink)', marginTop: 14 }}>
          Imported {done} day{done === 1 ? '' : 's'}.{' '}
          <Link href="/dashboard/programming" style={{ color: 'var(--circle-lime-ink)', fontWeight: 600, textDecoration: 'none' }}>Back to calendar →</Link>
        </p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => {
            const b = BADGE[r.status]
            const showMsg = r.status === 'BLOCKED' || r.status === 'INVALID'
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', width: 92, flexShrink: 0 }}>{r.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || '—'}</span>
                  <span className="mono" style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 6, background: b.bg, color: b.fg, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>{r.status}</span>
                </div>
                {showMsg && <span style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', paddingLeft: 102 }}>{r.message}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
