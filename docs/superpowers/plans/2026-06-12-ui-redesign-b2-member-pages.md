# UI Redesign B2 — Member-Facing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the four member-facing surfaces — root login `/`, gym login `/[gymSlug]`, `/join/[gymSlug]`, `/onboarding` — mobile-first on the B0+B1 design system (spec `docs/superpowers/specs/2026-06-12-ui-redesign-design.md` §6 batch B2), making the new ivory light mode publicly visible for the first time.

**Architecture:** The root login and gym login are ~95% duplicated 270-line files (same password/code/verify state machine, same split layout). B2 extracts one shared `src/components/auth/` trio — `AuthLayout` (responsive split, single column on mobile), `BrandPanel` (the constant-dark right panel, now with Fraunces), `LoginForm` (the shared auth state machine on `Field`/`Button` primitives) — then each page becomes a thin composition. Join + onboarding become centered `Card` forms. All four pages drop legacy `--c-*` vars and become themeable; the brand panel deliberately stays near-black in both modes (brand canvas, like the sidebar gym tile).

**Tech Stack:** Next.js 16 App Router, React 18, B0+B1 primitives (`@/components/ui/*`, `@/components/shell/*`), semantic Tailwind tokens, Vitest + jsdom + Testing Library (`// @vitest-environment jsdom` pragma), `vi.mock` for the Supabase browser client.

**Critical constraints:**
1. **No behavior or copy changes** (spec §8): every Supabase call (`signInWithPassword`, `signInWithOtp` with `shouldCreateUser: true`, `verifyOtp`), every redirect target (`/dashboard`, `redirectTo ?? /join/<slug>`), all headlines/hints/footers stay verbatim. This is a re-skin onto primitives, not an auth change. See `project-direction` memory — the auth methodology is a deliberate, recently shipped design.
2. **`GymLoginForm` export + props are public API**: `src/app/checkin/[token]/page.tsx` imports it (`gymName`, `gymSlug`, `redirectTo?`). Keep the named export and prop signature identical.
3. **`useFormState` stays** in join/onboarding (current React 18 pattern in this repo; do not migrate to `useActionState`).
4. Theme: these are public pages → fully themeable (new visitors default light). `ThemeToggle` mounts in the `AuthLayout` header (spec §4 "member-page headers") and in the centered-card pages' top bar.
5. Commit per task on `main` (user's workflow); every commit green: `npm run lint && npm run type-check && npm run test`.

---

## File structure

```
Create:
  src/app/onboarding/_lib/slug.ts            # toSlug extracted (pure, testable)
  src/app/onboarding/_lib/slug.test.ts
  src/components/auth/auth-layout.tsx        # AuthLayout + BrandPanel
  src/components/auth/login-form.tsx         # shared password/code/verify state machine
  src/components/auth/login-form.test.tsx

Modify (full rewrites of the render layer, logic preserved):
  src/app/page.tsx                           # 274 → ~60 lines (compose auth trio)
  src/app/[gymSlug]/_components/gym-login-form.tsx   # 270 → ~40 lines (same export/props)
  src/app/join/[gymSlug]/_components/join-form.tsx   # Card + Field + Button
  src/app/onboarding/page.tsx                # Card + Field + Select + Button

Untouched (already correct):
  src/app/[gymSlug]/page.tsx                 # server page — only renders GymLoginForm
  src/app/join/[gymSlug]/page.tsx            # server page
  src/app/join/[gymSlug]/_actions/create-athlete.ts
  src/app/onboarding/_actions/create-gym.ts
  src/app/auth/*                             # harmless link fallbacks, not a B2 surface
```

---

### Task 1: Extract `toSlug` (TDD)

`toSlug` is a pure function currently inlined in `src/app/onboarding/page.tsx:17-23`. Extracting it to `_lib/` matches the repo convention (pure logic in `_lib/*.ts`, covered by vitest coverage include).

**Files:**
- Create: `src/app/onboarding/_lib/slug.ts`
- Test: `src/app/onboarding/_lib/slug.test.ts`
- Modify: `src/app/onboarding/page.tsx` (in Task 6 — the import lands with the rewrite; until then the inline copy stays)

- [ ] **Step 1: Write the failing test**

Create `src/app/onboarding/_lib/slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toSlug } from './slug'

describe('toSlug', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(toSlug('CrossFit Dubai')).toBe('crossfit-dubai')
  })

  it('strips non-alphanumerics and collapses runs of hyphens', () => {
    expect(toSlug("Ahmed's  Gym — #1!")).toBe('ahmeds-gym-1')
  })

  it('trims and caps at 40 chars', () => {
    expect(toSlug('  padded  ')).toBe('padded')
    expect(toSlug('x'.repeat(60))).toHaveLength(40)
  })

  it('returns empty string for symbol-only input', () => {
    expect(toSlug('***')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/onboarding/_lib/slug.test.ts`
Expected: FAIL — `Cannot find module './slug'`.

- [ ] **Step 3: Implement**

Create `src/app/onboarding/_lib/slug.ts` (moved verbatim from `page.tsx:17-23`):

```ts
export function toSlug(name: string) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}
```

Note: `"Ahmed's  Gym — #1!"` → strip symbols → `ahmeds  gym  1` → spaces→hyphens (the double spaces become double hyphens) → collapse → `ahmeds-gym-1`. The em-dash is stripped by the first replace, its surrounding spaces merge.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/onboarding/_lib/slug.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/_lib/slug.ts src/app/onboarding/_lib/slug.test.ts
git commit -m "refactor(onboarding): extract toSlug to _lib (tested)"
```

---

### Task 2: `AuthLayout` + `BrandPanel`

Presentational shell for both login pages. Mobile-first: single column with the brand panel hidden below `lg` (the form gets the full viewport — today phones get half); the split returns at `lg:grid-cols-2`. ThemeToggle in the header. The brand panel keeps its near-black background **in both themes** — it is brand canvas, not a themed surface (same treatment as the sidebar's gym tile).

**Files:**
- Create: `src/components/auth/auth-layout.tsx`

- [ ] **Step 1: Implement** — create `src/components/auth/auth-layout.tsx`:

```tsx
import * as React from 'react'
import { CircleMark } from '@/components/circle-mark'
import { ThemeToggle } from '@/components/ui/theme-toggle'

/** Split-screen auth shell: form column (always) + brand panel (lg and up). */
export function AuthLayout({
  children,
  panel,
}: {
  children: React.ReactNode
  panel: React.ReactNode
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-2">
      {/* Left — form column */}
      <section className="flex flex-col justify-between gap-10 px-6 py-7 sm:px-12 lg:px-16 lg:py-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <CircleMark size={24} />
            <span>Circle</span>
          </div>
          <ThemeToggle />
        </header>

        <div className="w-full max-w-sm">{children}</div>

        <footer className="flex items-center justify-between text-xs text-ink-3">
          <div className="font-mono">© Circle · GCC</div>
          <div className="flex gap-3.5">
            <span>Privacy</span>
            <span>Terms</span>
          </div>
        </footer>
      </section>

      {/* Right — brand panel (desktop only) */}
      <aside className="hidden lg:block">{panel}</aside>
    </div>
  )
}

/**
 * The dark brand panel. Deliberately NOT themeable: near-black with lime in
 * both modes (brand canvas, like the sidebar gym tile). Fraunces headline.
 */
export function BrandPanel({
  eyebrow,
  headline,
  detail,
  description,
  footerNote,
}: {
  eyebrow: string
  headline: React.ReactNode
  detail?: React.ReactNode
  description: string
  footerNote: string
}) {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-[#0A0A0A] p-12 text-[#FAFAFA]">
      {/* Decorative rings + barbell bar */}
      <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full border-2 border-[#C8F135] opacity-35" />
      <div className="absolute -bottom-44 -right-20 h-[360px] w-[360px] rounded-full border-2 border-[#C8F135] opacity-20" />
      <div className="absolute right-20 top-20 h-[380px] w-1.5 rotate-[20deg] bg-[#B0B0B0] opacity-25" />

      <div className="relative flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#FAFAFA]/55">
          {eyebrow}
        </div>
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C8F135]">
          GCC
        </div>
      </div>

      <div className="relative">
        <div className="break-words font-display text-6xl font-semibold leading-[0.98] tracking-[-0.02em] text-[#C8F135] xl:text-7xl">
          {headline}
        </div>
        {detail && (
          <div className="mt-5 font-mono text-[15px] leading-[1.7] tracking-[0.02em] text-[#FAFAFA]/75">
            {detail}
          </div>
        )}
        <div className="my-6 h-px w-9 bg-[#C8F135]" />
        <div className="max-w-sm font-display text-lg font-medium leading-snug tracking-[-0.01em]">
          {description}
        </div>
      </div>

      <div className="relative flex items-center gap-4 text-xs text-[#FAFAFA]/60">
        <div className="flex items-center gap-2">
          <span className="c-pulse h-[7px] w-[7px] shrink-0 rounded-full bg-[#C8F135]" />
          <span className="font-mono uppercase tracking-[0.06em]">Live platform</span>
        </div>
        <div className="h-3.5 w-px bg-[#333]" />
        <span className="font-mono">{footerNote}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/auth-layout.tsx
git commit -m "feat(auth): AuthLayout + BrandPanel shell"
```

---

### Task 3: Shared `LoginForm` (TDD)

The password/code/verify state machine, extracted once from the two duplicated files. Logic is copied verbatim — only the rendering moves to primitives. Props: `redirectTo` (where `window.location.href` goes on success) and `newUserHint` (the footer line that differs per page).

**Files:**
- Create: `src/components/auth/login-form.tsx`
- Test: `src/components/auth/login-form.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/auth/login-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginForm } from './login-form'

const signInWithPassword = vi.fn()
const signInWithOtp = vi.fn()
const verifyOtp = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
    },
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders password mode by default', () => {
    render(<LoginForm redirectTo="/dashboard" newUserHint={<span>hint</span>} />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    // exact name — /sign in/i would also match the "Sign in with a code instead" switch
    expect(screen.getByRole('button', { name: 'Sign in →' })).toBeTruthy()
  })

  it('switches to code mode and back', () => {
    render(<LoginForm redirectTo="/dashboard" newUserHint={null} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a code instead/i }))
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.getByRole('button', { name: /send code/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /use a password instead/i }))
    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  it('sends the code with shouldCreateUser and shows the verify step', async () => {
    signInWithOtp.mockResolvedValue({ error: null })
    render(<LoginForm redirectTo="/dashboard" newUserHint={null} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in with a code instead/i }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    await waitFor(() => expect(screen.getByLabelText('6-digit code')).toBeTruthy())
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.co',
      options: { shouldCreateUser: true },
    })
  })

  it('shows the auth error as an alert', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<LoginForm redirectTo="/dashboard" newUserHint={null} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in →' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Invalid login credentials')
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/auth/login-form.test.tsx`
Expected: FAIL — `Cannot find module './login-form'`.

- [ ] **Step 3: Implement**

Create `src/components/auth/login-form.tsx`. Auth calls, redirects, copy, and the 6-digit filtering are verbatim from the originals (`src/app/page.tsx:18-64`); only rendering changes:

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'

export function LoginForm({
  redirectTo,
  newUserHint,
}: {
  redirectTo: string
  newUserHint: React.ReactNode
}) {
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Everyday sign-in. The code rail below covers first access, forgot-password
  // and self-signup — no magic links; the typed 6-digit code is the mechanism.
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      setError(error.message)
    } else {
      window.location.href = redirectTo
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    // shouldCreateUser stays true: self-signup rides this rail (owner → /onboarding, athlete → /join).
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setLoading(false)
    if (error) setError(error.message)
    else setCodeSent(true)
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    if (error) {
      setLoading(false)
      setError(error.message)
    } else {
      window.location.href = redirectTo
    }
  }

  function switchMode(next: 'password' | 'code') {
    setMode(next)
    setCodeSent(false)
    setCode('')
    setPassword('')
    setError(null)
  }

  return (
    <div className="c-stage-in">
      <div className="mb-3.5 font-mono text-xs uppercase tracking-[0.12em] text-ink-3">
        Sign in
      </div>
      <h1 className="mb-2 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-ink">
        The best hour
        <br />
        of your day.
      </h1>
      <p className="mb-8 text-sm text-ink-2">
        {mode === 'password' ? (
          'Sign in with your email and password.'
        ) : codeSent ? (
          <>
            We sent a 6-digit code to{' '}
            <span className="font-mono font-semibold text-ink">{email}</span>.
          </>
        ) : (
          "Enter your email and we'll send a 6-digit sign-in code."
        )}
      </p>

      {mode === 'password' && (
        <form onSubmit={handleSignIn} className="flex flex-col gap-3.5">
          <Field
            label="Email"
            type="email"
            required
            disabled={loading}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            disabled={loading}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in →'}
          </Button>
        </form>
      )}

      {mode === 'code' && !codeSent && (
        <form onSubmit={handleSendCode} className="flex flex-col gap-3.5">
          <Field
            label="Email"
            type="email"
            required
            disabled={loading}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Sending…' : 'Send code →'}
          </Button>
        </form>
      )}

      {mode === 'code' && codeSent && (
        <form onSubmit={handleVerifyCode} className="flex flex-col gap-3.5">
          <Field
            label="6-digit code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            disabled={loading}
            placeholder="123456"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-14 text-center font-mono text-2xl tracking-[0.2em]"
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={loading || code.length !== 6} className="w-full">
            {loading ? 'Verifying…' : 'Sign in →'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => {
              setCodeSent(false)
              setCode('')
              setError(null)
            }}
          >
            ← Use a different email
          </Button>
        </form>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={() => switchMode(mode === 'password' ? 'code' : 'password')}
        className="mt-4 text-sm font-semibold text-ink underline underline-offset-4 transition-colors hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
      >
        {mode === 'password' ? 'Sign in with a code instead' : 'Use a password instead'}
      </button>

      {newUserHint && <p className="mt-5 text-xs text-ink-2">{newUserHint}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/auth/login-form.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/login-form.tsx src/components/auth/login-form.test.tsx
git commit -m "feat(auth): shared LoginForm on Field/Button primitives"
```

---

### Task 4: Root login `/` rewrite

**Files:**
- Modify: `src/app/page.tsx` (full replacement — 274 lines → composition)

- [ ] **Step 1: Replace `src/app/page.tsx` in full**

```tsx
import { AuthLayout, BrandPanel } from '@/components/auth/auth-layout'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <AuthLayout
      panel={
        <BrandPanel
          eyebrow="Gym Management"
          headline={
            <>
              Manage.
              <br />
              Track.
              <br />
              Win.
            </>
          }
          detail={
            <>
              Classes · Members · WODs
              <br />
              1RMs · Leaderboards · Payments
            </>
          }
          description="Built for CrossFit boxes and boutique gyms across the GCC."
          footerNote="UAE · KSA · Qatar · Kuwait"
        />
      }
    >
      <LoginForm
        redirectTo="/dashboard"
        newUserHint={
          <>
            New to Circle?{' '}
            <span className="font-semibold text-ink">Ask your coach for an invite</span>.
          </>
        }
      />
    </AuthLayout>
  )
}
```

Note: the page is no longer `'use client'` — all client state lives in `LoginForm`/`ThemeToggle`. The root page becomes a server component (smaller bundle).

- [ ] **Step 2: Verify**

```bash
npm run type-check   # 0 errors
npm run test         # all green
```

- [ ] **Step 3: Visual smoke test**

`npm run dev`, open `http://localhost:3000/`:
- **Light mode** (set `localStorage.setItem('circle-theme','light')` + reload, or toggle): ivory background, white input cards, lime button with dark text, Fraunces headline.
- **Dark mode** (toggle): near-black, same layout — brand panel identical in both.
- **375px width** (devtools): single column, no brand panel, form fills the width, no horizontal scroll.
- Password → code → verify flows still work (send a real code to your email or stop at the UI transition).
- Tab order: toggle → email → password → submit, lime focus rings visible.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(b2): root login on AuthLayout + LoginForm — themeable, mobile-first"
```

---

### Task 5: Gym login `/[gymSlug]` rewrite

**Files:**
- Modify: `src/app/[gymSlug]/_components/gym-login-form.tsx` (full replacement — same export name + props; `src/app/checkin/[token]/page.tsx` also imports it)

- [ ] **Step 1: Replace `src/app/[gymSlug]/_components/gym-login-form.tsx` in full**

```tsx
import { AuthLayout, BrandPanel } from '@/components/auth/auth-layout'
import { LoginForm } from '@/components/auth/login-form'

export function GymLoginForm({
  gymName,
  gymSlug,
  redirectTo,
}: {
  gymName: string
  gymSlug: string
  redirectTo?: string
}) {
  return (
    <AuthLayout
      panel={
        <BrandPanel
          eyebrow="Member Portal"
          headline={gymName}
          description="Book classes, track your WODs, and manage your membership — all in one place."
          footerNote="Powered by Circle"
        />
      }
    >
      <LoginForm
        redirectTo={redirectTo ?? `/join/${gymSlug}`}
        newUserHint={
          <>
            New to {gymName}?{' '}
            <span className="font-semibold text-ink">
              Sign in with a code to create your account
            </span>
            .
          </>
        }
      />
    </AuthLayout>
  )
}
```

Note: no `'use client'` — this is now a server component composing client children. The `redirectTo ?? /join/<slug>` default matches the original exactly (original lines 27/53).

- [ ] **Step 2: Verify**

```bash
npm run type-check   # 0 errors — confirms checkin/[token] caller still satisfied
npm run test         # all green
```

- [ ] **Step 3: Visual smoke test**

`npm run dev`, open `http://localhost:3000/<your-test-gym-slug>` (or any seeded slug; signed-out browser/incognito — authed users redirect to /join):
- Gym name renders in Fraunces on the dark panel, both themes correct on the form side, single column at 375px.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[gymSlug]/_components/gym-login-form.tsx"
git commit -m "feat(b2): gym login composes AuthLayout + LoginForm (same public API)"
```

---

### Task 6: `/join/[gymSlug]` form rewrite

**Files:**
- Modify: `src/app/join/[gymSlug]/_components/join-form.tsx` (full replacement; `useFormState` + action prop unchanged)

- [ ] **Step 1: Replace `src/app/join/[gymSlug]/_components/join-form.tsx` in full**

```tsx
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
```

- [ ] **Step 2: Verify**

```bash
npm run type-check   # 0 errors
npm run test         # all green
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/join/[gymSlug]/_components/join-form.tsx"
git commit -m "feat(b2): join form on Card + Field primitives"
```

---

### Task 7: `/onboarding` rewrite

**Files:**
- Modify: `src/app/onboarding/page.tsx` (full replacement; imports `toSlug` from Task 1, drops the inline copy and the local `Field`/`inputStyle` helpers)

- [ ] **Step 1: Replace `src/app/onboarding/page.tsx` in full**

```tsx
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
```

- [ ] **Step 2: Verify**

```bash
npm run type-check   # 0 errors
npm run test         # all green (slug tests from Task 1 still pass)
```

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(b2): onboarding on Card + Field + Select primitives"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full gate run**

```bash
npm run lint           # 0 errors
npm run type-check     # 0 errors
npm run test           # all pass (existing 873 + 8 new: slug 4, login-form 4)
npm run test:coverage  # thresholds pass
npm run build          # production build succeeds
```

- [ ] **Step 2: Grep for legacy leftovers on B2 surfaces**

```bash
grep -rn "c-ink\|c-surface\|c-border\|c-bg\|circle-lime\|font-space-grotesk" \
  src/app/page.tsx "src/app/[gymSlug]" "src/app/join" src/app/onboarding/page.tsx \
  src/components/auth/
```
Expected: NO matches (all four surfaces fully on semantic tokens). `src/app/onboarding/error.tsx` is intentionally excluded — it keeps legacy styling until a later batch.

- [ ] **Step 3: Visual pass — both themes, three widths**

`npm run dev`, then for `/`, `/<gym-slug>` (incognito), `/onboarding` (authed code-rail user), `/join/<slug>` (authed profile-less user — or at minimum confirm it compiles and the form renders by temporarily viewing it):
1. Light + dark via the ThemeToggle on each page — ivory/white vs near-black, lime CTAs with dark text in both.
2. 375px: single column, no horizontal scroll, 44px inputs/buttons.
3. 1440px: split layout with the dark brand panel, Fraunces headlines.
4. Keyboard-only: tab through root login — toggle → email → password → submit → mode switch, lime focus rings on everything.

- [ ] **Step 4: Commit stragglers and report**

```bash
git status   # should be clean
```

Report against spec §6: B2 ✅ (member-facing pages mobile-first on the design system).

---

## What this plan does NOT do (next plans)

- **B3** — dashboard migration (5 sub-batches), Dialog/Tabs via shadcn CLI, ThemeToggle in sidebar, `.theme-dark` pin removal, TIMEZONE_OFFSETS consolidation, legacy chrome-class cleanup.
- **B4** — checkin/tv pinned-dark layouts (checkin's embedded `GymLoginForm` gets its dark pin there), embeds, unsubscribe.
- **B5** — dunning portal UI, email templates, final deletion of `--c-*`/`--circle-*` legacy tokens, `.circle-mark` CSS class, `.circle-dark` scope, and the legacy error.tsx styling in `[gymSlug]`/`onboarding`.
