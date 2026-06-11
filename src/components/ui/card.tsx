import * as React from 'react'
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
  className,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: 'up' | 'down' | 'neutral'
  className?: string
}) {
  const toneClass =
    tone === 'up' ? 'text-accent-ink' : tone === 'down' ? 'text-danger' : 'text-ink-3'
  return (
    <Card className={cn('p-4', className)}>
      <div className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-ink">{value}</div>
      {sub && <div className={cn('mt-0.5 text-xs font-semibold', toneClass)}>{sub}</div>}
    </Card>
  )
}
