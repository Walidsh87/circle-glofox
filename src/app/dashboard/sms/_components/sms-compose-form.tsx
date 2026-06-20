'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { sendSmsCampaign } from '../_actions/send-sms-campaign'
import { previewSmsAudience } from '../_actions/preview-sms-audience'
import type { Segment } from '@/lib/broadcast-audience'
import { smsSegments } from '@/lib/sms'
import { AudiencePicker } from '@/app/dashboard/_components/audience-picker'

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

      <AudiencePicker
        status={status}
        tag={tag}
        tags={tags}
        count={count}
        selectClassName={cn(inputClass, 'w-auto')}
        onStatusChange={(s) => { setStatus(s); refreshCount(s, tag) }}
        onTagChange={(t) => { setTag(t); refreshCount(status, t) }}
      />

      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}

      <Button onClick={onSend} disabled={pending || !configured || !body.trim()} className="self-start">
        {pending ? 'Sending…' : 'Send SMS'}
      </Button>
    </Card>
  )
}
