'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, fontFamily: 'var(--font-geist-sans)' }}>
      <div style={{ maxWidth: 420, textAlign: 'center', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '32px 28px', boxShadow: 'var(--c-shadow-sm)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 8 }}>Something went wrong</h2>
        <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginBottom: 20 }}>
          This section hit an error. It&rsquo;s been logged — try again, or refresh the page.
        </p>
        <button onClick={reset} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--c-ink)', color: 'var(--c-surface)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          Try again
        </button>
      </div>
    </div>
  )
}
