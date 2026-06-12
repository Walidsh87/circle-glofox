'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createPackage } from '../_actions/create-package'

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" className="self-start" disabled={pending}>
      {pending ? 'Saving…' : 'Add package'}
    </Button>
  )
}

export function AddPackageForm() {
  const [state, formAction] = useFormState(createPackage, { error: null })
  const [type, setType] = useState('class_pack')

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input name="name" placeholder="Package name (e.g. 10-Class Pack)" className={inputClass} />
      <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
        <option value="class_pack">Class pack</option>
        <option value="drop_in">Drop-in pass</option>
        <option value="pt_block">PT block</option>
      </select>
      <div className="flex gap-2.5">
        <input
          key={type}
          name="creditCount"
          type="number"
          min={1}
          placeholder={type === 'drop_in' ? '1 (fixed)' : 'Credits'}
          disabled={type === 'drop_in'}
          defaultValue={type === 'drop_in' ? 1 : undefined}
          className={inputClass}
        />
        <input name="priceAed" type="number" min={0} step="0.01" placeholder="Price (AED)" className={inputClass} />
        <input name="expiryDays" type="number" min={1} placeholder="Expiry days (optional)" className={inputClass} />
      </div>
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      <SubmitButton />
    </form>
  )
}
