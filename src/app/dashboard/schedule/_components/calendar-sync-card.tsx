'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useCopy } from '@/hooks/use-copy'
import { setCalendarToken } from '../_actions/set-calendar-token'

const btn =
  'h-8 rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

export function CalendarSyncCard({ feedUrl }: { feedUrl: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const { copied, copy } = useCopy()

  function act(action: 'generate' | 'disable') {
    start(async () => {
      const res = await setCalendarToken(action)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }

  return (
    <details className="mb-5 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink">📅 Sync to your calendar</summary>
      <div className="mt-2.5">
        <p className="mb-2.5 text-xs leading-normal text-ink-3">
          Subscribe once and your booked classes appear in Google, Apple, or Outlook — cancellations disappear automatically. Keep the link private; regenerate to revoke it.
        </p>
        {feedUrl ? (
          <>
            <div className="flex gap-2">
              <input
                readOnly
                value={feedUrl}
                onFocus={(e) => e.target.select()}
                className="h-8 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2.5 font-mono text-[11.5px] text-ink-2 outline-none"
              />
              <button type="button" onClick={() => copy(feedUrl)} className={btn}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" disabled={pending} onClick={() => act('generate')} className={btn}>Regenerate</button>
              <button type="button" disabled={pending} onClick={() => act('disable')} className={cn(btn, 'text-danger hover:text-danger')}>Disable</button>
              <span className="text-[11.5px] text-ink-3">Calendar app → add calendar → “From URL”.</span>
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => act('generate')}
            className="h-8 rounded-lg bg-accent px-3 text-xs font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            Enable calendar feed
          </button>
        )}
      </div>
    </details>
  )
}
