'use client'

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body style={{ fontFamily: 'sans-serif', padding: 40 }}>
        <h2 style={{ color: '#c00' }}>Something went wrong</h2>
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 13 }}>
          {error?.message}
          {'\n'}
          {error?.stack}
        </pre>
        <button onClick={reset} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
          Try again
        </button>
      </body>
    </html>
  )
}
