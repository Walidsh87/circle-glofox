'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

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

  return (
    <Card className="flex max-w-2xl flex-col gap-3.5 p-4">
      <input className={inputClass} placeholder="Sequence name (internal)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-2.5">
        <select className={cn(inputClass, 'w-auto flex-1')} value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
          {TRIGGER_OPTIONS.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}
        </select>
        {usesDays && (
          <input type="number" min={0} className={cn(inputClass, 'w-32')} placeholder="Days" value={triggerDays ?? ''} onChange={(e) => setTriggerDays(e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>

      <StepsEditor value={steps} onChange={setSteps} />

      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}

      <div className="flex gap-2.5">
        <Button onClick={onSave} disabled={pending || !name.trim()}>
          {pending ? 'Saving…' : 'Save sequence'}
        </Button>
        <Link href="/dashboard/sequences" className={cn(buttonVariants({ variant: 'outline' }))}>
          Cancel
        </Link>
      </div>
    </Card>
  )
}
