'use client'

import { useState } from 'react'
import { ID_TYPES, ID_TYPE_LABELS, idChecksumWarning } from '@/lib/national-id'

const inputClass =
  'h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

// Type picker + number input that submit as idType / idNumber, with a live,
// non-blocking Emirates ID check-digit hint. Dropped into both staff member forms.
export function IdFields({ defaultType = 'emirates_id', defaultNumber = '' }: { defaultType?: string; defaultNumber?: string }) {
  const [type, setType] = useState(defaultType)
  const [number, setNumber] = useState(defaultNumber)
  const warning = idChecksumWarning(type, number)

  return (
    <>
      <select
        name="idType"
        value={type}
        onChange={(e) => setType(e.target.value)}
        aria-label="ID type"
        className={`${inputClass} w-[130px]`}
      >
        {ID_TYPES.map((t) => (
          <option key={t} value={t}>{ID_TYPE_LABELS[t]}</option>
        ))}
      </select>
      <input
        name="idNumber"
        type="text"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="ID number"
        aria-label="ID number"
        className={`${inputClass} w-[180px]`}
      />
      {warning && <span className="text-[11px] text-warn">{warning}</span>}
    </>
  )
}
