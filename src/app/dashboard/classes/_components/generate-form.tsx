'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { generateInstances } from '../_actions/generate-instances'

export function GenerateForm() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; ramadanGap: boolean } | null>(null)
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
      setResult({ created: res.created, skipped: res.skipped, ramadanGap: res.ramadanGap })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-[13px] text-ink-3">Start date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>
      <Button size="sm" onClick={handleGenerate} disabled={loading || !startDate}>
        {loading ? 'Generating…' : 'Generate 7 days'}
      </Button>
      {result && (
        <span className="text-[13px] text-ink-3">
          {result.created} instance{result.created !== 1 ? 's' : ''} created
          {result.skipped > 0 ? `, ${result.skipped} already existed` : ''}.
        </span>
      )}
      {result?.ramadanGap && (
        <span role="alert" className="text-[13px] text-warn">
          Ramadan window is active but you haven&apos;t built a Ramadan schedule — those days generated nothing.
        </span>
      )}
      {error && <span role="alert" className="text-[13px] text-danger">{error}</span>}
    </div>
  )
}
