'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateSettings } from './_actions/update-settings'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/sidebar'

const TIMEZONES = [
  { value: 'Asia/Dubai',   label: 'Dubai (GST +4)' },
  { value: 'Asia/Riyadh',  label: 'Riyadh (AST +3)' },
  { value: 'Asia/Qatar',   label: 'Qatar (AST +3)' },
  { value: 'Asia/Kuwait',  label: 'Kuwait (AST +3)' },
  { value: 'Asia/Bahrain', label: 'Bahrain (AST +3)' },
  { value: 'Asia/Muscat',  label: 'Muscat (GST +4)' },
]

const RESERVED_SLUGS = ['dashboard', 'onboarding', 'auth', 'api', 'login', 'signup', 'admin', 'settings']

function toSlug(name: string) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 42, padding: '0 14px',
  border: '1.5px solid var(--c-border-strong)', borderRadius: 10,
  background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{hint}</div>}
    </div>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        height: 42, padding: '0 24px',
        background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none', borderRadius: 10,
        fontSize: 14, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
        color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        transition: 'opacity .12s',
      }}
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  )
}

type BoxData = { name: string; timezone: string; slug: string | null; box_id: string; userName: string; userRole: string; boxName: string }

export default function SettingsPage() {
  const router = useRouter()
  const [box, setBox] = useState<BoxData | null>(null)
  const [gymName, setGymName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [state, formAction] = useFormState(updateSettings, { error: null })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, box_id, boxes(name, timezone, slug)')
        .eq('id', user.id)
        .single()

      if (!profile) { router.push('/onboarding'); return }
      if (profile.role !== 'owner') { router.push('/dashboard'); return }

      const boxesRaw = profile.boxes
      const boxes = (Array.isArray(boxesRaw) ? boxesRaw[0] : boxesRaw) as { name: string; timezone: string; slug: string | null } | null
      const name = boxes?.name ?? ''
      const tz = boxes?.timezone ?? 'Asia/Dubai'
      const s = boxes?.slug ?? ''

      setBox({ name, timezone: tz, slug: s, box_id: profile.box_id, userName: profile.full_name, userRole: profile.role, boxName: name })
      setGymName(name)
      setSlug(s)
      setSlugEdited(!!s)
    }
    load()
  }, [router])

  function handleGymNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value
    setGymName(name)
    if (!slugEdited) setSlug(toSlug(name))
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugEdited(true)
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))
  }

  const slugValid = /^[a-z0-9-]{3,40}$/.test(slug) && !RESERVED_SLUGS.includes(slug)

  if (!box) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--c-bg)' }}>
        <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="settings" userName={box.userName} userRole={box.userRole} boxName={box.boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Settings
          </h1>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 480 }}>

            {/* Gym settings */}
            <div style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderRadius: 14, padding: '22px 24px', boxShadow: 'var(--c-shadow-sm)',
            }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 20 }}>Gym details</p>

              <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Field id="gymName" label="Gym name">
                  <input
                    id="gymName"
                    name="gymName"
                    type="text"
                    required
                    value={gymName}
                    onChange={handleGymNameChange}
                    style={inputStyle}
                  />
                </Field>

                <Field id="slug" label="Gym URL" hint="Members use this link to log in. Changing it breaks existing links.">
                  <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${slugValid || !slug ? 'var(--c-border-strong)' : 'var(--c-danger)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--c-surface)', height: 42 }}>
                    <span className="mono" style={{
                      padding: '0 10px', fontSize: 12, color: 'var(--c-ink-muted)',
                      background: 'var(--c-surface-sunk)', borderRight: '1px solid var(--c-border)',
                      height: '100%', display: 'flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap',
                    }}>
                      circle.app/
                    </span>
                    <input
                      id="slug"
                      name="slug"
                      type="text"
                      required
                      value={slug}
                      onChange={handleSlugChange}
                      style={{
                        flex: 1, height: '100%', padding: '0 12px',
                        border: 'none', outline: 'none',
                        background: 'transparent', fontSize: 14,
                        color: 'var(--c-ink)', fontFamily: 'var(--font-geist-mono)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </Field>

                <Field id="timezone" label="Timezone">
                  <select
                    id="timezone"
                    name="timezone"
                    value={box.timezone}
                    onChange={(e) => setBox({ ...box, timezone: e.target.value })}
                    style={inputStyle}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </Field>

                {state.error && (
                  <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{state.error}</p>
                )}
                {state.success && (
                  <p style={{ fontSize: 13, color: 'var(--c-ok)', margin: 0 }}>Settings saved.</p>
                )}

                <div>
                  <SaveButton />
                </div>
              </form>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
