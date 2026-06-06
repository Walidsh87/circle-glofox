# Packages PR-1 — Data Model + Catalog Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the packages data model (catalog + purchased credit batches) and an owner-facing catalog admin screen, with **no purchase flow and no booking enforcement yet** (those are PR-2 and PR-3).

**Architecture:** Two new RLS-protected tables (`packages`, `package_credits`) plus a nullable `bookings.credit_id` column, following the existing per-table `auth_box_id()` / `auth_role()` RLS pattern. The admin UI mirrors the existing class-templates CRUD (server component list page + `useFormState` client forms + thin server actions). Pure input validation lives in a `_lib/validation.ts` with unit tests (the only test-covered layer, matching the repo).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), Vitest. Money is `NUMERIC(10,2)` AED (matches `invoices`).

**Spec:** `docs/superpowers/specs/2026-06-06-packages-design.md`

**Scope note:** This is PR-1 of 3. It must leave the app fully working with packages creatable/editable by owners but not yet purchasable or enforced.

---

### Task 1: Migration 020 — `packages` + `package_credits` tables + RLS

**Files:**
- Create: `migrations/020_packages.sql`

- [ ] **Step 1: Write the migration SQL**

Create `migrations/020_packages.sql`:

```sql
-- migrations/020_packages.sql
-- Packages (one-shot, credit-based): catalog + purchased credit batches.
-- Run in Supabase SQL Editor. Idempotent. Requires 012 (invoices) to have run.

-- 1) Catalog: what a gym offers for sale.
CREATE TABLE IF NOT EXISTS packages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('class_pack','drop_in','pt_block')),
  credit_count  INTEGER NOT NULL CHECK (credit_count > 0),
  price_aed     NUMERIC(10,2) NOT NULL CHECK (price_aed >= 0),
  expiry_days   INTEGER CHECK (expiry_days IS NULL OR expiry_days > 0),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage their gym's catalog.
DROP POLICY IF EXISTS packages_staff_all ON packages;
CREATE POLICY packages_staff_all ON packages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- Athletes browse active packages in their gym (storefront, read-only).
DROP POLICY IF EXISTS packages_athlete_select ON packages;
CREATE POLICY packages_athlete_select ON packages
  FOR SELECT
  USING (box_id = auth_box_id() AND active = true);

-- 2) Purchased credit batches owned by a member.
CREATE TABLE IF NOT EXISTS package_credits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id               UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id           UUID NOT NULL REFERENCES packages(id),
  kind                 TEXT NOT NULL CHECK (kind IN ('class','pt_session')),
  credits_total        INTEGER NOT NULL CHECK (credits_total > 0),
  credits_remaining    INTEGER NOT NULL CHECK (credits_remaining >= 0),
  expires_at           DATE,
  invoice_id           UUID REFERENCES invoices(id),
  provider_charge_ref  TEXT UNIQUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE package_credits ENABLE ROW LEVEL SECURITY;

-- Athlete reads own credit batches.
DROP POLICY IF EXISTS package_credits_athlete_select ON package_credits;
CREATE POLICY package_credits_athlete_select ON package_credits
  FOR SELECT
  USING (athlete_id = auth.uid() AND box_id = auth_box_id());

-- Staff read all batches in their gym.
DROP POLICY IF EXISTS package_credits_staff_select ON package_credits;
CREATE POLICY package_credits_staff_select ON package_credits
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- NOTE: no INSERT/UPDATE/DELETE policy. Grant/consume/refund run via the SERVICE
-- ROLE in server actions (RLS bypassed there), matching the booking-count pattern.
-- This keeps credit mutation off the client entirely.

CREATE INDEX IF NOT EXISTS idx_package_credits_athlete
  ON package_credits (athlete_id, kind, credits_remaining);
```

- [ ] **Step 2: Apply the migration**

Run the file's contents in the Supabase SQL Editor (production project). This is a manual step — Supabase has no CLI migration runner wired up in this repo (see `migrations/README.md`).

- [ ] **Step 3: Verify the tables + policies exist**

Run in the SQL Editor:

```sql
SELECT tablename FROM pg_tables WHERE tablename IN ('packages','package_credits');
SELECT polname, tablename FROM pg_policies WHERE tablename IN ('packages','package_credits') ORDER BY tablename, polname;
```
Expected: both tables listed; 4 policies (`packages_staff_all`, `packages_athlete_select`, `package_credits_athlete_select`, `package_credits_staff_select`).

- [ ] **Step 4: Commit**

```bash
git add migrations/020_packages.sql
git commit -m "feat(packages): migration 020 — packages + package_credits tables + RLS"
```

---

### Task 2: Migration 021 — `bookings.credit_id`

**Files:**
- Create: `migrations/021_bookings_credit_id.sql`

- [ ] **Step 1: Write the migration SQL**

Create `migrations/021_bookings_credit_id.sql`:

```sql
-- migrations/021_bookings_credit_id.sql
-- Link a class booking to the credit batch it consumed (NULL = covered by a
-- membership). Additive + nullable. Consumed by the entitlement PR (PR-3); safe
-- to land now. Run in Supabase SQL Editor. Requires 020.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS credit_id UUID REFERENCES package_credits(id);
```

- [ ] **Step 2: Apply the migration** in the Supabase SQL Editor.

- [ ] **Step 3: Verify the column exists**

```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name = 'credit_id';
```
Expected: one row, `is_nullable = YES`.

- [ ] **Step 4: Commit**

```bash
git add migrations/021_bookings_credit_id.sql
git commit -m "feat(packages): migration 021 — bookings.credit_id (nullable)"
```

---

### Task 3: Package input validation (TDD)

**Files:**
- Create: `src/app/dashboard/packages/_lib/validation.ts`
- Test: `src/__tests__/packages-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/packages-validation.test.ts`:

```ts
import { validatePackageInput } from '@/app/dashboard/packages/_lib/validation'

describe('validatePackageInput', () => {
  test('accepts a valid class pack', () => {
    expect(validatePackageInput('10-Class Pack', 'class_pack', 10, 500, 60)).toBeNull()
  })
  test('accepts null expiry (never expires)', () => {
    expect(validatePackageInput('PT Block', 'pt_block', 5, 1000, null)).toBeNull()
  })
  test('rejects empty name', () => {
    expect(validatePackageInput('  ', 'class_pack', 10, 500, 60)).toMatch(/name/i)
  })
  test('rejects unknown type', () => {
    expect(validatePackageInput('X', 'membership', 10, 500, 60)).toMatch(/type/i)
  })
  test('rejects credit count below 1', () => {
    expect(validatePackageInput('X', 'class_pack', 0, 500, 60)).toMatch(/credit/i)
  })
  test('rejects non-integer credit count', () => {
    expect(validatePackageInput('X', 'class_pack', 2.5, 500, 60)).toMatch(/credit/i)
  })
  test('forces drop-in to exactly 1 credit', () => {
    expect(validatePackageInput('Drop-in', 'drop_in', 5, 75, null)).toMatch(/drop-in/i)
  })
  test('rejects negative price', () => {
    expect(validatePackageInput('X', 'class_pack', 10, -5, 60)).toMatch(/price/i)
  })
  test('rejects zero or negative expiry days', () => {
    expect(validatePackageInput('X', 'class_pack', 10, 500, 0)).toMatch(/expiry/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/packages-validation.test.ts`
Expected: FAIL — cannot resolve `@/app/dashboard/packages/_lib/validation`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/dashboard/packages/_lib/validation.ts`:

```ts
const TYPES = ['class_pack', 'drop_in', 'pt_block'] as const

export function validatePackageInput(
  name: string,
  type: string,
  creditCount: number,
  priceAed: number,
  expiryDays: number | null
): string | null {
  if (!name?.trim()) return 'Package name is required.'
  if (!TYPES.includes(type as (typeof TYPES)[number])) return 'Invalid package type.'
  if (!Number.isInteger(creditCount) || creditCount < 1) {
    return 'Credit count must be a whole number of at least 1.'
  }
  if (type === 'drop_in' && creditCount !== 1) {
    return 'A drop-in pass must have exactly 1 credit.'
  }
  if (!Number.isFinite(priceAed) || priceAed < 0) {
    return 'Price must be zero or a positive amount.'
  }
  if (expiryDays !== null && (!Number.isInteger(expiryDays) || expiryDays < 1)) {
    return 'Expiry days must be a whole number of at least 1, or empty for no expiry.'
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/packages-validation.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/packages/_lib/validation.ts src/__tests__/packages-validation.test.ts
git commit -m "feat(packages): package input validation + tests"
```

---

### Task 4: Server actions — create / edit / toggle / delete

**Files:**
- Create: `src/app/dashboard/packages/_actions/create-package.ts`
- Create: `src/app/dashboard/packages/_actions/edit-package.ts`
- Create: `src/app/dashboard/packages/_actions/toggle-package.ts`
- Create: `src/app/dashboard/packages/_actions/delete-package.ts`

All four mirror the class-template actions: RLS client, `getUser`, owner/coach role gate, mutate scoped by `box_id`, `revalidatePath`.

- [ ] **Step 1: Create `create-package.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validatePackageInput } from '../_lib/validation'

type State = { error: string | null }

export async function createPackage(prevState: State, formData: FormData): Promise<State> {
  const name = (formData.get('name') as string)?.trim()
  const type = formData.get('type') as string
  const creditCount = type === 'drop_in' ? 1 : parseInt(formData.get('creditCount') as string)
  const priceAed = parseFloat(formData.get('priceAed') as string)
  const expiryRaw = (formData.get('expiryDays') as string)?.trim()
  const expiryDays = expiryRaw ? parseInt(expiryRaw) : null

  const validationError = validatePackageInput(name, type, creditCount, priceAed, expiryDays)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage packages.' }
  }

  const { error } = await supabase.from('packages').insert({
    box_id: profile.box_id,
    name,
    type,
    credit_count: creditCount,
    price_aed: priceAed,
    expiry_days: expiryDays,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/packages')
  return { error: null }
}
```

- [ ] **Step 2: Create `edit-package.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validatePackageInput } from '../_lib/validation'

type State = { error: string | null }

export async function editPackage(prevState: State, formData: FormData): Promise<State> {
  const packageId = formData.get('packageId') as string
  const name = (formData.get('name') as string)?.trim()
  const type = formData.get('type') as string
  const creditCount = type === 'drop_in' ? 1 : parseInt(formData.get('creditCount') as string)
  const priceAed = parseFloat(formData.get('priceAed') as string)
  const expiryRaw = (formData.get('expiryDays') as string)?.trim()
  const expiryDays = expiryRaw ? parseInt(expiryRaw) : null

  if (!packageId) return { error: 'Missing package id.' }
  const validationError = validatePackageInput(name, type, creditCount, priceAed, expiryDays)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage packages.' }
  }

  const { error } = await supabase
    .from('packages')
    .update({ name, type, credit_count: creditCount, price_aed: priceAed, expiry_days: expiryDays })
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/packages')
  return { error: null }
}
```

- [ ] **Step 3: Create `toggle-package.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function togglePackage(packageId: string, active: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage packages.' }
  }

  const { error } = await supabase
    .from('packages')
    .update({ active })
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/packages')
  return { error: null }
}
```

- [ ] **Step 4: Create `delete-package.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deletePackage(packageId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage packages.' }
  }

  const { error } = await supabase
    .from('packages')
    .delete()
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
  if (error) {
    // FK from package_credits.package_id will block deletes once credits exist.
    if (error.code === '23503') return { error: 'Cannot delete: this package has sold credits. Deactivate it instead.' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/packages')
  return { error: null }
}
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/packages/_actions/
git commit -m "feat(packages): create/edit/toggle/delete server actions"
```

---

### Task 5: Catalog admin UI (page + forms + sidebar nav)

**Files:**
- Create: `src/app/dashboard/packages/page.tsx`
- Create: `src/app/dashboard/packages/_components/add-package-form.tsx`
- Create: `src/app/dashboard/packages/_components/package-actions.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Create the add-package form**

Create `src/app/dashboard/packages/_components/add-package-form.tsx`:

```tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useState } from 'react'
import { createPackage } from '../_actions/create-package'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--c-border)', background: 'var(--c-surface)',
  color: 'var(--c-ink)', fontSize: 13,
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{
      padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: 'var(--circle-lime)', color: 'var(--circle-ink)',
      fontSize: 13, fontWeight: 600, opacity: pending ? 0.6 : 1,
    }}>{pending ? 'Saving…' : 'Add package'}</button>
  )
}

export function AddPackageForm() {
  const [state, formAction] = useFormState(createPackage, { error: null })
  const [type, setType] = useState('class_pack')

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input name="name" placeholder="Package name (e.g. 10-Class Pack)" style={inputStyle} />
      <select name="type" value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
        <option value="class_pack">Class pack</option>
        <option value="drop_in">Drop-in pass</option>
        <option value="pt_block">PT block</option>
      </select>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          name="creditCount"
          type="number"
          min={1}
          placeholder={type === 'drop_in' ? '1 (fixed)' : 'Credits'}
          disabled={type === 'drop_in'}
          defaultValue={type === 'drop_in' ? 1 : undefined}
          style={inputStyle}
        />
        <input name="priceAed" type="number" min={0} step="0.01" placeholder="Price (AED)" style={inputStyle} />
        <input name="expiryDays" type="number" min={1} placeholder="Expiry days (optional)" style={inputStyle} />
      </div>
      {state.error && <p style={{ color: 'var(--c-danger-ink)', fontSize: 12 }}>{state.error}</p>}
      <SubmitButton />
    </form>
  )
}
```

- [ ] **Step 2: Create the per-row actions (toggle + delete)**

Create `src/app/dashboard/packages/_components/package-actions.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { togglePackage } from '../_actions/toggle-package'
import { deletePackage } from '../_actions/delete-package'

const btn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--c-border)', borderRadius: 6,
  padding: '4px 9px', fontSize: 12, cursor: 'pointer', color: 'var(--c-ink-2)',
}

export function PackageActions({ packageId, active }: { packageId: string; active: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button
        style={btn}
        disabled={pending}
        onClick={() => startTransition(() => { void togglePackage(packageId, !active) })}
      >
        {active ? 'Deactivate' : 'Activate'}
      </button>
      <button
        style={{ ...btn, color: 'var(--c-danger-ink)' }}
        disabled={pending}
        onClick={() => {
          if (!confirm('Delete this package? This cannot be undone.')) return
          startTransition(async () => {
            const res = await deletePackage(packageId)
            if (res.error) alert(res.error)
          })
        }}
      >
        Delete
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create the catalog page**

Create `src/app/dashboard/packages/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AddPackageForm } from './_components/add-package-form'
import { PackageActions } from './_components/package-actions'

const TYPE_LABEL: Record<string, string> = {
  class_pack: 'Class pack',
  drop_in: 'Drop-in',
  pt_block: 'PT block',
}

export default async function PackagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, type, credit_count, price_aed, expiry_days, active')
    .eq('box_id', profile.box_id)
    .order('active', { ascending: false })
    .order('name')

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="packages" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex',
          alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            Packages
          </h1>
          <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>
            {packages?.length ?? 0} packages
          </span>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)', marginBottom: 20, maxWidth: 620 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Add a package</p>
            <AddPackageForm />
          </div>

          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)' }}>
                  <Th>Package</Th><Th>Type</Th><Th>Credits</Th><Th>Price</Th><Th>Expiry</Th><Th>Status</Th>
                  <th style={{ padding: '10px 16px' }} />
                </tr>
              </thead>
              <tbody>
                {packages?.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--c-divider)', opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--c-ink)' }}>{p.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }}>{TYPE_LABEL[p.type] ?? p.type}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{p.credit_count}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{Number(p.price_aed).toFixed(2)} AED</td>
                    <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{p.expiry_days ? `${p.expiry_days}d` : '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999,
                        fontSize: 11.5, fontWeight: 500,
                        background: p.active ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
                        color: p.active ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)',
                      }}>{p.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <PackageActions packageId={p.id} active={p.active} />
                    </td>
                  </tr>
                ))}
                {(!packages || packages.length === 0) && (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                      No packages yet. Add one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--font-geist-mono)',
      fontSize: 10.5, fontWeight: 500, color: 'var(--c-ink-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</th>
  )
}
```

**Note:** Edit-in-place (the "E" of CRUD) is intentionally deferred to a follow-up step within this PR — the `editPackage` action exists; wiring an edit modal mirrors `classes/_components/edit-template-form.tsx`. For PR-1, create + toggle + delete give a working catalog; add the edit modal as the final task step below if time allows, otherwise it carries into PR-2.

- [ ] **Step 4: Add the sidebar nav entry**

In `src/components/sidebar.tsx`, add a `tag` icon to `ICON_PATHS` (alongside the others):

```tsx
  tag: <><path d="M3 11V4a1 1 0 0 1 1-1h7l9 9-8 8-9-9z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
```

And add the nav item to the `runTheGym` group (after the `payments` push, before `settings`):

```tsx
  if (isOwner) runTheGym.push({ key: 'packages', label: 'Packages', href: '/dashboard/packages', icon: 'tag' })
```

- [ ] **Step 5: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/packages/page.tsx src/app/dashboard/packages/_components/ src/components/sidebar.tsx
git commit -m "feat(packages): owner catalog admin page + sidebar nav"
```

---

### Task 6: Manual smoke test + migration README

**Files:**
- Modify: `migrations/README.md`

- [ ] **Step 1: Smoke-test the catalog locally**

Run: `npm run dev`. As an **owner**, visit `/dashboard/packages` and:
- Add a "10-Class Pack" (class_pack, 10 credits, 500 AED, 60 days) → appears in the table.
- Add a "Drop-in" (drop_in) → credit field locks to 1.
- Deactivate it → row dims, status flips to Inactive.
- Delete the class pack → row disappears.
- Confirm the "Packages" item shows in the sidebar for owner and is **absent** for an athlete account, and that visiting `/dashboard/packages` as an athlete redirects to `/dashboard`.

- [ ] **Step 2: Add migrations 020 + 021 to the run-order doc**

In `migrations/README.md`, add 020 and 021 to the numbered run-order list with a one-line description each (match the existing format).

- [ ] **Step 3: Commit**

```bash
git add migrations/README.md
git commit -m "docs(migrations): add 020 packages + 021 bookings.credit_id to run order"
```

---

## Self-review

**Spec coverage (PR-1 slice):**
- `packages` table + RLS → Task 1 ✅
- `package_credits` table + RLS → Task 1 ✅
- `bookings.credit_id` → Task 2 ✅
- `price_aed NUMERIC(10,2)` (resolved money unit) → Task 1 ✅
- Owner catalog CRUD (create/toggle/delete; edit action present, edit-modal flagged as in-PR follow-up) → Tasks 4–5 ✅
- Athlete read-only RLS on active packages → Task 1 policy ✅
- Pure validation + tests → Task 3 ✅
- Purchase flow, credit grant, entitlement enforcement → **out of PR-1 scope** (PR-2/PR-3) — correctly excluded.

**Placeholder scan:** none — every step has concrete SQL/TS/commands. The one deferred item (edit modal) is explicitly called out, not a silent gap.

**Type consistency:** action signatures `(prevState: State, formData) => Promise<State>` with `State = { error: string | null }` match `useFormState`; `togglePackage(id, active)` / `deletePackage(id)` match their `PackageActions` call sites; column names (`price_aed`, `credit_count`, `expiry_days`, `credit_id`, `provider_charge_ref`) are identical across migration, actions, and page. `validatePackageInput` signature matches its test and both action call sites.
