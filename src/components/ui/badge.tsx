import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
  {
    variants: {
      tone: {
        ok: 'bg-ok-soft text-ok',
        warn: 'bg-warn-soft text-warn',
        danger: 'bg-danger-soft text-danger',
        accent: 'bg-accent-soft text-accent-ink',
        neutral: 'bg-surface-2 text-ink-2 border border-line',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ tone, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
