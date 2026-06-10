'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendWaCampaign } from '../_actions/send-wa-campaign'
import { previewSmsAudience } from '@/app/dashboard/sms/_actions/preview-sms-audience'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import type { WaTemplate } from './wa-templates-manager'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

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

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  if (templates.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginBottom: 28 }}>Add a template above before composing a campaign.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 28 }}>
      {!configured && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--c-warn-soft)', color: 'var(--c-warn-ink)', fontSize: 13 }}>
          WhatsApp isn’t configured yet. Add your Twilio WhatsApp sender to send.
        </div>
      )}
      <select style={inputStyle} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setVarValues({}) }}>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {template && <div style={{ padding: 12, borderRadius: 8, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-ink-muted)', whiteSpace: 'pre-wrap' }}>{template.body_preview}</div>}
      {slots.map((slot) => (
        <div key={slot} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{`{{${slot}}}`}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={inputStyle} value={varValues[slot] ?? ''} onChange={(e) => setVarValues((v) => ({ ...v, [slot]: e.target.value }))} placeholder="Value or {{first_name}}" />
            <button type="button" onClick={() => setVarValues((v) => ({ ...v, [slot]: (v[slot] ?? '') + '{{first_name}}' }))} style={{ padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-ink)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ name</button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: 'auto' }} value={status} onChange={(e) => { const s = e.target.value as Segment; setStatus(s); refreshCount(s, tag) }}>
          {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto' }} value={tag} onChange={(e) => { setTag(e.target.value); refreshCount(status, e.target.value) }}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--c-ink-muted)' }}>
          {count === null ? 'Choose an audience to preview count' : `${count} recipient${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}

      <button onClick={onSend} disabled={pending || !configured || !templateId} style={{ alignSelf: 'flex-start', padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending || !configured ? 0.6 : 1 }}>
        {pending ? 'Sending…' : 'Send WhatsApp'}
      </button>
    </div>
  )
}
