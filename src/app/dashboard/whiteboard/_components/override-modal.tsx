'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { overrideCheckIn } from '../_actions/override-check-in'

const PRESET_REASONS = [
  'Card on file failed',
  'Pays today at desk',
  'New member — setup pending',
  'Other',
] as const

type Reason = typeof PRESET_REASONS[number]

export function OverrideModal({
  open,
  onClose,
  onSuccess,
  instanceId,
  athleteId,
  athleteName,
  blockReason,
  lastPaidDate,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  instanceId: string
  athleteId: string
  athleteName: string
  blockReason: 'unpaid' | 'no_membership' | 'frozen'
  lastPaidDate: string | null
}) {
  const [selected, setSelected] = useState<Reason | null>(null)
  const [otherText, setOtherText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const finalReason = selected === 'Other' ? otherText.trim() : (selected ?? '')
  const canSubmit = finalReason.length > 0 && !pending

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const { error: err } = await overrideCheckIn(instanceId, athleteId, finalReason)
      if (err) { setError(err); return }
      onSuccess()
      onClose()
    })
  }

  const title = blockReason === 'unpaid' ? 'Payment overdue' : blockReason === 'frozen' ? 'Membership frozen' : 'No active membership'

  return (
    <Dialog open={open} onClose={onClose} title={`⚠️ ${title}`}>
      <div className="text-[13px] text-ink-3">{athleteName}</div>
      {lastPaidDate && (
        <div className="mt-1 text-xs text-ink-faint">
          Last paid: {new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      )}

      <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
        Reason for override
      </div>
      <div className="mb-3.5 flex flex-wrap gap-2">
        {PRESET_REASONS.map((r) => {
          const active = selected === r
          return (
            <button
              key={r}
              type="button"
              onClick={() => setSelected(r)}
              className={cn(
                'rounded-full border px-3 py-2 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active ? 'border-accent bg-surface-2 text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong'
              )}
            >
              {r}
            </button>
          )
        })}
      </div>

      {selected === 'Other' && (
        <input
          type="text"
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          placeholder="Describe the reason"
          maxLength={200}
          className="mb-3.5 h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent"
        />
      )}

      {error && <div className="mb-3 text-xs text-danger">{error}</div>}

      <div className="flex justify-end gap-2.5">
        <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {pending ? 'Saving…' : 'Override & check in'}
        </Button>
      </div>
    </Dialog>
  )
}
