'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { updateMember } from '../_actions/update-member'
import { BLOOD_TYPES } from '../_lib/member-fields-validation'
import { IdFields } from '../../_components/id-fields'

const inputClass =
  'h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save'}
    </Button>
  )
}

type Props = {
  memberId: string
  fullName: string
  phone: string | null
  role: string
  viewerRole: string
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bloodType: string | null
  allergies: string | null
  dateOfBirth: string | null
  idType: string | null
  idNumber: string | null
}

export function EditMemberForm({ memberId, fullName, phone, role, viewerRole, emergencyContactName, emergencyContactPhone, bloodType, allergies, dateOfBirth, idType, idNumber }: Props) {
  const [editing, setEditing] = useState(false)
  const [state, formAction] = useFormState(async (prev: { error: string | null }, fd: FormData) => {
    const result = await updateMember(prev, fd)
    if (!result.error) setEditing(false)
    return result
  }, { error: null })

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
    )
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2.5">
      <input type="hidden" name="memberId" value={memberId} />
      <input
        name="fullName"
        type="text"
        required
        defaultValue={fullName}
        placeholder="Full name"
        className={`${inputClass} w-[180px]`}
      />
      <input
        name="phone"
        type="tel"
        defaultValue={phone ?? ''}
        placeholder="Phone"
        className={`${inputClass} w-[140px]`}
      />
      {viewerRole === 'owner' && (
        <select name="role" defaultValue={role} className={`${inputClass} w-[110px]`}>
          <option value="athlete">Athlete</option>
          <option value="coach">Coach</option>
        </select>
      )}
      <input name="emergencyContactName" type="text" defaultValue={emergencyContactName ?? ''} placeholder="Emergency contact" className={`${inputClass} w-40`} />
      <input name="emergencyContactPhone" type="tel" defaultValue={emergencyContactPhone ?? ''} placeholder="Emergency phone" className={`${inputClass} w-[150px]`} />
      <select name="bloodType" defaultValue={bloodType ?? ''} className={`${inputClass} w-24`}>
        <option value="">Blood —</option>
        {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <input name="dateOfBirth" type="date" defaultValue={dateOfBirth ?? ''} className={`${inputClass} w-[150px]`} />
      <IdFields defaultType={idType ?? 'emirates_id'} defaultNumber={idNumber ?? ''} />
      <textarea
        name="allergies"
        defaultValue={allergies ?? ''}
        placeholder="Allergies / medical notes"
        rows={2}
        className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <SaveButton />
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state.error && <span role="alert" className="text-xs text-danger">{state.error}</span>}
    </form>
  )
}
