'use client'

import { useState, useTransition } from 'react'
import { saveParqQuestions } from '../_actions/save-parq-questions'

export function ParqEditor({ initialText, version }: { initialText: string; version: number }) {
  const [text, setText] = useState(initialText)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="mb-5 rounded-[14px] border border-line bg-surface px-5 py-[18px]">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">PAR-Q questions (one per line)</span>
        <span className="text-[11px] text-ink-3">current v{version}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setMsg(null) }}
        rows={9}
        className="w-full resize-y rounded-lg border border-line-strong bg-canvas px-3 py-2.5 text-[13px] leading-relaxed text-ink-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="mt-2.5 flex items-center gap-3">
        <button
          onClick={() => startTransition(async () => {
            const res = await saveParqQuestions(text)
            setMsg(res.error ?? 'Saved — every member will be asked to answer again.')
          })}
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save questions'}
        </button>
        <span className="text-xs text-ink-3">
          ⚠️ Saving changes bumps the version and re-prompts every member at next login.
        </span>
      </div>
      {msg && <div className="mt-2 text-[12.5px] text-ink-2">{msg}</div>}
    </div>
  )
}
