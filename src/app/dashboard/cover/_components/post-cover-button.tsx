'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { postSubRequest } from '../_actions/post-sub-request'

export function PostCoverButton({ instanceId }: { instanceId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () => start(async () => {
    setError(null)
    const r = await postSubRequest(instanceId, note)
    if (r.error) setError(r.error)
    else { setOpen(false); setNote(''); router.refresh() }
  })

  if (!open) return <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setOpen(true)}>Need cover</Button>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" aria-label="Cover note"
        className="h-7 min-w-[140px] rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink placeholder:text-ink-faint" />
      <Button size="sm" className="h-7 px-2.5 text-xs" disabled={pending} onClick={submit}>Post</Button>
      <button onClick={() => { setOpen(false); setError(null) }} className="text-xs text-ink-3">Cancel</button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
