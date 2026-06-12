'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { setCheckinToken } from '../_actions/set-checkin-token'

const btn =
  'h-9 rounded-lg border border-line-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
const limeBtn =
  'h-9 rounded-lg bg-accent px-3.5 text-[12.5px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

export function CheckinQrCard({ link }: { link: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)

  function act(action: 'generate' | 'disable') {
    start(async () => {
      const res = await setCheckinToken(action)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }
  function copy() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-6 rounded-[14px] border border-line bg-surface px-[22px] py-5">
      <div className="text-sm font-semibold text-ink">Door check-in QR</div>
      <p className="mt-1 text-[12.5px] leading-normal text-ink-3">
        Members scan a printed QR at the door to check themselves into booked classes (opens 60 min before class). Regenerate to invalidate old posters and shared links.
      </p>
      {link ? (
        <>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="h-9 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2.5 font-mono text-[12.5px] text-ink-2 outline-none"
            />
            <button type="button" onClick={copy} className={btn}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="mt-2.5 flex gap-2">
            <Link href="/dashboard/settings/checkin-poster" className={cn(limeBtn, 'inline-flex items-center')}>Print poster</Link>
            <button type="button" disabled={pending} onClick={() => act('generate')} className={btn}>Regenerate</button>
            <button type="button" disabled={pending} onClick={() => act('disable')} className={cn(btn, 'text-danger hover:text-danger')}>Disable</button>
          </div>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => act('generate')} className={cn(limeBtn, 'mt-3')}>Enable door check-in</button>
      )}
    </div>
  )
}
