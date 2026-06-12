'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { addTag } from '../_actions/add-tag'
import { removeTag } from '../_actions/remove-tag'

export function MemberTags({ athleteId, tags, suggestions }: { athleteId: string; tags: string[]; suggestions: string[] }) {
  const [input, setInput] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error) })
  const submit = () => { if (input.trim()) { const v = input; setInput(''); run(() => addTag(athleteId, v)) } }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.length === 0 && <span className="text-xs text-ink-3">No tags yet.</span>}
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2"
        >
          {t}
          <button
            onClick={() => run(() => removeTag(athleteId, t))}
            disabled={pending}
            aria-label={`Remove ${t}`}
            className="p-0 text-[13px] leading-none text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >×</button>
        </span>
      ))}
      <input
        list="member-tag-suggestions"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Add tag…"
        className="h-8 w-[140px] rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
      />
      <datalist id="member-tag-suggestions">
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
      <Button size="sm" className="h-8 px-3 text-xs" onClick={submit} disabled={pending}>
        Add
      </Button>
    </div>
  )
}
