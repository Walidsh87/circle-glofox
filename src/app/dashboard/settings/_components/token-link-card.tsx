'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useCopy } from '@/hooks/use-copy'

const btn =
  'h-9 rounded-lg border border-line-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
const limeBtn =
  'h-9 rounded-lg bg-accent px-3.5 text-[12.5px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

type TokenAction = (action: 'generate' | 'disable') => Promise<{ error: string | null }>

/** Owner-managed secret-token link card (TV display, door check-in QR, …): shows the
 *  generated link with copy + regenerate/disable, or an enable button when no link is set.
 *  `extraLink` renders an extra accent button (e.g. "Print poster") beside the controls. */
export function TokenLinkCard({
  title,
  description,
  link,
  action,
  enableLabel,
  extraLink,
}: {
  title: string
  description: string
  link: string | null
  action: TokenAction
  enableLabel: string
  extraLink?: { href: string; label: string }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const { copied, copy } = useCopy()

  function act(verb: 'generate' | 'disable') {
    start(async () => {
      const res = await action(verb)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="mt-6 rounded-[14px] border border-line bg-surface px-[22px] py-5">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="mt-1 text-[12.5px] leading-normal text-ink-3">{description}</p>
      {link ? (
        <>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="h-9 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2.5 font-mono text-[12.5px] text-ink-2 outline-none"
            />
            <button type="button" onClick={() => copy(link)} className={btn}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="mt-2.5 flex gap-2">
            {extraLink && (
              <Link href={extraLink.href} className={cn(limeBtn, 'inline-flex items-center')}>{extraLink.label}</Link>
            )}
            <button type="button" disabled={pending} onClick={() => act('generate')} className={btn}>Regenerate</button>
            <button type="button" disabled={pending} onClick={() => act('disable')} className={cn(btn, 'text-danger hover:text-danger')}>Disable</button>
          </div>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => act('generate')} className={cn(limeBtn, 'mt-3')}>{enableLabel}</button>
      )}
    </div>
  )
}
