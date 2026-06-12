'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { sendSmsCampaign } from '../_actions/send-sms-campaign'
import { previewSmsAudience } from '../_actions/preview-sms-audience'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { smsSegments } from '@/lib/sms'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

const inputClass =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function SmsComposeForm({ tags, configured }: { tags: string[]; configured: boolean }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<Segment>('all')
  const [tag, setTag] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const seg = useMemo(() => smsSegments(body), [body])

  function refreshCount(nextStatus: Segment, nextTag: string) {
    start(async () => {
      const res = await previewSmsAudience(nextStatus, nextTag || null)
      setCount(res.error ? null : res.included ?? 0)
    })
  }

  function onSend() {
    setError(null)
    if (count !== null && !confirm(`Send to ${count} member${count === 1 ? '' : 's'}?`)) return
    start(async () => {
      const res = await sendSmsCampaign(body, status, tag || null)
      if (res.error) { setError(res.error); return }
      router.push(`/dashboard/sms/${res.campaignId}`)
    })
  }

  return (
    <Card className="mb-7 flex flex-col gap-3.5 p-4">
      {!configured && (
        <div className="rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
          SMS isn’t configured yet. Add your Twilio credentials + sender ID to send.
        </div>
      )}
      <textarea
        className={cn(inputClass, 'min-h-[120px] resize-y')}
        placeholder="Your message… Use {{first_name}} to personalise."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="font-mono text-[11.5px] text-ink-3">
        {seg.chars} chars · {seg.segments} segment{seg.segments === 1 ? '' : 's'} · {seg.encoding === 'gsm7' ? 'GSM-7' : 'Unicode'}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <select className={cn(inputClass, 'w-auto')} value={status} onChange={(e) => { const s = e.target.value as Segment; setStatus(s); refreshCount(s, tag) }}>
          {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
        </select>
        <select className={cn(inputClass, 'w-auto')} value={tag} onChange={(e) => { setTag(e.target.value); refreshCount(status, e.target.value) }}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="self-center text-[13px] text-ink-3">
          {count === null ? 'Choose an audience to preview count' : `${count} recipient${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}

      <Button onClick={onSend} disabled={pending || !configured || !body.trim()} className="self-start">
        {pending ? 'Sending…' : 'Send SMS'}
      </Button>
    </Card>
  )
}
