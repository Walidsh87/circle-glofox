'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 rounded-lg border border-dashed border-line-strong bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        ✨ Parse with AI
      </button>
    )
  }

  return (
    <div className="mb-3.5 rounded-xl border border-line bg-surface-2 px-4 py-3.5">
      <p className="mb-2 text-xs leading-relaxed text-ink-3">
        Paste a coach&apos;s week however it&apos;s written — AI structures it into the format below. Review and edit before importing.
      </p>
      <textarea
        value={freeform}
        onChange={(e) => setFreeform(e.target.value)}
        placeholder="Mon: Fran 21-15-9 thrusters/pullups. Tue: 20min AMRAP Cindy…"
        spellCheck={false}
        className="min-h-[120px] w-full resize-y rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending || !freeform.trim()} onClick={onParse}>
          {pending ? 'Parsing…' : '✨ Parse'}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => { setOpen(false); setErr(null) }}>
          Cancel
        </Button>
        {err && <span role="alert" className="text-xs text-danger">{err}</span>}
      </div>
    </div>
  )
}
