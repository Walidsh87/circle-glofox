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
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: 'up' | 'down' | 'neutral'
  fill?: 'warn' | 'accent'
  href?: string
  className?: string
}) {
  const toneClass =
    tone === 'up' ? 'text-accent-ink' : tone === 'down' ? 'text-danger' : 'text-ink-3'
  const labelClass = fill === 'warn' ? 'text-warn' : fill === 'accent' ? 'text-accent-ink' : 'text-ink-3'
  const valueClass = fill === 'warn' ? 'text-warn' : fill === 'accent' ? 'text-accent-ink' : 'text-ink'
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
