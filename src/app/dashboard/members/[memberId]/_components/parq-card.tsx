'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { markParqReviewed } from '../_actions/mark-parq-reviewed'

type Props = {
  athleteId: string
  response: {
    parqVersion: number
    signedAt: string
    hasYes: boolean
    reviewedAt: string | null
    reviewedByName: string | null
  } | null
  flagged: string[]
  currentVersion: number
}

export function ParqCard({ athleteId, response, flagged, currentVersion }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!response) {
    return <div className="text-[13px] text-ink-3">Not completed — they will be prompted at their next login.</div>
  }

  const stale = response.parqVersion < currentVersion

  return (
    <div>
      <div className="text-[13px] text-ink-2">
        Completed v{response.parqVersion} · {response.signedAt.slice(0, 10)}
        {stale && <span className="ml-2 text-xs text-ink-3">(questions updated since — current v{currentVersion})</span>}
      </div>

      {response.hasYes ? (
        <div className="mt-2.5 rounded-lg bg-warn-soft px-3 py-2.5">
          <div className="text-[13px] font-semibold text-warn">⚠️ Flagged — answered YES to:</div>
          <ul className="mt-1.5 list-disc pl-5 text-xs leading-relaxed text-warn">
            {flagged.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
          {response.reviewedAt ? (
            <div className="mt-2 text-xs text-ink-2">
              Reviewed by {response.reviewedByName ?? 'Staff'} · {response.reviewedAt.slice(0, 10)}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await markParqReviewed(athleteId)
                setError(res.error)
              })}
            >
              {pending ? 'Saving…' : 'Mark reviewed'}
            </Button>
          )}
          {error && <div className="mt-1.5 text-xs text-danger">{error}</div>}
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-ink-3">No flags — all questions answered No.</div>
      )}
    </div>
  )
}
