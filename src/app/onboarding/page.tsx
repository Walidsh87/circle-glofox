'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { createGym } from './_actions/create-gym'
import { Button } from '@/components/ui/button'

const TIMEZONES = [
  { value: 'Asia/Dubai', label: 'Dubai (GST +4)' },
  { value: 'Asia/Riyadh', label: 'Riyadh (AST +3)' },
  { value: 'Asia/Qatar', label: 'Qatar (AST +3)' },
  { value: 'Asia/Kuwait', label: 'Kuwait (AST +3)' },
  { value: 'Asia/Bahrain', label: 'Bahrain (AST +3)' },
  { value: 'Asia/Muscat', label: 'Muscat (GST +4)' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Creating...' : 'Create gym'}
    </Button>
  )
}

export default function OnboardingPage() {
  const [state, formAction] = useFormState(createGym, { error: null })

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-sm border p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">Set up your gym</h1>
        <p className="text-sm text-gray-500 mb-6">You&apos;ll be the owner of this gym.</p>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              Your name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              placeholder="Ahmed Al Mansouri"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="gymName" className="block text-sm font-medium text-gray-700 mb-1">
              Gym name
            </label>
            <input
              id="gymName"
              name="gymName"
              type="text"
              required
              placeholder="Circle Fitness"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              defaultValue="Asia/Dubai"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <SubmitButton />
        </form>
      </div>
    </main>
  )
}
