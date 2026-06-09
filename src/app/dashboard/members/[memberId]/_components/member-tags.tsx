'use client'

import { useState, useTransition } from 'react'
import { addTag } from '../_actions/add-tag'
import { removeTag } from '../_actions/remove-tag'

const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'var(--c-surface-alt)', color: 'var(--c-ink-2)' }

export function MemberTags({ athleteId, tags, suggestions }: { athleteId: string; tags: string[]; suggestions: string[] }) {
  const [input, setInput] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error) })
  const submit = () => { if (input.trim()) { const v = input; setInput(''); run(() => addTag(athleteId, v)) } }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {tags.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No tags yet.</span>}
      {tags.map((t) => (
        <span key={t} style={chip}>
          {t}
          <button onClick={() => run(() => removeTag(athleteId, t))} disabled={pending} aria-label={`Remove ${t}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-ink-muted)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <input
        list="member-tag-suggestions"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Add tag…"
        style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit', width: 140 }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
      />
      <datalist id="member-tag-suggestions">
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
      <button onClick={submit} disabled={pending} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
    </div>
  )
}
