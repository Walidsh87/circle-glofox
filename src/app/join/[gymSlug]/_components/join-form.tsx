'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { CircleMark } from '@/components/circle-mark'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { ThemeToggle } from '@/components/ui/theme-toggle'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Joining…' : 'Join gym →'}
    </Button>
  )
}

export function JoinForm({
  gymName,
  action,
}: {
  gymName: string
  action: (prev: { error: string | null }, data: FormData) => Promise<{ error: string | null }>
}) {
  const [state, formAction] = useFormState(action, { error: null })

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
          Welcome
        </div>
        <h1 className="mb-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
          You&apos;re joining
          <br />
          {gymName}
        </h1>
        <p className="mb-7 text-sm text-ink-2">Just one more thing — what&apos;s your name?</p>

        <form action={formAction} className="flex flex-col gap-4">
          <Field
            label="Full name"
            id="fullName"
            name="fullName"
            type="text"
            required
            autoFocus
            placeholder="Ahmed Al Mansouri"
          />
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
