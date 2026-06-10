'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveAutomation } from '../_actions/save-automation'
import { TRIGGER_OPTIONS } from '../_lib/automation-copy'
import { BlockEditor } from '@/app/dashboard/broadcasts/_components/block-editor'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'

export type AutomationFormValue = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  subject: string
  bodyBlocks: Block[]
}

export function AutomationForm({ initial }: { initial: AutomationFormValue }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [triggerType, setTriggerType] = useState<TriggerType>(initial.triggerType)
  const [triggerDays, setTriggerDays] = useState<number | null>(initial.triggerDays)
  const [subject, setSubject] = useState(initial.subject)
  const [blocks, setBlocks] = useState<Block[]>(initial.bodyBlocks.length ? initial.bodyBlocks : [{ type: 'paragraph', text: '' }])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const usesDays = TRIGGER_OPTIONS.find((o) => o.type === triggerType)?.usesDays ?? true
  const previewHtml = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])

  function onSave() {
    setError(null)
    start(async () => {
      const res = await saveAutomation({ id: initial.id, name, triggerType, triggerDays: usesDays ? triggerDays : null, subject, bodyBlocks: blocks })
      if (res.error) { setError(res.error); return }
      router.push('/dashboard/automations')
      router.refresh()
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

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
      <input style={inputStyle} placeholder="Email subject" value={subject} onChange={(e) => setSubject(e.target.value)} />

      <BlockEditor value={blocks} onChange={setBlocks} />

      <div>
        <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-ink-muted)', marginBottom: 6 }}>Preview</div>
        {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, background: '#fff' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>

      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSave} disabled={pending || !name.trim() || !subject.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Saving…' : 'Save automation'}
        </button>
        <Link href="/dashboard/automations" style={{ padding: '10px 18px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>Cancel</Link>
      </div>
    </div>
  )
}
