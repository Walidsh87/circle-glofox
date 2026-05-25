# Digital Waivers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the athlete dashboard behind a UAE-compliant liability waiver that must be signed once on first login — owners and coaches are exempt.

**Architecture:** A new `dashboard/layout.tsx` server component checks if the current athlete has a `waiver_signatures` row; if not, redirects to `/dashboard/sign-waiver`. Middleware adds an `x-pathname` header so the layout can skip the gate on the signing page itself (preventing a redirect loop). Waiver content is auto-generated per gym via a Supabase trigger on `boxes` insert.

**Tech Stack:** Next.js 14 App Router server components, Supabase (Postgres + RLS), Zod, `useFormState`/`useFormStatus` (react-dom), inline CSS with existing design tokens.

---

## File Map

| File | Action |
|------|--------|
| `migrations/008_waivers.sql` | CREATE — 2 tables + RLS + trigger + backfill |
| `src/middleware.ts` | MODIFY — add `x-pathname` header to forwarded request |
| `src/app/dashboard/layout.tsx` | CREATE — waiver gate for athletes |
| `src/app/dashboard/sign-waiver/_lib/validation.ts` | CREATE — `validateWaiverSignature` |
| `src/app/dashboard/sign-waiver/_actions/sign-waiver.ts` | CREATE — server action + re-export |
| `src/app/dashboard/sign-waiver/_components/sign-waiver-form.tsx` | CREATE — client form |
| `src/app/dashboard/sign-waiver/page.tsx` | CREATE — athlete signing page |
| `src/app/dashboard/waivers/page.tsx` | CREATE — owner view |
| `src/components/sidebar.tsx` | MODIFY — add Waivers nav item for owners |
| `src/__tests__/sign-waiver.test.ts` | CREATE — 6 unit tests |

---

## Task 1: Database migration

**Files:**
- Create: `migrations/008_waivers.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/008_waivers.sql
-- Run in Supabase SQL Editor

-- Waiver templates (one per gym, auto-created by trigger)
CREATE TABLE IF NOT EXISTS gym_waivers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     UUID NOT NULL UNIQUE REFERENCES boxes(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gym_waivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY gym_waivers_read ON gym_waivers
  FOR SELECT USING (box_id = auth_box_id());

-- Athlete signatures
CREATE TABLE IF NOT EXISTS waiver_signatures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  signed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address  TEXT,
  user_agent  TEXT,
  UNIQUE (box_id, athlete_id)
);

ALTER TABLE waiver_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY waiver_signatures_athlete_select ON waiver_signatures
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE POLICY waiver_signatures_athlete_insert ON waiver_signatures
  FOR INSERT WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE POLICY waiver_signatures_owner_read ON waiver_signatures
  FOR SELECT USING (auth_role() = 'owner' AND box_id = auth_box_id());

-- Auto-create waiver when a gym is created
CREATE OR REPLACE FUNCTION create_default_waiver()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO gym_waivers (box_id, content)
  VALUES (
    NEW.id,
    'LIABILITY WAIVER & RELEASE OF CLAIMS

This Liability Waiver and Release of Claims ("Waiver") is entered into by the undersigned participant ("Participant") and ' || NEW.name || ' ("Gym"), a fitness facility operating in the United Arab Emirates.

1. ACKNOWLEDGEMENT OF RISK

The Participant acknowledges that participation in physical fitness activities, including but not limited to weightlifting, cardiovascular training, and group fitness classes, involves inherent risks of physical injury, illness, or death. The Participant voluntarily assumes all such risks.

2. RELEASE OF LIABILITY

The Participant releases, waives, and discharges the Gym, its owners, coaches, employees, and agents from any claims arising from ordinary negligence in connection with gym activities. This release does not apply to gross negligence or intentional misconduct.

3. MEDICAL FITNESS

The Participant confirms they are in adequate physical health to participate in fitness activities and will promptly inform the Gym of any medical conditions or physical limitations that may affect their participation.

4. GOVERNING LAW

This Waiver shall be governed by the laws of the United Arab Emirates. Disputes shall be subject to the exclusive jurisdiction of the UAE courts.

5. DATA CONSENT

The Participant consents to the collection and storage of personal data (name, email, fitness records, electronic signature) as required to deliver gym services, in accordance with UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection.

This Waiver is executed electronically and constitutes a legally binding agreement under UAE Federal Law No. 1 of 2006 on Electronic Commerce and Transactions.'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER boxes_create_waiver
  AFTER INSERT ON boxes
  FOR EACH ROW
  EXECUTE FUNCTION create_default_waiver();

-- Backfill waivers for any gyms created before this migration
INSERT INTO gym_waivers (box_id, content)
SELECT b.id,
  'LIABILITY WAIVER & RELEASE OF CLAIMS

This Liability Waiver and Release of Claims ("Waiver") is entered into by the undersigned participant ("Participant") and ' || b.name || ' ("Gym"), a fitness facility operating in the United Arab Emirates.

1. ACKNOWLEDGEMENT OF RISK

The Participant acknowledges that participation in physical fitness activities, including but not limited to weightlifting, cardiovascular training, and group fitness classes, involves inherent risks of physical injury, illness, or death. The Participant voluntarily assumes all such risks.

2. RELEASE OF LIABILITY

The Participant releases, waives, and discharges the Gym, its owners, coaches, employees, and agents from any claims arising from ordinary negligence in connection with gym activities. This release does not apply to gross negligence or intentional misconduct.

3. MEDICAL FITNESS

The Participant confirms they are in adequate physical health to participate in fitness activities and will promptly inform the Gym of any medical conditions or physical limitations that may affect their participation.

4. GOVERNING LAW

This Waiver shall be governed by the laws of the United Arab Emirates. Disputes shall be subject to the exclusive jurisdiction of the UAE courts.

5. DATA CONSENT

The Participant consents to the collection and storage of personal data (name, email, fitness records, electronic signature) as required to deliver gym services, in accordance with UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection.

This Waiver is executed electronically and constitutes a legally binding agreement under UAE Federal Law No. 1 of 2006 on Electronic Commerce and Transactions.'
FROM boxes b
WHERE NOT EXISTS (SELECT 1 FROM gym_waivers w WHERE w.box_id = b.id);
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Copy the full content of `migrations/008_waivers.sql` into Supabase → SQL Editor → New query → Run.

Expected: success with no errors. Verify in Table Editor: `gym_waivers` and `waiver_signatures` tables exist. Verify `gym_waivers` has one row per existing gym.

- [ ] **Step 3: Commit**

```bash
git add migrations/008_waivers.sql
git commit -m "feat(waivers): add gym_waivers and waiver_signatures tables with RLS and trigger"
```

---

## Task 2: Validation + tests (TDD)

**Files:**
- Create: `src/app/dashboard/sign-waiver/_lib/validation.ts`
- Create: `src/__tests__/sign-waiver.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/__tests__/sign-waiver.test.ts`:

```typescript
import { validateWaiverSignature } from '@/app/dashboard/sign-waiver/_actions/sign-waiver'

describe('validateWaiverSignature', () => {
  test('returns error when checkbox is unchecked', () => {
    const result = validateWaiverSignature(false, 'Ahmed Ali', 'Ahmed Ali')
    expect(result).toBe('You must check the box to agree.')
  })

  test('returns error when typed name is empty', () => {
    const result = validateWaiverSignature(true, '', 'Ahmed Ali')
    expect(result).toBe('Please type your full legal name.')
  })

  test('returns error when profile name is missing', () => {
    const result = validateWaiverSignature(true, 'Ahmed Ali', '')
    expect(result).toBe('Your profile name is missing. Contact your gym owner.')
  })

  test('returns error when typed name does not match profile name', () => {
    const result = validateWaiverSignature(true, 'Ahmed Ali', 'Sara Hassan')
    expect(result).toBe('Name does not match your registered name.')
  })

  test('returns null when name matches exactly', () => {
    const result = validateWaiverSignature(true, 'Ahmed Ali', 'Ahmed Ali')
    expect(result).toBeNull()
  })

  test('returns null when name matches case-insensitively', () => {
    const result = validateWaiverSignature(true, 'ahmed ali', 'Ahmed Ali')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "Circle Glofox" && npm run test -- sign-waiver
```

Expected: FAIL — `Cannot find module '@/app/dashboard/sign-waiver/_actions/sign-waiver'`

- [ ] **Step 3: Create the validation file**

Create `src/app/dashboard/sign-waiver/_lib/validation.ts`:

```typescript
import { z } from 'zod'

const waiverSignatureSchema = z.object({
  typedName: z.string().min(1),
  profileName: z.string().min(1),
})

export function validateWaiverSignature(
  checked: boolean,
  typedName: string,
  profileName: string
): string | null {
  if (!checked) return 'You must check the box to agree.'
  if (!typedName?.trim()) return 'Please type your full legal name.'
  if (!profileName?.trim()) return 'Your profile name is missing. Contact your gym owner.'
  const result = waiverSignatureSchema.safeParse({ typedName: typedName.trim(), profileName: profileName.trim() })
  if (!result.success) return 'Please type your full legal name.'
  if (typedName.trim().toLowerCase() !== profileName.trim().toLowerCase())
    return 'Name does not match your registered name.'
  return null
}
```

- [ ] **Step 4: Create the stub action file so the import resolves**

Create `src/app/dashboard/sign-waiver/_actions/sign-waiver.ts` with only the re-export for now:

```typescript
'use server'

export { validateWaiverSignature } from '../_lib/validation'
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm run test -- sign-waiver
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/sign-waiver/_lib/validation.ts src/app/dashboard/sign-waiver/_actions/sign-waiver.ts src/__tests__/sign-waiver.test.ts
git commit -m "feat(waivers): add validateWaiverSignature with tests"
```

---

## Task 3: Sign-waiver server action (complete)

**Files:**
- Modify: `src/app/dashboard/sign-waiver/_actions/sign-waiver.ts`

- [ ] **Step 1: Replace the stub with the full action**

Overwrite `src/app/dashboard/sign-waiver/_actions/sign-waiver.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateWaiverSignature } from '../_lib/validation'

export { validateWaiverSignature }

type State = { error: string | null }

export async function signWaiver(prevState: State, formData: FormData): Promise<State> {
  const checked = formData.get('agreed') === 'true'
  const typedName = (formData.get('fullName') as string)?.trim() ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.' }
  if (profile.role !== 'athlete') return { error: 'Only athletes need to sign the waiver.' }

  const validationError = validateWaiverSignature(checked, typedName, profile.full_name)
  if (validationError) return { error: validationError }

  const headersList = headers()
  const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = headersList.get('user-agent') ?? null

  const { error: dbError } = await supabase.from('waiver_signatures').insert({
    box_id: profile.box_id,
    athlete_id: user.id,
    full_name: typedName,
    ip_address: ipAddress,
    user_agent: userAgent,
  })

  if (dbError) {
    if (dbError.code === '23505') return { error: 'You have already signed the waiver.' }
    return { error: dbError.message }
  }

  redirect('/dashboard')
}
```

- [ ] **Step 2: Run tests — verify still passing**

```bash
npm run test -- sign-waiver
```

Expected: 6 tests still pass (action re-exports the validation function unchanged).

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/sign-waiver/_actions/sign-waiver.ts
git commit -m "feat(waivers): implement signWaiver server action"
```

---

## Task 4: Middleware — add x-pathname header

**Files:**
- Modify: `src/middleware.ts`

This header lets `dashboard/layout.tsx` know the current path without importing from `next/navigation` (which isn't available in server components during layout rendering). It prevents the redirect loop: layout reads the header, sees it's `/dashboard/sign-waiver`, and skips the gate.

- [ ] **Step 1: Add requestHeaders and pass through middleware**

Replace the current content of `src/middleware.ts` with:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Forward the pathname as a header so server component layouts can read it
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — do not remove this
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtected = path.startsWith('/dashboard') || path.startsWith('/onboarding')

  // Unauthenticated users cannot access protected routes
  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(waivers): forward x-pathname header through middleware for layout gate"
```

---

## Task 5: Dashboard layout gate

**Files:**
- Create: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Create the layout**

Create `src/app/dashboard/layout.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Skip gate on the signing page itself to prevent redirect loop
  const pathname = headers().get('x-pathname') ?? ''
  if (pathname === '/dashboard/sign-waiver') {
    return <>{children}</>
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Middleware already redirects unauthenticated users — guard here is just safety
  if (!user) return <>{children}</>

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id')
    .eq('id', user.id)
    .single()

  // Owners and coaches are exempt from the waiver gate
  if (!profile || profile.role !== 'athlete') {
    return <>{children}</>
  }

  const { data: signature } = await supabase
    .from('waiver_signatures')
    .select('id')
    .eq('box_id', profile.box_id)
    .eq('athlete_id', user.id)
    .maybeSingle()

  if (!signature) {
    redirect('/dashboard/sign-waiver')
  }

  return <>{children}</>
}
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(waivers): gate athlete dashboard until waiver is signed"
```

---

## Task 6: Athlete signing page

**Files:**
- Create: `src/app/dashboard/sign-waiver/_components/sign-waiver-form.tsx`
- Create: `src/app/dashboard/sign-waiver/page.tsx`

- [ ] **Step 1: Create the client form component**

Create `src/app/dashboard/sign-waiver/_components/sign-waiver-form.tsx`:

```typescript
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { signWaiver } from '../_actions/sign-waiver'

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      style={{
        width: '100%',
        height: 48,
        background: pending || disabled ? 'var(--c-surface-alt)' : 'var(--circle-lime)',
        border: 'none',
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 700,
        cursor: pending || disabled ? 'not-allowed' : 'pointer',
        color: pending || disabled ? 'var(--c-ink-muted)' : 'var(--circle-ink)',
        fontFamily: 'inherit',
      }}
    >
      {pending ? 'Signing…' : 'Sign Waiver & Enter Dashboard →'}
    </button>
  )
}

export function SignWaiverForm({ profileName }: { profileName: string }) {
  const [state, formAction] = useFormState(signWaiver, { error: null })
  const [agreed, setAgreed] = useState(false)
  const [typedName, setTypedName] = useState('')

  const nameMatches = typedName.trim().toLowerCase() === profileName.trim().toLowerCase()
  const canSubmit = agreed && typedName.trim().length > 0

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="agreed" value={String(agreed)} />

      {/* Checkbox */}
      <div
        onClick={() => setAgreed(!agreed)}
        style={{
          background: 'var(--c-surface)',
          border: `1px solid ${agreed ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: 18,
          height: 18,
          border: `2px solid ${agreed ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
          borderRadius: 4,
          marginTop: 1,
          flexShrink: 0,
          background: agreed ? 'var(--circle-lime)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--circle-ink)',
          fontWeight: 700,
        }}>
          {agreed ? '✓' : ''}
        </div>
        <span style={{ fontSize: 13, color: 'var(--c-ink-2)', lineHeight: 1.5 }}>
          I have read, understood, and voluntarily agree to the terms of this Liability Waiver.
          I confirm I am 18 years of age or older.
        </span>
      </div>

      {/* Typed name */}
      <div>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--c-ink-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          Type your full legal name to sign
        </div>
        <input
          name="fullName"
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={profileName}
          style={{
            width: '100%',
            height: 44,
            padding: '0 14px',
            background: 'var(--c-surface)',
            border: `1px solid ${typedName && nameMatches ? 'var(--circle-lime)' : 'var(--c-border-strong)'}`,
            borderRadius: 8,
            fontSize: 15,
            color: 'var(--circle-lime)',
            fontFamily: 'var(--font-geist-mono)',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        {typedName && !nameMatches && (
          <div style={{ fontSize: 12, color: 'var(--c-danger)', marginTop: 6 }}>
            Must match your registered name: {profileName}
          </div>
        )}
      </div>

      <SubmitButton disabled={!canSubmit} />

      {state.error && (
        <div style={{ fontSize: 13, color: 'var(--c-danger)', textAlign: 'center' }}>
          {state.error}
        </div>
      )}

      <div style={{
        fontSize: 11,
        color: 'var(--c-ink-faint)',
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        Signing electronically under UAE Federal Law No. 1 of 2006<br />
        Your IP address and timestamp will be recorded
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Create the server page**

Create `src/app/dashboard/sign-waiver/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignWaiverForm } from './_components/sign-waiver-form'

export default async function SignWaiverPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (profile.role !== 'athlete') redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes)
    ? (boxes[0]?.name ?? '')
    : (boxes as { name: string } | null)?.name ?? ''

  // Already signed — redirect to dashboard
  const { data: signature } = await supabase
    .from('waiver_signatures')
    .select('id')
    .eq('box_id', profile.box_id)
    .eq('athlete_id', user.id)
    .maybeSingle()

  if (signature) redirect('/dashboard')

  const { data: waiver } = await supabase
    .from('gym_waivers')
    .select('content')
    .eq('box_id', profile.box_id)
    .single()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--c-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      fontFamily: 'var(--font-geist-sans)',
    }}>
      <div style={{ width: '100%', maxWidth: 640 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-block',
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: 8,
            padding: '5px 14px',
            color: 'var(--c-ink-muted)',
            fontSize: 12,
            marginBottom: 14,
            fontFamily: 'var(--font-geist-mono)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.08em',
          }}>{boxName}</div>
          <h1 style={{
            fontFamily: 'var(--font-space-grotesk)',
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--c-ink)',
            marginBottom: 8,
            letterSpacing: '-0.02em',
          }}>Before you enter the gym</h1>
          <p style={{ color: 'var(--c-ink-muted)', fontSize: 14, margin: 0 }}>
            Please read and sign this liability waiver to continue.
          </p>
        </div>

        {/* Waiver text */}
        {waiver && (
          <div style={{
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: 10,
            padding: '20px 22px',
            marginBottom: 20,
            maxHeight: 300,
            overflowY: 'auto',
          }}>
            <pre style={{
              fontFamily: 'var(--font-geist-sans)',
              fontSize: 13,
              color: 'var(--c-ink-2)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}>{waiver.content}</pre>
          </div>
        )}

        <SignWaiverForm profileName={profile.full_name} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```bash
npm run test
```

Expected: all tests pass (20 existing + 6 new = 26 total).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/sign-waiver/
git commit -m "feat(waivers): add athlete signing page with checkbox and typed name"
```

---

## Task 7: Owner waivers page

**Files:**
- Create: `src/app/dashboard/waivers/page.tsx`

- [ ] **Step 1: Create the owner waivers page**

Create `src/app/dashboard/waivers/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'

export default async function WaiversPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes)
    ? (boxes[0]?.name ?? '')
    : (boxes as { name: string } | null)?.name ?? ''

  const [
    { data: athletes },
    { data: signatures },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('box_id', profile.box_id)
      .eq('role', 'athlete')
      .order('created_at'),
    supabase
      .from('waiver_signatures')
      .select('athlete_id, signed_at')
      .eq('box_id', profile.box_id),
  ])

  const signedIds = new Set((signatures ?? []).map((s) => s.athlete_id))
  const signedMap = Object.fromEntries((signatures ?? []).map((s) => [s.athlete_id, s.signed_at]))
  const signedCount = (athletes ?? []).filter((a) => signedIds.has(a.id)).length
  const unsignedCount = (athletes ?? []).length - signedCount

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="waivers" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60,
          borderBottom: '1px solid var(--c-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          background: 'var(--c-surface)',
          flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Liability Waiver
          </h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>

          {/* Legal notice */}
          <div style={{
            background: 'rgba(250,204,21,0.06)',
            border: '1px solid rgba(250,204,21,0.2)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 20,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
            <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', margin: 0, lineHeight: 1.6 }}>
              For full enforceability in UAE courts, have this waiver translated to Arabic by a certified legal translator.
              English is valid under UAE Federal Law No. 1 of 2006 but Arabic takes precedence in court proceedings.
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, maxWidth: 500 }}>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '16px 20px' }}>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--circle-lime)', marginBottom: 4 }}>{signedCount}</div>
              <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Members signed</div>
            </div>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '16px 20px' }}>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: unsignedCount > 0 ? 'var(--c-danger)' : 'var(--c-ink-muted)', marginBottom: 4 }}>{unsignedCount}</div>
              <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Unsigned — blocked</div>
            </div>
          </div>

          {/* Member list */}
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>All athletes</span>
              <span style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>{(athletes ?? []).length} total</span>
            </div>
            {(athletes ?? []).map((athlete, i) => {
              const signed = signedIds.has(athlete.id)
              const signedAt = signedMap[athlete.id]
              return (
                <div key={athlete.id} style={{
                  padding: '12px 20px',
                  borderBottom: i < (athletes ?? []).length - 1 ? '1px solid var(--c-divider)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'var(--c-surface-alt)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: 'var(--c-ink-muted)', fontWeight: 700, flexShrink: 0,
                    }}>
                      {athlete.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, color: 'var(--c-ink)', fontWeight: 500 }}>{athlete.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>
                        {signed
                          ? `Signed ${new Date(signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : 'Has not logged in yet'}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                    background: signed ? 'var(--c-ok-soft)' : 'var(--c-danger-soft)',
                    color: signed ? 'var(--c-ok-ink)' : 'var(--c-danger-ink)',
                  }}>
                    {signed ? 'SIGNED' : 'UNSIGNED'}
                  </span>
                </div>
              )
            })}
            {(athletes ?? []).length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                No athletes yet.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/waivers/page.tsx
git commit -m "feat(waivers): add owner waivers page with signed/unsigned member list"
```

---

## Task 8: Sidebar navigation

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add shield icon and Waivers nav item**

In `src/components/sidebar.tsx`, make two changes:

**Change 1** — add shield to `ICON_PATHS` (after the `settings` entry):

```typescript
shield: <><path d="M12 3L4 7v5c0 5.5 4.5 9.7 8 11 3.5-1.3 8-5.5 8-11V7l-8-4z" /></>,
```

**Change 2** — add Waivers item in `getNavGroups`, inside the `runTheGym` block after `members` and before `payments`:

```typescript
if (isOwner) runTheGym.push({ key: 'waivers', label: 'Waivers', href: '/dashboard/waivers', icon: 'shield' })
```

The full `runTheGym` block after the change:

```typescript
const runTheGym: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'home' },
]
if (isOwner) runTheGym.push({ key: 'members', label: 'Member directory', href: '/dashboard/members', icon: 'users' })
if (isOwner) runTheGym.push({ key: 'waivers', label: 'Waivers', href: '/dashboard/waivers', icon: 'shield' })
if (isOwner) runTheGym.push({ key: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'card' })
if (isOwner) runTheGym.push({ key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: 'settings' })
groups.push({ section: 'Run the gym', items: runTheGym })
```

- [ ] **Step 2: Run type-check and tests**

```bash
npm run type-check && npm run test
```

Expected: 0 type errors, 26 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(waivers): add Waivers to owner sidebar navigation"
```

---

## Verification

End-to-end checks after all tasks are complete:

- [ ] Log in as an **athlete** → redirected to `/dashboard/sign-waiver` before seeing any dashboard UI
- [ ] On the signing page: submit without checking the box → error "You must check the box to agree."
- [ ] Submit with checkbox checked but wrong name → error "Name does not match your registered name."
- [ ] Submit with correct name → redirected to `/dashboard`, gate no longer triggers on subsequent visits
- [ ] Log in as **owner** → no waiver gate, straight to dashboard
- [ ] Log in as **coach** → no waiver gate, straight to dashboard
- [ ] As owner, visit `/dashboard/waivers` → see the signed/unsigned counts and member list with SIGNED/UNSIGNED badges
- [ ] Waivers nav item appears in sidebar for owner, not for coach or athlete
- [ ] `npm run test` — 26 tests pass
- [ ] `npm run type-check` — 0 errors
