'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useT } from '@/components/i18n/locale-provider'
import { updateOwnProfile } from '../_actions/update-own-profile'
import { BLOOD_TYPES } from '../_lib/member-fields-validation'

const fieldClass =
  'h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const labelClass = 'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3'

export function MyDetailsCard({ initial }: { initial: { phone: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; bloodType: string | null; allergies: string | null } }) {
  const t = useT()
  const router = useRouter()
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [ecName, setEcName] = useState(initial.emergencyContactName ?? '')
  const [ecPhone, setEcPhone] = useState(initial.emergencyContactPhone ?? '')
  const [bloodType, setBloodType] = useState(initial.bloodType ?? '')
  const [allergies, setAllergies] = useState(initial.allergies ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  function onSave() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await updateOwnProfile({
        phone: phone || null,
        emergencyContactName: ecName || null,
        emergencyContactPhone: ecPhone || null,
        bloodType: bloodType || null,
        allergies: allergies || null,
      })
      if (res.error) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div><span className={labelClass}>{t('profile.myDetails.phone')}</span><input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05x xxx xxxx" /></div>
        <div><span className={labelClass}>{t('profile.myDetails.bloodType')}</span>
          <select className={fieldClass} value={bloodType} onChange={(e) => setBloodType(e.target.value)}>
            <option value="">—</option>
            {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div><span className={labelClass}>{t('profile.myDetails.emergencyContact')}</span><input className={fieldClass} value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="Name" /></div>
        <div><span className={labelClass}>{t('profile.myDetails.emergencyPhone')}</span><input className={fieldClass} value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="Any format" /></div>
      </div>
      <div>
        <span className={labelClass}>{t('profile.myDetails.allergies')}</span>
        <textarea
          className="min-h-16 w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13.5px] text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <Button size="sm" onClick={onSave} disabled={pending}>{pending ? t('common.saving') : t('profile.myDetails.save')}</Button>
        {saved && !error && <span className="text-xs text-ok">{t('profile.myDetails.saved')}</span>}
        {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  )
}
