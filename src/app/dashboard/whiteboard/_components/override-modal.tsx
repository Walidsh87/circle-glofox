'use client'

import { useState, useTransition } from 'react'
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
  blockReason: 'unpaid' | 'no_membership'
  lastPaidDate: string | null
}) {
  const [selected, setSelected] = useState<Reason | null>(null)
  const [otherText, setOtherText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) return null

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

  const title = blockReason === 'unpaid' ? 'Payment overdue' : 'No active membership'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          borderRadius: 14, padding: 24,
          fontFamily: 'var(--font-geist-sans)',
          color: 'var(--c-ink)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 700 }}>
            {title}
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 4 }}>
          {athleteName}
        </div>
        {lastPaidDate && (
          <div style={{ fontSize: 12, color: 'var(--c-ink-faint)', marginBottom: 18 }}>
            Last paid: {new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}
        {!lastPaidDate && <div style={{ marginBottom: 18 }} />}

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
          Reason for override
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {PRESET_REASONS.map((r) => {
            const active = selected === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setSelected(r)}
                style={{
                  padding: '8px 12px', borderRadius: 999, fontSize: 12.5,
                  border: `1px solid ${active ? 'var(--circle-lime)' : 'var(--c-border)'}`,
                  background: active ? 'var(--c-surface-alt)' : 'var(--c-surface)',
                  color: active ? 'var(--circle-lime)' : 'var(--c-ink-2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
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
            style={{
              width: '100%', height: 40, padding: '0 12px', marginBottom: 14,
              background: 'var(--c-surface-alt)',
              border: '1px solid var(--c-border)',
              borderRadius: 8, fontSize: 13.5, color: 'var(--c-ink)',
              fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
            }}
          />
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--c-danger)', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              padding: '10px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
              background: 'transparent',
              border: '1px solid var(--c-border)',
              color: 'var(--c-ink-2)',
              cursor: pending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: '10px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 700,
              background: canSubmit ? 'var(--circle-lime)' : 'var(--c-surface-alt)',
              border: 'none',
              color: canSubmit ? 'var(--circle-ink)' : 'var(--c-ink-muted)',
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}
          >
            {pending ? 'Saving…' : 'Override & check in'}
          </button>
        </div>
      </div>
    </div>
  )
}
