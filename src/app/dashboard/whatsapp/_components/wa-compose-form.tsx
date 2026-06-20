'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { sendWaCampaign } from '../_actions/send-wa-campaign'
import { previewSmsAudience } from '@/app/dashboard/sms/_actions/preview-sms-audience'
import type { Segment } from '@/lib/broadcast-audience'
import type { WaTemplate } from './wa-templates-manager'
import { AudiencePicker } from '@/app/dashboard/_components/audience-picker'

const inputClass =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function WaComposeForm({ templates, tags, configured }: { templates: WaTemplate[]; tags: string[]; configured: boolean }) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Segment>('all')
  const [tag, setTag] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId])
  const slots = useMemo(() => Array.from({ length: template?.var_count ?? 0 }, (_, i) => String(i + 1)), [template])

  function refreshCount(nextStatus: Segment, nextTag: string) {
    start(async () => {
      const res = await previewSmsAudience(nextStatus, nextTag || null)
      setCount(res.error ? null : res.included ?? 0)
    })
  }

  function onSend() {
    setError(null)
    if (!template) { setError('Choose a template.'); return }
    if (count !== null && !confirm(`Send to ${count} member${count === 1 ? '' : 's'}?`)) return
    start(async () => {
      const res = await sendWaCampaign(templateId, varValues, status, tag || null)
      if (res.error) { setError(res.error); return }
      router.push(`/dashboard/whatsapp/${res.campaignId}`)
    })
  }

  if (templates.length === 0) {
    return <p className="mb-7 text-sm text-ink-3">Add a template above before composing a campaign.</p>
  }

  return (
    <Card className="mb-7 flex flex-col gap-3.5 p-4">
      {!configured && (
        <div className="rounded-lg bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
          WhatsApp isn’t configured yet. Add your Twilio WhatsApp sender to send.
        </div>
      )}
      <select className={inputClass} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setVarValues({}) }}>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {template && (
        <div className="whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 text-[13px] text-ink-3">
          {template.body_preview}
        </div>
      )}
      {slots.map((slot) => (
        <div key={slot} className="flex flex-col gap-1">
          <label className="font-mono text-[11.5px] text-ink-3">{`{{${slot}}}`}</label>
          <div className="flex gap-2">
            <input className={inputClass} value={varValues[slot] ?? ''} onChange={(e) => setVarValues((v) => ({ ...v, [slot]: e.target.value }))} placeholder="Value or {{first_name}}" />
            <button
              type="button"
              onClick={() => setVarValues((v) => ({ ...v, [slot]: (v[slot] ?? '') + '{{first_name}}' }))}
              className="whitespace-nowrap rounded-lg border border-line bg-transparent px-3 text-xs text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              + name
            </button>
          </div>
        </div>
      ))}

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

      <Button onClick={onSend} disabled={pending || !configured || !templateId} className="self-start">
        {pending ? 'Sending…' : 'Send WhatsApp'}
      </Button>
    </Card>
  )
}
