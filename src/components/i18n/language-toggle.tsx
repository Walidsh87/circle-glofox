'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from './locale-provider'
import { setLanguage } from '@/app/_actions/set-language'
import { LOCALES, type Locale } from '@/lib/i18n'

const LABEL: Record<Locale, string> = { en: 'EN', ar: 'عربي' }

export function LanguageToggle() {
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()

  function pick(next: Locale) {
    if (next === locale) return
    start(async () => { await setLanguage(next); router.refresh() })
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-line p-0.5 text-[11px] font-semibold" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => pick(l)}
          disabled={pending}
          aria-pressed={l === locale}
          className={l === locale ? 'rounded-md bg-accent px-2 py-0.5 text-accent-contrast' : 'rounded-md px-2 py-0.5 text-ink-3 hover:text-ink disabled:opacity-50'}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  )
}
