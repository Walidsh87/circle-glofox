'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { saveAutomation, type AutomationChannel } from '../_actions/save-automation'
import { TRIGGER_OPTIONS } from '../_lib/automation-copy'
import { BlockEditor } from '@/app/dashboard/broadcasts/_components/block-editor'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'

export type WaTemplateOption = { id: string; name: string; body_preview: string; var_count: number }

export type AutomationFormValue = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  subject: string
  bodyBlocks: Block[]
  channel: AutomationChannel
  waTemplateId: string | null
  waVarValues: Record<string, string>
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function AutomationForm({ initial, waTemplates }: { initial: AutomationFormValue; waTemplates: WaTemplateOption[] }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [triggerType, setTriggerType] = useState<TriggerType>(initial.triggerType)
  const [triggerDays, setTriggerDays] = useState<number | null>(initial.triggerDays)
  const [subject, setSubject] = useState(initial.subject)
  const [blocks, setBlocks] = useState<Block[]>(initial.bodyBlocks.length ? initial.bodyBlocks : [{ type: 'paragraph', text: '' }])
  const [channel, setChannel] = useState<AutomationChannel>(initial.channel)
  const [waTemplateId, setWaTemplateId] = useState(initial.waTemplateId ?? (waTemplates[0]?.id ?? ''))
  const [waVarValues, setWaVarValues] = useState<Record<string, string>>(initial.waVarValues)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const usesDays = TRIGGER_OPTIONS.find((o) => o.type === triggerType)?.usesDays ?? true
  const previewHtml = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])
  const waTemplate = useMemo(() => waTemplates.find((t) => t.id === waTemplateId) ?? null, [waTemplates, waTemplateId])
  const slots = useMemo(() => Array.from({ length: waTemplate?.var_count ?? 0 }, (_, i) => String(i + 1)), [waTemplate])

  function onSave() {
    setError(null)
    start(async () => {
      const res = await saveAutomation({ id: initial.id, name, triggerType, triggerDays: usesDays ? triggerDays : null, subject, bodyBlocks: blocks, channel, waTemplateId: channel === 'whatsapp' ? waTemplateId : null, waVarValues })
      if (res.error) { setError(res.error); return }
      router.push('/dashboard/automations')
      router.refresh()
    })
  }

  const channelTab = (on: boolean) =>
    cn(
      'rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      on ? 'border-transparent bg-accent text-accent-contrast' : 'border-line bg-transparent text-ink hover:border-line-strong'
    )

  return (
    <Card className="flex max-w-2xl flex-col gap-3.5 p-4">
      <input className={inputClass} placeholder="Automation name (internal)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-2.5">
        <select className={cn(inputClass, 'w-auto flex-1')} value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
          {TRIGGER_OPTIONS.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}
        </select>
        {usesDays && (
          <input type="number" min={1} className={cn(inputClass, 'w-28')} placeholder="Days" value={triggerDays ?? ''} onChange={(e) => setTriggerDays(e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setChannel('email')} className={channelTab(channel === 'email')}>Email</button>
        <button type="button" onClick={() => setChannel('whatsapp')} className={channelTab(channel === 'whatsapp')}>WhatsApp</button>
      </div>

      {channel === 'email' ? (
        <>
          <input className={inputClass} placeholder="Email subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <BlockEditor value={blocks} onChange={setBlocks} />
          <div>
            <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Preview</div>
            {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
            <div className="rounded-[10px] border border-line bg-white p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </>
      ) : waTemplates.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">
          No WhatsApp templates yet. Add one under{' '}
          <Link href="/dashboard/whatsapp" className="text-ink underline transition-colors hover:text-accent-ink">WhatsApp</Link> first.
        </p>
      ) : (
        <>
          <select className={inputClass} value={waTemplateId} onChange={(e) => { setWaTemplateId(e.target.value); setWaVarValues({}) }}>
            {waTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {waTemplate && (
            <div className="whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 text-[13px] text-ink-3">
              {waTemplate.body_preview}
            </div>
          )}
          {slots.map((slot) => (
            <div key={slot} className="flex flex-col gap-1">
              <label className="font-mono text-[11.5px] text-ink-3">{`{{${slot}}}`}</label>
              <div className="flex gap-2">
                <input className={inputClass} value={waVarValues[slot] ?? ''} onChange={(e) => setWaVarValues((v) => ({ ...v, [slot]: e.target.value }))} placeholder="Value or {{first_name}}" />
                <button
                  type="button"
                  onClick={() => setWaVarValues((v) => ({ ...v, [slot]: (v[slot] ?? '') + '{{first_name}}' }))}
                  className="whitespace-nowrap rounded-lg border border-line bg-transparent px-3 text-xs text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  + name
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}

      <div className="flex gap-2.5">
        <Button onClick={onSave} disabled={pending || !name.trim()}>
          {pending ? 'Saving…' : 'Save automation'}
        </Button>
        <Link href="/dashboard/automations" className={cn(buttonVariants({ variant: 'outline' }))}>
          Cancel
        </Link>
      </div>
    </Card>
  )
}
