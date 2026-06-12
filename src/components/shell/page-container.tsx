import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Standard scrollable page body. Includes the bottom-nav safe-area padding
 * that 15 dashboard pages currently miss.
 */
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <main
      className={cn(
        'min-h-screen flex-1 overflow-y-auto bg-canvas p-4 pb-24 md:p-6 md:pb-8',
        className
      )}
      {...props}
    />
  )
}
