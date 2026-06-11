import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Standard scrollable page body. Includes the bottom-nav safe-area padding
 * that 15 dashboard pages currently miss; the legacy `c-scroll-area` class
 * keeps the existing mobile media-query overrides working until B3.
 */
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <main
      className={cn(
        'c-scroll-area min-h-screen flex-1 overflow-y-auto bg-canvas p-6 pb-24 md:pb-8',
        className
      )}
      {...props}
    />
  )
}
