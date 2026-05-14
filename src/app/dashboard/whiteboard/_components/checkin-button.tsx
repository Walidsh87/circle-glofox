'use client'

import { useState } from 'react'
import { checkIn } from '../_actions/check-in'

export function CheckInButton({
  instanceId,
  athleteId,
  athleteName,
  checkedIn,
}: {
  instanceId: string
  athleteId: string
  athleteName: string
  checkedIn: boolean
}) {
  const [done, setDone] = useState(checkedIn)
  const [loading, setLoading] = useState(false)

  async function handleTap() {
    if (done) return
    setLoading(true)
    const { error } = await checkIn(instanceId, athleteId)
    if (error) alert(error)
    else setDone(true)
    setLoading(false)
  }

  return (
    <button
      onClick={handleTap}
      disabled={loading || done}
      className={`
        w-full rounded-xl px-4 py-4 text-left font-semibold text-base transition-colors
        ${done
          ? 'bg-green-100 text-green-700 cursor-default'
          : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800'}
      `}
    >
      <span className="flex items-center gap-3">
        {done && <span className="text-green-500">✓</span>}
        {athleteName}
        {loading && <span className="text-xs text-gray-400 ml-auto">...</span>}
      </span>
    </button>
  )
}
