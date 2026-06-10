'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const
  const tabStyle = (on: boolean) => ({ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--c-border)', background: on ? '#111' : 'transparent', color: on ? '#fff' : 'var(--c-ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }) as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', maxWidth: 640 }}>
      <input style={inputStyle} placeholder="Automation name (internal)" value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: 'auto', flex: 1 }} value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
          {TRIGGER_OPTIONS.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}
        </select>
        {usesDays && (
          <input type="number" min={1} style={{ ...inputStyle, width: 110 }} placeholder="Days" value={triggerDays ?? ''} onChange={(e) => setTriggerDays(e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setChannel('email')} style={tabStyle(channel === 'email')}>Email</button>
        <button type="button" onClick={() => setChannel('whatsapp')} style={tabStyle(channel === 'whatsapp')}>WhatsApp</button>
      </div>

      {channel === 'email' ? (
        <>
          <input style={inputStyle} placeholder="Email subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <BlockEditor value={blocks} onChange={setBlocks} />
          <div>
            <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-ink-muted)', marginBottom: 6 }}>Preview</div>
            {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
            <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, background: '#fff' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </>
      ) : waTemplates.length === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--c-ink-muted)' }}>No WhatsApp templates yet. Add one under <Link href="/dashboard/whatsapp" style={{ color: 'var(--c-ink)' }}>WhatsApp</Link> first.</p>
      ) : (
        <>
          <select style={inputStyle} value={waTemplateId} onChange={(e) => { setWaTemplateId(e.target.value); setWaVarValues({}) }}>
            {waTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {waTemplate && <div style={{ padding: 12, borderRadius: 8, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-ink-muted)', whiteSpace: 'pre-wrap' }}>{waTemplate.body_preview}</div>}
          {slots.map((slot) => (
            <div key={slot} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{`{{${slot}}}`}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inputStyle} value={waVarValues[slot] ?? ''} onChange={(e) => setWaVarValues((v) => ({ ...v, [slot]: e.target.value }))} placeholder="Value or {{first_name}}" />
                <button type="button" onClick={() => setWaVarValues((v) => ({ ...v, [slot]: (v[slot] ?? '') + '{{first_name}}' }))} style={{ padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-ink)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ name</button>
              </div>
            </div>
          ))}
        </>
      )}

      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSave} disabled={pending || !name.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Saving…' : 'Save automation'}
        </button>
        <Link href="/dashboard/automations" style={{ padding: '10px 18px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>Cancel</Link>
      </div>
    </div>
  )
}
