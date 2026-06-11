import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  )
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-line px-3 py-2.5 text-left font-mono text-xs font-medium uppercase tracking-[0.1em] text-ink-3',
        className
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line px-3 py-2.5 text-ink', className)} {...props} />
}
