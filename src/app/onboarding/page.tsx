'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createGym } from './_actions/create-gym'
import { CircleMark } from '@/components/circle-mark'

const TIMEZONES = [
  { value: 'Asia/Dubai',   label: 'Dubai (GST +4)' },
  { value: 'Asia/Riyadh',  label: 'Riyadh (AST +3)' },
  { value: 'Asia/Qatar',   label: 'Qatar (AST +3)' },
  { value: 'Asia/Kuwait',  label: 'Kuwait (AST +3)' },
  { value: 'Asia/Bahrain', label: 'Bahrain (AST +3)' },
  { value: 'Asia/Muscat',  label: 'Muscat (GST +4)' },
]

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

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: '100%', height: 44,
        background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none', borderRadius: 10,
        fontSize: 14, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
        color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        letterSpacing: '0.01em', transition: 'opacity .12s',
      }}
    >
      {pending ? 'Creating…' : 'Create gym →'}
    </button>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} className="mono" style={{
        fontSize: 11, color: 'var(--c-ink-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export default function OnboardingPage() {
  const [state, formAction] = useFormState(createGym, { error: null })
  const [gymName, setGymName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  function handleGymNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value
    setGymName(name)
    if (!slugEdited) setSlug(toSlug(name))
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugEdited(true)
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))
  }

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)',
    }}>
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        borderRadius: 18, padding: '40px 36px', width: '100%', maxWidth: 420,
        boxShadow: 'var(--c-shadow-sm)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, marginBottom: 32,
          fontFamily: 'var(--font-space-grotesk)', fontWeight: 700,
          fontSize: 16, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--c-ink)',
        }}>
          <CircleMark size={22} />
          <span>Circle</span>
        </div>

        <div className="mono" style={{
          fontSize: 11, color: 'var(--c-ink-muted)',
          textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10,
        }}>
          Setup
        </div>
        <h1 style={{
          fontFamily: 'var(--font-space-grotesk)', fontSize: 28,
          letterSpacing: '-0.025em', marginBottom: 6, color: 'var(--c-ink)',
        }}>
          Set up your gym
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--c-ink-muted)', marginBottom: 28 }}>
          You&apos;ll be the owner of this gym.
        </p>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field id="fullName" label="Your name">
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              placeholder="Ahmed Al Mansouri"
              style={inputStyle}
            />
          </Field>

          <Field id="gymName" label="Gym name">
            <input
              id="gymName"
              name="gymName"
              type="text"
              required
              placeholder="Circle Fitness"
              value={gymName}
              onChange={handleGymNameChange}
              style={inputStyle}
            />
          </Field>

          <Field id="gymSlug" label="Your gym URL">
            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--c-border-strong)', borderRadius: 10, overflow: 'hidden', background: 'var(--c-surface)', height: 42 }}>
              <span className="mono" style={{
                padding: '0 10px', fontSize: 12, color: 'var(--c-ink-muted)',
                background: 'var(--c-surface-sunk)', borderRight: '1px solid var(--c-border)',
                height: '100%', display: 'flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                circle.app/
              </span>
              <input
                id="gymSlug"
                name="gymSlug"
                type="text"
                required
                placeholder="crossfit-dubai"
                value={slug}
                onChange={handleSlugChange}
                style={{
                  flex: 1, height: '100%', padding: '0 12px',
                  border: 'none', outline: 'none',
                  background: 'transparent', fontSize: 14,
                  color: 'var(--c-ink)', fontFamily: 'var(--font-geist-mono)',
                }}
              />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 3 }}>
              Share this URL with your members to log in
            </div>
          </Field>

          <Field id="timezone" label="Timezone">
            <select
              id="timezone"
              name="timezone"
              defaultValue="Asia/Dubai"
              style={inputStyle}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </Field>

          {state.error && (
            <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{state.error}</p>
          )}

          <SubmitButton />
        </form>
      </div>
    </main>
  )
}
