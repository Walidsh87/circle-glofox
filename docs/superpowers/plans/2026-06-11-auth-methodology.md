# Permanent Auth Methodology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Password is the everyday login; a typed 6-digit email code is the single secondary rail (first access, forgot-password, self-signup) — no magic links, no reset emails.

**Architecture:** Both login forms gain a "Sign in with a code instead" toggle restoring the pre-hack two-step code flow alongside the password form. A `ChangePasswordCard` on the user's own member profile sets the password (`auth.updateUser`) and stamps `user_metadata.has_password`; a dismissible `PasswordNudge` on the dashboard home shows until that stamp exists. Spec: `docs/superpowers/specs/2026-06-11-auth-methodology-design.md`.

**Tech Stack:** Next.js 16 App Router, Supabase JS auth (`signInWithPassword`, `signInWithOtp`, `verifyOtp`, `updateUser`), Vitest.

**Conventions for every task:** run a test and READ its result before any chained commit (never pipe vitest into `tail` inside a `&&` chain that commits). Inline styles with `var(--c-*)` tokens; match each file's existing idiom. Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: `validateNewPassword` pure lib (TDD)

**Files:**
- Create: `src/lib/auth/password.ts`
- Test: `src/lib/auth/password.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth/password.test.ts
import { test, expect } from 'vitest'
import { validateNewPassword } from './password'

test('rejects passwords under 8 characters', () => {
  expect(validateNewPassword('short7!', 'short7!')).toBe('Password must be at least 8 characters.')
})

test('rejects mismatched confirmation', () => {
  expect(validateNewPassword('longenough', 'different')).toBe('Passwords do not match.')
})

test('rejects empty confirmation', () => {
  expect(validateNewPassword('longenough', '')).toBe('Passwords do not match.')
})

test('accepts a valid pair (exactly 8 chars)', () => {
  expect(validateNewPassword('12345678', '12345678')).toBeNull()
})

test('length check runs before match check', () => {
  expect(validateNewPassword('short', 'different')).toBe('Password must be at least 8 characters.')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/auth/password.test.ts`
Expected: FAIL — "Failed to resolve import ./password".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/auth/password.ts
/** Validates a new password + confirmation. Returns a human message or null when valid. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password !== confirm) return 'Passwords do not match.'
  return null
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/auth/password.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/password.ts src/lib/auth/password.test.ts
git commit -m "feat(auth): validateNewPassword (min 8 + confirm match)"
```

---

### Task 2: ChangePasswordCard on own profile

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/change-password-card.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx` (render when `isSelf` — there is an existing `isSelf` const ~line 82 and an isSelf-gated ReferCard render in the JSX; place this card directly before/after that render site)

- [ ] **Step 1: Create the card component**

```tsx
// src/app/dashboard/members/[memberId]/_components/change-password-card.tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validateNewPassword } from '@/lib/auth/password'

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 12px', borderRadius: 8,
  border: '1px solid var(--c-border)', background: 'var(--c-surface)',
  fontSize: 14, color: 'var(--c-ink)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

export function ChangePasswordCard() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    const invalid = validateNewPassword(password, confirm)
    if (invalid) { setError(invalid); return }
    setError(null)
    setSaving(true)
    const supabase = createClient()
    // Stamping has_password drives the dashboard nudge; UX hint, not a security control.
    const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } })
    setSaving(false)
    if (error) setError(error.message)
    else { setDone(true); setPassword(''); setConfirm('') }
  }

  return (
    <section style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Password</h2>
      {done ? (
        <p style={{ fontSize: 13.5, color: 'var(--c-ink)' }}>Password updated — use it next time you sign in.</p>
      ) : (
        <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
          <input type="password" autoComplete="new-password" placeholder="New password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
          {error && <p style={{ fontSize: 12.5, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={saving || !password || !confirm} style={{ height: 38, borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving || !password || !confirm ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Set password'}
          </button>
        </form>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Wire into the member profile page**

In `src/app/dashboard/members/[memberId]/page.tsx`: add the import, then find the isSelf-gated ReferCard block in the JSX (search for `ReferCard` / `referLink`) and render the card for every `isSelf` viewer (not athlete-only):

```tsx
import { ChangePasswordCard } from './_components/change-password-card'
// …in the JSX, adjacent to the ReferCard render site:
{isSelf && <ChangePasswordCard />}
```

Read the surrounding JSX first and match how sibling cards are laid out (they sit in a flex/grid column of section cards — insert as one more sibling).

- [ ] **Step 3: Verify**

Run: `npm run type-check` → 0 errors. Run: `npx vitest run` → all pass (no test touches this page).

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/change-password-card.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(auth): ChangePasswordCard on own profile (updateUser + has_password stamp)"
```

---

### Task 3: PasswordNudge on dashboard home

**Files:**
- Create: `src/app/dashboard/_components/password-nudge.tsx`
- Modify: `src/app/dashboard/page.tsx` (read the metadata flag from the guard's `user`; render at the top of the scroll area)

- [ ] **Step 1: Create the nudge component**

```tsx
// src/app/dashboard/_components/password-nudge.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const DISMISS_KEY = 'pw-nudge-dismissed'

export function PasswordNudge({ show }: { show: boolean }) {
  // localStorage is read in an effect so server and first client render agree (both hidden).
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (show && !localStorage.getItem(DISMISS_KEY)) setVisible(true)
  }, [show])
  if (!visible) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 10, background: 'var(--circle-lime-soft)', border: '1px solid var(--circle-lime)', marginBottom: 20 }}>
      <span style={{ fontSize: 13, color: 'var(--c-ink)' }}>Set a password to sign in faster next time.</span>
      <Link href="/dashboard/profile" style={{ fontSize: 13, fontWeight: 700, color: 'var(--circle-lime-ink)', textDecoration: 'none' }}>Set password →</Link>
      <button aria-label="Dismiss" onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setVisible(false) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-ink-muted)', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  )
}
```

- [ ] **Step 2: Wire into the dashboard home**

In `src/app/dashboard/page.tsx`: the page already destructures `user` from `requirePage()`. Add:

```tsx
import { PasswordNudge } from './_components/password-nudge'
// after the guard call:
const hasPassword = user.user_metadata?.has_password === true
// first child inside the scroll-area div (above the stat cards):
<PasswordNudge show={!hasPassword} />
```

If the page currently destructures without `user`, add `user` to the destructure. Read the file region first; insert surgically.

- [ ] **Step 3: Verify**

Run: `npm run type-check` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/_components/password-nudge.tsx src/app/dashboard/page.tsx
git commit -m "feat(auth): set-password nudge on dashboard until has_password is stamped"
```

---

### Task 4: Code-rail toggle on the main login

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace state + handlers**

Replace the current state block and `handleSignIn` (keep `handleSignIn` itself — add around it):

```tsx
export default function LoginPage() {
  const [mode, setMode]         = useState<'password' | 'code'>('password')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  // Everyday sign-in. The code rail below covers first access, forgot-password
  // and self-signup — no magic links; the typed 6-digit code is the mechanism.
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else window.location.href = '/dashboard'
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    // shouldCreateUser stays true: a brand-new gym owner self-starts here (code → /onboarding).
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
    setLoading(false)
    if (error) setError(error.message)
    else window.location.href = '/dashboard'
  }

  function switchMode(next: 'password' | 'code') {
    setMode(next)
    setCodeSent(false)
    setCode('')
    setPassword('')
    setError(null)
  }
```

- [ ] **Step 2: Replace the form-body JSX**

Inside the existing `<div style={{ maxWidth: 380, width: '100%' }}>` / `c-stage-in` block, keep the eyebrow + h1, then:

```tsx
            <p style={{ color: 'var(--c-ink-muted)', fontSize: 14, marginBottom: 32 }}>
              {mode === 'password' ? 'Sign in with your email and password.'
                : codeSent ? <>We sent a 6-digit code to <span className="mono" style={{ color: 'var(--c-ink)', fontWeight: 600 }}>{email}</span>.</>
                : "Enter your email and we'll send a 6-digit sign-in code."}
            </p>

            {mode === 'password' ? (
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* existing Email input — unchanged */}
                {/* existing Password input — unchanged */}
                {error && <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
                {/* existing submit button — unchanged ('Signing in…' / 'Sign in →') */}
              </form>
            ) : !codeSent ? (
              <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* the SAME Email input markup as the password form */}
                {error && <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
                <button type="submit" disabled={loading} style={{ height: 46, background: 'var(--circle-lime)', border: 'none', borderRadius: 10, fontSize: 14.5, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--circle-ink)', letterSpacing: '0.01em', opacity: loading ? 0.7 : 1, transition: 'opacity .12s' }}>
                  {loading ? 'Sending…' : 'Send code →'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>6-digit code</div>
                  <input
                    type="text" inputMode="numeric" autoComplete="one-time-code" required placeholder="123456"
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ width: '100%', height: 54, padding: '0 14px', border: '1.5px solid var(--c-border-strong)', borderRadius: 10, background: 'var(--c-surface)', fontSize: 28, color: 'var(--c-ink)', fontFamily: 'var(--font-geist-mono)', outline: 'none', letterSpacing: '0.2em', textAlign: 'center', boxSizing: 'border-box' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--circle-lime)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--c-border-strong)')}
                    autoFocus
                  />
                </label>
                {error && <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
                <button type="submit" disabled={loading || code.length !== 6} style={{ height: 46, background: 'var(--circle-lime)', border: 'none', borderRadius: 10, fontSize: 14.5, fontWeight: 700, cursor: (loading || code.length !== 6) ? 'not-allowed' : 'pointer', color: 'var(--circle-ink)', letterSpacing: '0.01em', opacity: (loading || code.length !== 6) ? 0.6 : 1, transition: 'opacity .12s' }}>
                  {loading ? 'Verifying…' : 'Sign in →'}
                </button>
                <button type="button" onClick={() => { setCodeSent(false); setCode(''); setError(null) }} style={{ background: 'none', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--c-ink-2)' }}>← Use a different email</button>
              </form>
            )}

            <button
              type="button"
              onClick={() => switchMode(mode === 'password' ? 'code' : 'password')}
              style={{ marginTop: 16, background: 'none', border: 'none', padding: 0, fontSize: 13, cursor: 'pointer', color: 'var(--c-ink)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              {mode === 'password' ? 'Sign in with a code instead' : 'Use a password instead'}
            </button>
```

Keep the "New to Circle? Ask your coach for an invite." footer paragraph after the toggle. The comment markers above ("existing Email input — unchanged") mean: keep the literal JSX already in the file for those inputs; only the wrapper/conditional structure changes.

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm run lint` → clean. Manual: `localhost:3000` (dev server) — password login works; toggle shows code flow; "Send code" emails a code; typing it signs in to `/dashboard`.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(auth): code-rail toggle on main login (password primary, typed 6-digit secondary)"
```

---

### Task 5: Code-rail toggle on the gym login (restores self-signup)

**Files:**
- Modify: `src/app/[gymSlug]/_components/gym-login-form.tsx`

- [ ] **Step 1: Apply the SAME transformation as Task 4** with these deltas:

1. All three success redirects go to `` `/join/${gymSlug}` `` instead of `/dashboard` (password sign-in, and code verify).
2. The `shouldCreateUser: true` comment reads: `// shouldCreateUser true = self-signup: typing the code creates the auth account; /join then creates the athlete profile.`
3. DELETE the now-stale testing-regression comment block ("NOTE: this disables new-athlete self-signup…") above `handleSignIn`.
4. The footer paragraph becomes (restores the join funnel copy):

```tsx
            <p style={{ marginTop: 22, fontSize: 12, color: 'var(--c-ink-muted)' }}>
              New to {gymName}?{' '}
              <span style={{ color: 'var(--c-ink)', fontWeight: 600 }}>Sign in with a code to create your account</span>.
            </p>
```

The state block, the three handlers (`handleSignIn`/`handleSendCode`/`handleVerifyCode`), `switchMode`, and the conditional form JSX are otherwise IDENTICAL to Task 4 Step 1–2 code (same styles, same code-input markup) — copy them, then apply the four deltas.

- [ ] **Step 2: Verify**

Run: `npm run type-check && npm run lint` → clean. Manual: open `localhost:3000/functional-fitness` — password login lands on `/join/functional-fitness` (passes through for existing members); code path sends + verifies.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[gymSlug]/_components/gym-login-form.tsx"
git commit -m "feat(auth): code rail on gym login — restores athlete self-signup"
```

---

### Task 6: Stamp has_password in the dev script

**Files:**
- Modify: `scripts/set-password.mjs`

- [ ] **Step 1: Extend the admin update** (replace the existing `updateUserById` call):

```js
const { error } = await service.auth.admin.updateUserById(profile.id, {
  password,
  user_metadata: { has_password: true },
})
```

(Note: the admin API takes `user_metadata`; the browser `updateUser` takes `data` — both write the same field.)

- [ ] **Step 2: Verify + re-stamp the owner account**

Run: `node --env-file=.env.local scripts/set-password.mjs waleed.shtawi@gmail.com <current password>` → "Password set for Walid Shtaiwi (owner)." (re-running with the same password is fine; it just adds the stamp so the owner never sees the nudge).

- [ ] **Step 3: Commit**

```bash
git add scripts/set-password.mjs
git commit -m "chore(auth): dev set-password script stamps has_password metadata"
```

---

### Task 7: Final gate + push

- [ ] **Step 1:** `npm run type-check` → 0 errors. `npm run lint` → clean. `npx vitest run` → expect **764 passed** (759 + 5 from Task 1). READ each result.
- [ ] **Step 2:** `npm run build` → compiles.
- [ ] **Step 3:** Manual sweep on localhost: password login (both forms) · toggle → code login → dashboard shows the nudge (account without stamp) · set password via profile card → nudge gone on next load · re-login with the new password.
- [ ] **Step 4:** `git push origin main`, then report: self-signup restored, no email-link flows anywhere, forgot-password = code rail + profile card.
