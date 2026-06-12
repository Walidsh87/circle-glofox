'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createGym } from './_actions/create-gym'
import { toSlug } from './_lib/slug'
import { CircleMark } from '@/components/circle-mark'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/field'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const TIMEZONES = [
  { value: 'Asia/Dubai',   label: 'Dubai (GST +4)' },
  { value: 'Asia/Riyadh',  label: 'Riyadh (AST +3)' },
  { value: 'Asia/Qatar',   label: 'Qatar (AST +3)' },
  { value: 'Asia/Kuwait',  label: 'Kuwait (AST +3)' },
  { value: 'Asia/Bahrain', label: 'Bahrain (AST +3)' },
  { value: 'Asia/Muscat',  label: 'Muscat (GST +4)' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Creating…' : 'Create gym →'}
    </Button>
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
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md p-8 sm:p-9">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <CircleMark size={22} />
            <span>Circle</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.12em] text-ink-3">
          Setup
        </div>
        <h1 className="mb-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
          Set up your gym
        </h1>
        <p className="mb-7 text-sm text-ink-2">You&apos;ll be the owner of this gym.</p>

        <form action={formAction} className="flex flex-col gap-4">
          <Field
            label="Your name"
            id="fullName"
            name="fullName"
            type="text"
            required
            placeholder="Ahmed Al Mansouri"
          />

          <Field
            label="Gym name"
            id="gymName"
            name="gymName"
            type="text"
            required
            placeholder="Circle Fitness"
            value={gymName}
            onChange={handleGymNameChange}
          />

          {/* Slug group: prefix + input share one bordered control */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="gymSlug" className="text-xs font-medium text-ink-2">
              Your gym URL
            </label>
            <div className="flex h-11 items-center overflow-hidden rounded-lg border border-line-strong bg-surface transition-colors focus-within:ring-2 focus-within:ring-accent">
              <span className="flex h-full shrink-0 items-center whitespace-nowrap border-r border-line bg-surface-2 px-2.5 font-mono text-xs text-ink-3">
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
                className="h-full flex-1 bg-transparent px-3 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
            </div>
            <p className="text-xs text-ink-3">Share this URL with your members to log in</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="timezone" className="text-xs font-medium text-ink-2">
              Timezone
            </label>
            <Select id="timezone" name="timezone" defaultValue="Asia/Dubai">
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </Select>
          </div>

          {state.error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>
      </Card>
    </main>
  )
}
