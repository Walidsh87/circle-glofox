'use client'

import { useState, useTransition } from 'react'
import { saveParqQuestions } from '../_actions/save-parq-questions'

export function ParqEditor({ initialText, version }: { initialText: string; version: number }) {
  const [text, setText] = useState(initialText)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>PAR-Q questions (one per line)</span>
        <span style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>current v{version}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setMsg(null) }}
        rows={9}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 12px',
          background: 'var(--c-bg)', border: '1px solid var(--c-border-strong)', borderRadius: 8,
          fontSize: 13, color: 'var(--c-ink-2)', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <button
          onClick={() => startTransition(async () => {
            const res = await saveParqQuestions(text)
            setMsg(res.error ?? 'Saved — every member will be asked to answer again.')
          })}
          disabled={pending}
          style={{
            padding: '8px 16px', background: 'var(--circle-lime)', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 700, color: 'var(--circle-ink)', cursor: pending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {pending ? 'Saving…' : 'Save questions'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>
          ⚠️ Saving changes bumps the version and re-prompts every member at next login.
        </span>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--c-ink-2)' }}>{msg}</div>}
    </div>
  )
}
