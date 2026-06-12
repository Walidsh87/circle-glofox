import Link from 'next/link'
import { cn } from '@/lib/utils'

export type TabItem = { key: string; label: string; href: string; count?: number }

export function TabNav({ tabs, active }: { tabs: TabItem[]; active: string }) {
  return (
    <nav className="flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              on
                ? 'border-accent font-semibold text-ink'
                : 'border-transparent font-medium text-ink-2 hover:text-ink'
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[11px]',
                  on ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-3'
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
