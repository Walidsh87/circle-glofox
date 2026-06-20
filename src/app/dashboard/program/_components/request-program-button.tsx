'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestProgram } from '@/app/dashboard/members/[memberId]/_actions/request-program'
import { PROGRAM_FOCUSES } from '@/lib/program-request'

const btn = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const limeBtn = 'rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50'
const input = 'h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function RequestProgramButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [focus, setFocus] = useState<string>(PROGRAM_FOCUSES[0])
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    start(async () => {
      const res = await requestProgram(focus, note)
      if (res.error) { alert(res.error); return }
      setOpen(false)
      setDone(true)
      router.refresh()
    })
  }

  if (done) return <span className="text-[12.5px] font-semibold text-accent-ink">Request sent ✓</span>
  if (!open) return <button type="button" className={btn} onClick={() => setOpen(true)}>Request a program</button>

  return (
    <div className="flex w-full max-w-sm flex-col gap-2 rounded-[12px] border border-line bg-surface-2 px-3 py-3">
      <div className="text-[12px] font-semibold text-ink">Ask your coach for a program</div>
      <select className={input} value={focus} onChange={(e) => setFocus(e.target.value)}>
        {PROGRAM_FOCUSES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <input className={input} placeholder="Anything specific? (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" className={limeBtn} disabled={pending} onClick={submit}>{pending ? 'Sending…' : 'Send request'}</button>
        <button type="button" className={btn} disabled={pending} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}
