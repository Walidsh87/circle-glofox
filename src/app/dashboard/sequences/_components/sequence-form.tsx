'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveSequence } from '../_actions/save-sequence'
import { TRIGGER_OPTIONS } from '@/app/dashboard/automations/_lib/automation-copy'
import { StepsEditor } from './steps-editor'
import type { SequenceStep } from '@/lib/sequences'
import type { TriggerType } from '@/lib/automations'

export type SequenceFormValue = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  steps: SequenceStep[]
}

export function SequenceForm({ initial }: { initial: SequenceFormValue }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [triggerType, setTriggerType] = useState<TriggerType>(initial.triggerType)
  const [triggerDays, setTriggerDays] = useState<number | null>(initial.triggerDays)
  const [steps, setSteps] = useState<SequenceStep[]>(initial.steps.length ? initial.steps : [{ offset_days: 0, subject: '', body_blocks: [{ type: 'paragraph', text: '' }] }])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const usesDays = TRIGGER_OPTIONS.find((o) => o.type === triggerType)?.usesDays ?? true

  function onSave() {
    setError(null)
    start(async () => {
      const res = await saveSequence({ id: initial.id, name, triggerType, triggerDays: usesDays ? triggerDays : null, steps })
      if (res.error) { setError(res.error); return }
      router.push('/dashboard/sequences')
      router.refresh()
    })
  }

  const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 680 }}>
      <input style={input} placeholder="Sequence name (internal)" value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select style={{ ...input, width: 'auto', flex: 1 }} value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
          {TRIGGER_OPTIONS.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}
        </select>
        {usesDays && (
          <input type="number" min={0} style={{ ...input, width: 130 }} placeholder="Days" value={triggerDays ?? ''} onChange={(e) => setTriggerDays(e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>

      <StepsEditor value={steps} onChange={setSteps} />

      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSave} disabled={pending || !name.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Saving…' : 'Save sequence'}
        </button>
        <Link href="/dashboard/sequences" style={{ padding: '10px 18px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>Cancel</Link>
      </div>
    </div>
  )
}
