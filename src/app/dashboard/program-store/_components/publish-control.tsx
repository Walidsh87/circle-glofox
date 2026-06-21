'use client'

import { useState, useTransition } from 'react'
import { publishTemplate, unpublishTemplate } from '../_actions/template'

export function PublishControl({
  templateId,
  published,
  priceAed,
}: {
  templateId: string
  published: boolean
  priceAed: number | null
}) {
  const [pending, start] = useTransition()
  const [price, setPrice] = useState<string>(priceAed != null ? String(priceAed) : '')
  const [err, setErr] = useState<string | null>(null)

  function handlePublish() {
    setErr(null)
    const parsed = parseInt(price, 10)
    start(async () => {
      const res = await publishTemplate(templateId, parsed)
      if (res.error) setErr(res.error)
    })
  }

  function handleUnpublish() {
    setErr(null)
    start(async () => {
      const res = await unpublishTemplate(templateId)
      if (res.error) setErr(res.error)
    })
  }

  const input = 'h-8 rounded-lg border border-line-strong bg-surface px-2 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'
  const limeBtn = 'rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50'
  const dangerBtn = 'rounded-lg border border-danger-soft bg-danger-soft px-3.5 py-2 text-[13px] font-semibold text-danger transition-opacity hover:opacity-90 disabled:opacity-50'

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-4 py-4">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">
        Publish &amp; Pricing
      </div>
      {published ? (
        <div className="flex items-center gap-3">
          <span className="rounded bg-accent-soft px-1.5 py-px font-mono text-[10px] font-semibold text-accent-ink">
            Published · AED {priceAed}
          </span>
          <button type="button" className={dangerBtn} disabled={pending} onClick={handleUnpublish}>
            {pending ? 'Saving…' : 'Unpublish'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            Price (AED)
            <input
              className={`${input} w-24`}
              type="number"
              min={1}
              step={1}
              placeholder="e.g. 299"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <button type="button" className={limeBtn} disabled={pending} onClick={handlePublish}>
            {pending ? 'Saving…' : 'Publish'}
          </button>
        </div>
      )}
      {err && <p className="text-[12px] text-danger">{err}</p>}
    </div>
  )
}

