'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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

const BADGE_CLASS: Record<PreviewRow['status'], string> = {
  NEW: 'bg-accent text-accent-contrast',
  REPLACE: 'bg-surface-2 text-ink-2',
  BLOCKED: 'bg-surface-2 text-danger',
  INVALID: 'bg-surface-2 text-danger',
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
    <div className="max-w-3xl">
      <p className="mb-3 text-[13px] leading-normal text-ink-3">
        Paste one day per block: a date line (optionally with scoring — For Time, AMRAP, Rounds + Reps, Load), then the title, then the workout. Separate days with a blank line.
      </p>

      <AiParsePanel onParsed={setText} />

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(null) }}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        className="min-h-[240px] w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-3 font-mono text-[13px] leading-normal text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending || !text.trim()} onClick={onPreview}>
          {pending ? 'Working…' : 'Preview'}
        </Button>
        {rows && writable > 0 && done === null && (
          <Button type="button" size="sm" disabled={pending} onClick={onImport}>
            Import {writable} day{writable === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      {err && <p role="alert" className="mt-3 text-[13px] text-danger">{err}</p>}

      {done !== null && (
        <p className="mt-3.5 text-[13px] text-ink">
          Imported {done} day{done === 1 ? '' : 's'}.{' '}
          <Link href="/dashboard/programming" className="font-semibold text-accent-ink transition-colors hover:text-ink">
            Back to calendar →
          </Link>
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          {rows.map((r, i) => {
            const showMsg = r.status === 'BLOCKED' || r.status === 'INVALID'
            return (
              <Card key={i} className="flex flex-col gap-1 px-3.5 py-2.5 shadow-none">
                <div className="flex items-center gap-2.5">
                  <span className="w-[92px] shrink-0 font-mono text-xs text-ink-3">{r.date}</span>
                  <span className="flex-1 truncate text-[13px] font-semibold text-ink">{r.title || '—'}</span>
                  <span className={cn('shrink-0 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase', BADGE_CLASS[r.status])}>
                    {r.status}
                  </span>
                </div>
                {showMsg && <span className="pl-[102px] text-[11.5px] text-ink-3">{r.message}</span>}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
