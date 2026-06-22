'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { postDebrief } from '../_actions/debrief'

export function DebriefComposer() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [body, setBody] = useState('')

  function post() {
    start(async () => {
      const res = await postDebrief(body)
      if (res.error) { alert(res.error); return }
      setBody(''); router.refresh()
    })
  }

  return (
    <div className="rounded-[14px] border border-line bg-surface p-3.5 shadow-card">
      <textarea
        className="h-20 w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
        placeholder="Post a class recap — what the class hit today, shout-outs…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={pending || !body.trim()}
          onClick={post}
        >
          {pending ? 'Posting…' : 'Post recap'}
        </button>
      </div>
    </div>
  )
}
