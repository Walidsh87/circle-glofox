'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-2">
        This page hit an error. It&rsquo;s been logged — try again, or refresh the page.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
