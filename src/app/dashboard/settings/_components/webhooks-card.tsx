'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { WEBHOOK_EVENTS } from '@/lib/webhooks/events'
import { createWebhook } from '../_actions/create-webhook'
import { deleteWebhook } from '../_actions/delete-webhook'

const btn =
  'h-9 rounded-lg border border-line-strong bg-surface px-3.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
const limeBtn =
  'h-9 rounded-lg bg-accent px-3.5 text-[12.5px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

// Friendly label for each dotted event name shown in the checkbox grid.
const EVENT_LABELS: Record<string, string> = {
  'booking.created': 'Booking created',
  'booking.cancelled': 'Booking cancelled',
  'member.created': 'Member created',
  'membership.created': 'Membership created',
  'membership.updated': 'Membership updated',
  'payment.succeeded': 'Payment succeeded',
  'payment.failed': 'Payment failed',
  'lead.created': 'Lead created',
  'workout_score.logged': 'Workout score logged',
  'invoice.created': 'Invoice created',
}

export type WebhookSubRow = {
  id: string
  url: string
  event_types: string[]
  active: boolean
  created_at: string
}

export function WebhooksCard({ subs }: { subs: WebhookSubRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [secret, setSecret] = useState<string | null>(null) // signing secret, shown once
  const [copied, setCopied] = useState(false)

  function toggle(e: string) {
    setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]))
  }
  function create() {
    start(async () => {
      const res = await createWebhook(url, events)
      if (res.error) { alert(res.error); return }
      setSecret(res.secret ?? null)
      setUrl('')
      setEvents([])
      router.refresh()
    })
  }
  function remove(id: string) {
    if (!confirm('Remove this webhook? Deliveries to it will stop immediately.')) return
    start(async () => {
      const res = await deleteWebhook(id)
      if (res.error) alert(res.error)
      router.refresh()
    })
  }

  const active = subs.filter((s) => s.active)

  return (
    <div className="mt-6 rounded-[14px] border border-line bg-surface px-[22px] py-5">
      <div className="text-sm font-semibold text-ink">Webhooks</div>
      <p className="mt-1 text-[12.5px] leading-normal text-ink-3">
        Get an HTTP POST to your endpoint when things happen in your gym. Each delivery is signed with a per-webhook secret (shown once below). See <code className="font-mono">/docs/api/webhooks.md</code> for the payload format and signature-verification recipe.
      </p>

      {/* show-once signing secret */}
      {secret && (
        <div className="mt-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5">
          <div className="text-[12px] font-bold text-accent-ink">Copy your signing secret now — you won&apos;t see it again.</div>
          <div className="mt-1.5 flex gap-2">
            <input readOnly value={secret} onFocus={(e) => e.target.select()} className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 font-mono text-[12px] text-ink-2 outline-none" />
            <button type="button" className={btn} onClick={() => { navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied' : 'Copy'}</button>
            <button type="button" className={btn} onClick={() => setSecret(null)}>Done</button>
          </div>
        </div>
      )}

      {/* existing subscriptions */}
      {active.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {active.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12px] text-ink">{s.url}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.event_types.map((e) => (
                    <span key={e} className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">{e}</span>
                  ))}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-3">Added {new Date(s.created_at).toLocaleDateString('en-GB')}</div>
              </div>
              <button type="button" className={btn} disabled={pending} onClick={() => remove(s.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      {/* create */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="text-[12.5px] font-semibold text-ink">Add a webhook</div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-server.com/webhooks/circle"
          maxLength={500}
          className="mt-2 h-9 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[12.5px] text-ink-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {WEBHOOK_EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-1.5 text-[12px] text-ink-2">
              <input type="checkbox" checked={events.includes(e)} onChange={() => toggle(e)} className="accent-accent" />
              {EVENT_LABELS[e] ?? e}
            </label>
          ))}
        </div>
        <button type="button" className={`${limeBtn} mt-3`} disabled={pending || !url.trim() || events.length === 0} onClick={create}>
          {pending ? 'Adding…' : 'Add webhook'}
        </button>
      </div>
    </div>
  )
}
