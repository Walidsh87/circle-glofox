import * as React from 'react'
import { Sidebar } from '@/components/sidebar'
import { LanguageToggle } from '@/components/i18n/language-toggle'

/**
 * The standard dashboard page chrome — replaces the byte-identical wrapper
 * copy-pasted into 48 page.tsx files. Pages render ONLY their content as
 * children; stacking/spacing inside is the page's own concern.
 */
export function DashboardShell({
  active,
  userName,
  userRole,
  boxName,
  title,
  actions,
  children,
}: {
  active: string
  userName: string | null
  userRole: string
  boxName: string
  title: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar active={active} userName={userName} userRole={userRole} boxName={boxName} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5 md:px-8">
          <h1 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h1>
          {(userRole === 'athlete' || actions) && (
            <div className="flex shrink-0 items-center gap-2">
              {userRole === 'athlete' && <LanguageToggle />}
              {actions}
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-5 pb-24 md:p-8 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  )
}
