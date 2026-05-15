'use client'

import { useState } from 'react'
import { generateInstances } from '../_actions/generate-instances'

export function GenerateForm() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(today)

  async function handleGenerate() {
    setLoading(true)
    setResult(null)
    setError(null)
    const res = await generateInstances(startDate)
    setLoading(false)
    if (res.error) {
      setError(res.error)
    } else {
      setResult({ created: res.created, skipped: res.skipped })
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Start date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{
            height: 34, padding: '0 10px',
            border: '1px solid var(--c-border-strong)', borderRadius: 8,
            background: 'var(--c-surface)', fontSize: 13, color: 'var(--c-ink)',
            fontFamily: 'inherit', outline: 'none',
          }}
        />
      </div>
      <button
        onClick={handleGenerate}
        disabled={loading || !startDate}
        style={{
          height: 34, padding: '0 16px',
          background: loading || !startDate ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
          border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 700, cursor: loading || !startDate ? 'not-allowed' : 'pointer',
          color: loading || !startDate ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
          fontFamily: 'inherit', transition: 'opacity 120ms',
        }}
      >
        {loading ? 'Generating…' : 'Generate 7 days'}
      </button>
      {result && (
        <span style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>
          {result.created} instance{result.created !== 1 ? 's' : ''} created
          {result.skipped > 0 ? `, ${result.skipped} already existed` : ''}.
        </span>
      )}
      {error && <span style={{ fontSize: 13, color: 'var(--c-danger)' }}>{error}</span>}
    </div>
  )
}
