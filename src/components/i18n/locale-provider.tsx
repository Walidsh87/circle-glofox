'use client'

import { createContext, useContext, useMemo } from 'react'
import { makeT, type Locale, type Messages, type TFn } from '@/lib/i18n'

// Props are server-authoritative. The provider NEVER re-reads document.cookie
// or defaults to 'en' on mount — that re-derivation is the only real hydration
// mismatch vector (suppressHydrationWarning must stay theme-only in intent).
const LocaleContext = createContext<{ locale: Locale; messages: Messages } | null>(null)

export function LocaleProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

function useCtx() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useT/useLocale must be used within LocaleProvider')
  return ctx
}

export function useLocale(): Locale {
  return useCtx().locale
}

export function useT(): TFn {
  const { messages } = useCtx()
  return useMemo(() => makeT(messages), [messages])
}
