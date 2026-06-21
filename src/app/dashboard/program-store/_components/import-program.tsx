'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProgramBuilder } from '@/app/dashboard/members/[memberId]/_components/program-builder'
import { saveTemplate } from '@/app/dashboard/program-store/_actions/template'
import { parseProgramText } from '@/lib/program-import'
import type { ProgramInput } from '@/lib/program'

const EXAMPLE = `12-Week Squat Cycle
> Linear progression. Deload week 4.

Week 1
Day A — Lower
Back Squat 5x3 @80%
Romanian Deadlift 3x8
Plank 3x60 — hold

Day B — Upper
Bench Press 5x5 @75%
Pull-up 4xAMRAP`

const ta = 'h-72 w-full rounded-[14px] border border-line-strong bg-surface px-3 py-2.5 font-mono text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'
const limeBtn = 'rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90'

export function ImportProgram() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<{ input: ProgramInput; warnings: string[] } | null>(null)

  async function handleSave(_programId: string | null, input: ProgramInput) {
    const res = await saveTemplate(null, input)
    return { error: res.error, templateId: res.templateId, programId: res.templateId }
  }

  if (parsed) {
    return (
      <div className="flex flex-col gap-4">
        {parsed.warnings.length > 0 && (
          <div className="rounded-[14px] border border-warn-soft bg-warn-soft px-4 py-3 text-[12.5px] text-warn">
            <div className="mb-1 font-semibold">Review these before saving:</div>
            <ul className="list-disc pl-5">
              {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        <button type="button" className="self-start text-[12px] text-ink-3 underline" onClick={() => setParsed(null)}>
          ← Edit the pasted text
        </button>
        <ProgramBuilder
          athleteId=""
          initial={null}
          seed={parsed.input}
          showWeek
          onSave={handleSave}
          onCancel={() => router.push('/dashboard/program-store')}
        />
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-[13px] text-ink-2">
        Paste a program below, then review and save. Use <span className="font-mono">Week N</span> and{' '}
        <span className="font-mono">Day …</span> headers; each exercise line like{' '}
        <span className="font-mono">Back Squat 5x3 @80%</span> (a % auto-matches a lift for per-athlete loads).
      </p>
      <textarea className={ta} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} spellCheck={false} />
      <div className="flex items-center gap-3">
        <button type="button" className={limeBtn} disabled={!text.trim()} onClick={() => setParsed(parseProgramText(text))}>
          Parse → review
        </button>
        <button type="button" className="text-[12px] text-ink-3 underline" onClick={() => setText(EXAMPLE)}>
          Load example
        </button>
      </div>
    </div>
  )
}
