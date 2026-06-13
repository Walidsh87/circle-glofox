'use client'

import * as React from 'react'
import { CircleMark } from '@/components/circle-mark'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useT } from '@/components/i18n/locale-provider'

/** Split-screen auth shell: form column (always) + brand panel (lg and up). */
export function AuthLayout({
  children,
  panel,
  headerExtra,
}: {
  children: React.ReactNode
  panel: React.ReactNode
  headerExtra?: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-2">
      {/* Left — form column */}
      <section className="flex flex-col justify-between gap-10 px-6 py-7 sm:px-12 lg:px-16 lg:py-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <CircleMark size={24} />
            <span>Circle</span>
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            <ThemeToggle />
          </div>
        </header>

        <div className="w-full max-w-sm">{children}</div>

        <footer className="flex items-center justify-between text-xs text-ink-3">
          <div className="font-mono">{t('login.copyright')}</div>
          <div className="flex gap-3.5">
            <span>{t('login.footerPrivacy')}</span>
            <span>{t('login.footerTerms')}</span>
          </div>
        </footer>
      </section>

      {/* Right — brand panel (desktop only) */}
      <aside className="hidden lg:block">{panel}</aside>
    </div>
  )
}

/**
 * The dark brand panel. Deliberately NOT themeable: near-black with lime in
 * both modes (brand canvas, like the sidebar gym tile). Fraunces headline.
 */
export function BrandPanel({
  eyebrow,
  headline,
  detail,
  description,
  footerNote,
}: {
  eyebrow: string
  headline: React.ReactNode
  detail?: React.ReactNode
  description: string
  footerNote: string
}) {
  const t = useT()
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-[#0A0A0A] p-12 text-[#FAFAFA]">
      {/* Decorative rings + barbell bar */}
      <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full border-2 border-[#C8F135] opacity-35" />
      <div className="absolute -bottom-44 -right-20 h-[360px] w-[360px] rounded-full border-2 border-[#C8F135] opacity-20" />
      <div className="absolute right-20 top-20 h-[380px] w-1.5 rotate-[20deg] bg-[#B0B0B0] opacity-25" />

      <div className="relative flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#FAFAFA]/55">
          {eyebrow}
        </div>
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C8F135]">
          GCC
        </div>
      </div>

      <div className="relative">
        <div className="break-words font-display text-6xl font-semibold leading-[0.98] tracking-[-0.02em] text-[#C8F135] xl:text-7xl">
          {headline}
        </div>
        {detail && (
          <div className="mt-5 font-mono text-[15px] leading-[1.7] tracking-[0.02em] text-[#FAFAFA]/75">
            {detail}
          </div>
        )}
        <div className="my-6 h-px w-9 bg-[#C8F135]" />
        <div className="max-w-sm font-display text-lg font-medium leading-snug tracking-[-0.01em]">
          {description}
        </div>
      </div>

      <div className="relative flex items-center gap-4 text-xs text-[#FAFAFA]/60">
        <div className="flex items-center gap-2">
          <span className="c-pulse h-[7px] w-[7px] shrink-0 rounded-full bg-[#C8F135]" />
          <span className="font-mono uppercase tracking-[0.06em]">{t('login.livePlatform')}</span>
        </div>
        <div className="h-3.5 w-px bg-[#333]" />
        <span className="font-mono">{footerNote}</span>
      </div>
    </div>
  )
}
