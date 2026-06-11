'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOwnProfile } from '../_actions/update-own-profile'
import { BLOOD_TYPES } from '../_lib/member-fields-validation'

const field: React.CSSProperties = { height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, display: 'block' }

export function MyDetailsCard({ initial }: { initial: { phone: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; bloodType: string | null; allergies: string | null } }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><span className="mono" style={label}>Phone</span><input style={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05x xxx xxxx" /></div>
        <div><span className="mono" style={label}>Blood type</span>
          <select style={field} value={bloodType} onChange={(e) => setBloodType(e.target.value)}>
            <option value="">—</option>
            {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div><span className="mono" style={label}>Emergency contact</span><input style={field} value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="Name" /></div>
        <div><span className="mono" style={label}>Emergency phone</span><input style={field} value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="Any format" /></div>
      </div>
      <div><span className="mono" style={label}>Allergies / medical notes</span><textarea style={{ ...field, height: 64, padding: '8px 12px', resize: 'vertical' }} value={allergies} onChange={(e) => setAllergies(e.target.value)} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onSave} disabled={pending} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Save'}</button>
        {saved && !error && <span style={{ fontSize: 12.5, color: 'var(--c-ok-ink)' }}>Saved</span>}
        {error && <span style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{error}</span>}
      </div>
    </div>
  )
}
