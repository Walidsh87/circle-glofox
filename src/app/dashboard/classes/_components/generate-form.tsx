'use client'

import { useState } from 'react'
import { generateInstances } from '../_actions/generate-instances'
import { Button } from '@/components/ui/button'

export function GenerateForm() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Default to today's date
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
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Start date</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <Button size="sm" onClick={handleGenerate} disabled={loading || !startDate}>
        {loading ? 'Generating...' : 'Generate 7 days'}
      </Button>
      {result && (
        <p className="text-sm text-gray-600">
          {result.created} instance{result.created !== 1 ? 's' : ''} created
          {result.skipped > 0 ? `, ${result.skipped} already existed` : ''}.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
