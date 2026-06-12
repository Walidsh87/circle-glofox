'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-10">
      <div className="max-w-[420px] rounded-[14px] border border-line bg-surface px-7 py-8 text-center shadow-card">
        <h2 className="mb-2 text-lg font-semibold text-ink">Something went wrong</h2>
        <p className="mb-5 text-sm text-ink-3">
          This page hit an error. It&rsquo;s been logged — try again, or refresh the page.
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-canvas transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
