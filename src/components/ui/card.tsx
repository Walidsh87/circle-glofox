import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-line bg-surface shadow-card', className)}
      {...props}
    />
  )
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  fill,
  href,
  className,
  compact = false,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: 'up' | 'down' | 'neutral'
  fill?: 'warn' | 'accent'
  href?: string
  className?: string
  /** Denser variant used on the dashboard-home 6-up grid: 11px radius, 10px label, 21px value. */
  compact?: boolean
}) {
  const toneClass =
    tone === 'up' ? 'text-accent-ink' : tone === 'down' ? 'text-danger' : 'text-ink-3'
  const labelClass = fill === 'warn' ? 'text-warn' : fill === 'accent' ? 'text-accent-ink' : 'text-ink-3'
  const valueClass = fill === 'warn' ? 'text-warn' : fill === 'accent' ? 'text-accent-ink' : 'text-ink'

  if (compact) {
    // Built as a plain div (not <Card>) so fill variants deterministically drop the
    // base shadow — twMerge won't reconcile the custom `shadow-card` against `shadow-none`.
    const body = (
      <div
        className={cn(
          'flex flex-col gap-1.5 rounded-[11px] border border-line px-3.5 py-[13px] transition-colors hover:border-line-strong',
          fill === 'warn' ? 'bg-warn-soft' : fill === 'accent' ? 'bg-accent-soft' : 'bg-surface shadow-card',
          className
        )}
      >
        <div className={cn('font-mono text-[10px] uppercase tracking-[0.08em]', labelClass)}>{label}</div>
        <div className={cn('text-[21px] font-bold tracking-[-0.01em]', valueClass)}>{value}</div>
        {sub && <div className={cn('text-xs font-semibold', toneClass)}>{sub}</div>}
      </div>
    )
    return href ? (
      <Link
        href={href}
        className="block rounded-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {body}
      </Link>
    ) : body
  }

  const body = (
    <Card
      className={cn(
        'p-4',
        fill === 'warn' && 'border-transparent bg-warn-soft',
        fill === 'accent' && 'border-transparent bg-accent-soft',
        className
      )}
    >
      <div className={cn('font-mono text-xs uppercase tracking-[0.12em]', labelClass)}>{label}</div>
      <div className={cn('mt-1 font-display text-2xl font-semibold', valueClass)}>{value}</div>
      {sub && <div className={cn('mt-0.5 text-xs font-semibold', toneClass)}>{sub}</div>}
    </Card>
  )
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {body}
      </Link>
    )
  }
  return body
}
