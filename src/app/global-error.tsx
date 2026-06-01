'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body style={{ fontFamily: 'sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h2 style={{ color: '#111', fontSize: 20, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
            An unexpected error occurred. It has been logged. Please try again.
          </p>
          <button onClick={reset} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
