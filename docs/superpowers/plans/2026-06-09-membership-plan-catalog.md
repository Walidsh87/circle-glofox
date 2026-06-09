# Membership Plan Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Owners define a catalog of recurring membership plans (name + monthly price + optional Stripe Price ID); the add-membership form prefills from a plan, and the membership keeps a `plan_id` reference + a price snapshot.

**Architecture:** A `membership_plans` table (mirrors the Packages catalog CRUD + delete-guard) + nullable `memberships.plan_id`. Owner CRUD on the payments page; `AddMembershipForm` gets a plan `<select>` that prefills the existing fields.

**Tech Stack:** Next.js 16 server actions (RLS client), Supabase owner RLS, TypeScript strict, Vitest, Zod-free pure validation. Reference spec: `docs/superpowers/specs/2026-06-09-membership-plan-catalog-design.md`.

**Conventions reused (read once):**
- Packages catalog is the template: `packages/_actions/{create,edit,toggle,delete}-package.ts` (RLS client, owner gate, box-scoped, `23503` delete-guard) + `_components/{add-package-form,package-actions}.tsx`.
- `saveMembership` (`payments/_actions/save-membership.ts`) + `AddMembershipForm` (`payments/_components/add-membership-form.tsx`). `validateMembershipInput` lives in `payments/_lib/validation.ts`.
- Tests flat in `src/__tests__/`; dual/single-client mock `helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `migrations/035_membership_plans.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `payments/_lib/plan-validation.ts` + `src/__tests__/plan-validation.test.ts` | create |
| `payments/_actions/create-membership-plan.ts`, `edit-membership-plan.ts`, `toggle-membership-plan.ts`, `delete-membership-plan.ts` | create |
| `payments/_actions/save-membership.ts` | modify (store `plan_id`) |
| `src/__tests__/membership-plans.integration.test.ts`, `src/__tests__/save-membership.integration.test.ts` | create |
| `payments/_components/add-membership-plan-form.tsx`, `membership-plan-row.tsx` | create |
| `payments/_components/add-membership-form.tsx` | modify (plan select + prefill) |
| `payments/page.tsx` | modify (load plans + section + pass to form) |

---

## Task 1: Migration 035

**Files:** Create `migrations/035_membership_plans.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Migration**

Create `migrations/035_membership_plans.sql`:

```sql
-- migrations/035_membership_plans.sql
-- Membership plan catalog (#27): reusable recurring plans (owner-defined). A membership
-- references the plan it came from but keeps its own plan_name/price as the billing snapshot.
-- Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS membership_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id             uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name               text NOT NULL,
  monthly_price_aed  numeric(10,2) CHECK (monthly_price_aed IS NULL OR monthly_price_aed >= 0),
  provider_plan_ref  text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;

-- Owners manage + read their gym's plans (payments + membership creation are owner-only).
DROP POLICY IF EXISTS membership_plans_owner_all ON membership_plans;
CREATE POLICY membership_plans_owner_all ON membership_plans
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE INDEX IF NOT EXISTS idx_membership_plans_box ON membership_plans (box_id, active);

-- A membership references the plan it came from. Default RESTRICT on delete: a plan with
-- memberships can't be deleted → deactivate. Existing memberships keep plan_id NULL.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES membership_plans(id);
```

- [ ] **Step 2: ROLLBACKS entry**

Change header range `008`–`034` → `008`–`035`. Add above `### 034_member_fields`:

```markdown
### 035_membership_plans
```sql
ALTER TABLE memberships DROP COLUMN IF EXISTS plan_id;
DROP TABLE IF EXISTS membership_plans;
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/035_membership_plans.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(plans): migration 035 — membership_plans catalog + memberships.plan_id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure validation

**Files:** Create `payments/_lib/plan-validation.ts`; Test `src/__tests__/plan-validation.test.ts`.

- [ ] **Step 1: Failing tests**

Create `src/__tests__/plan-validation.test.ts`:

```ts
import { validatePlan } from '@/app/dashboard/payments/_lib/plan-validation'

test('valid plan → null', () => expect(validatePlan('Unlimited', 300, 'price_123')).toBeNull())
test('null price is allowed', () => expect(validatePlan('Drop-in adjacent', null, null)).toBeNull())
test('empty name → error', () => expect(validatePlan('  ', 300, null)).toMatch(/name/i))
test('over-long name → error', () => expect(validatePlan('x'.repeat(81), 300, null)).toMatch(/name/i))
test('negative price → error', () => expect(validatePlan('P', -5, null)).toMatch(/price/i))
test('NaN price → error', () => expect(validatePlan('P', Number.NaN, null)).toMatch(/price/i))
test('over-long Stripe ref → error', () => expect(validatePlan('P', 300, 'x'.repeat(121))).toMatch(/stripe/i))
```

- [ ] **Step 2: Run → fail** (`npm test -- plan-validation`).

- [ ] **Step 3: Implement**

Create `payments/_lib/plan-validation.ts`:

```ts
export function validatePlan(
  name: string,
  monthlyPriceAed: number | null,
  providerPlanRef: string | null,
): string | null {
  if (!name?.trim()) return 'Plan name is required.'
  if (name.trim().length > 80) return 'Plan name is too long (max 80 characters).'
  if (monthlyPriceAed !== null && (!Number.isFinite(monthlyPriceAed) || monthlyPriceAed < 0)) {
    return 'Price must be zero or a positive amount.'
  }
  if (providerPlanRef !== null && providerPlanRef.length > 120) {
    return 'Stripe Price ID is too long.'
  }
  return null
}
```

- [ ] **Step 4: Run → pass** (`npm test -- plan-validation`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/payments/_lib/plan-validation.ts src/__tests__/plan-validation.test.ts
git commit -m "$(cat <<'EOF'
feat(plans): validatePlan (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Actions + save-membership plan_id + tests

**Files:** Create the four action files; Modify `save-membership.ts`; Create `membership-plans.integration.test.ts`, `save-membership.integration.test.ts`.

- [ ] **Step 1: `createMembershipPlan`**

Create `payments/_actions/create-membership-plan.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validatePlan } from '../_lib/plan-validation'

type State = { error: string | null }

export async function createMembershipPlan(prevState: State, formData: FormData): Promise<State> {
  const name = (formData.get('name') as string)?.trim()
  const priceRaw = (formData.get('monthlyPrice') as string)?.trim()
  const monthlyPrice = priceRaw ? parseFloat(priceRaw) : null
  const providerPlanRef = (formData.get('providerPlanRef') as string)?.trim() || null

  const err = validatePlan(name, monthlyPrice, providerPlanRef)
  if (err) return { error: err }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage plans.' }

  const { error } = await supabase.from('membership_plans').insert({
    box_id: profile.box_id,
    name,
    monthly_price_aed: monthlyPrice,
    provider_plan_ref: providerPlanRef,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
```

- [ ] **Step 2: `editMembershipPlan`**

Create `payments/_actions/edit-membership-plan.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validatePlan } from '../_lib/plan-validation'

export async function editMembershipPlan(
  planId: string,
  name: string,
  monthlyPriceAed: number | null,
  providerPlanRef: string | null,
): Promise<{ error: string | null }> {
  const err = validatePlan(name, monthlyPriceAed, providerPlanRef)
  if (err) return { error: err }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage plans.' }

  const { error } = await supabase
    .from('membership_plans')
    .update({ name: name.trim(), monthly_price_aed: monthlyPriceAed, provider_plan_ref: providerPlanRef })
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
```

- [ ] **Step 3: `toggleMembershipPlan`**

Create `payments/_actions/toggle-membership-plan.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleMembershipPlan(planId: string, active: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage plans.' }

  const { error } = await supabase
    .from('membership_plans')
    .update({ active })
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
```

- [ ] **Step 4: `deleteMembershipPlan`**

Create `payments/_actions/delete-membership-plan.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteMembershipPlan(planId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage plans.' }

  const { error } = await supabase
    .from('membership_plans')
    .delete()
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) {
    // memberships.plan_id FK (RESTRICT) blocks deletion once the plan is in use.
    if (error.code === '23503') return { error: 'Cannot delete: this plan is in use. Deactivate it instead.' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
```

- [ ] **Step 5: `saveMembership` stores `plan_id`**

In `save-membership.ts`, read `planId` alongside the other fields:
```ts
  const planId = (formData.get('planId') as string)?.trim() || null
```
and add it to the `.insert({ ... })` object (after the existing `provider_plan_ref` spread):
```ts
    ...(planId ? { plan_id: planId } : {}),
```

- [ ] **Step 6: Integration tests**

Create `src/__tests__/membership-plans.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createMembershipPlan } from '@/app/dashboard/payments/_actions/create-membership-plan'
import { editMembershipPlan } from '@/app/dashboard/payments/_actions/edit-membership-plan'
import { toggleMembershipPlan } from '@/app/dashboard/payments/_actions/toggle-membership-plan'
import { deleteMembershipPlan } from '@/app/dashboard/payments/_actions/delete-membership-plan'

beforeEach(() => vi.clearAllMocks())

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
function owner(planResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  return makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, membership_plans: planResult },
  })
}
function coach() {
  return makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } })
}

test('createMembershipPlan inserts box-scoped', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await createMembershipPlan({ error: null }, form({ name: 'Unlimited', monthlyPrice: '300', providerPlanRef: 'price_1' }))
  expect(res.error).toBeNull()
  expect(rls.builder('membership_plans').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', name: 'Unlimited', monthly_price_aed: 300, provider_plan_ref: 'price_1' }),
  )
})

test('createMembershipPlan rejects an empty name before any DB call', async () => {
  serverCreate.mockResolvedValue(owner())
  const res = await createMembershipPlan({ error: null }, form({ name: '  ', monthlyPrice: '300' }))
  expect(res.error).toMatch(/name/i)
})

test('editMembershipPlan updates scoped by id + box', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await editMembershipPlan('p1', 'Student', 200, null)
  expect(res.error).toBeNull()
  expect(rls.builder('membership_plans').update).toHaveBeenCalledWith({ name: 'Student', monthly_price_aed: 200, provider_plan_ref: null })
  expect(rls.builder('membership_plans').eq).toHaveBeenCalledWith('id', 'p1')
  expect(rls.builder('membership_plans').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('toggleMembershipPlan flips active', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await toggleMembershipPlan('p1', false)
  expect(res.error).toBeNull()
  expect(rls.builder('membership_plans').update).toHaveBeenCalledWith({ active: false })
})

test('deleteMembershipPlan maps 23503 to the deactivate message', async () => {
  serverCreate.mockResolvedValue(owner({ data: null, error: { code: '23503', message: 'fk' } }))
  const res = await deleteMembershipPlan('p1')
  expect(res.error).toMatch(/in use.*deactivate/i)
})

test('a non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(coach())
  expect((await createMembershipPlan({ error: null }, form({ name: 'X', monthlyPrice: '1' }))).error).toMatch(/owners/i)
  expect((await toggleMembershipPlan('p1', true)).error).toMatch(/owners/i)
})
```

Create `src/__tests__/save-membership.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveMembership } from '@/app/dashboard/payments/_actions/save-membership'

beforeEach(() => vi.clearAllMocks())
function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

test('stores plan_id when a plan is picked', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, memberships: { data: null, error: null } },
  })
  serverCreate.mockResolvedValue(rls)

  const res = await saveMembership({ error: null }, form({
    athleteId: 'a1', planName: 'Unlimited', monthlyPrice: '300', startDate: '2026-06-01', planId: 'plan-1',
  }))

  expect(res.error).toBeNull()
  expect(rls.builder('memberships').insert).toHaveBeenCalledWith(
    expect.objectContaining({ plan_id: 'plan-1', plan_name: 'Unlimited', monthly_price_aed: 300 }),
  )
})
```

- [ ] **Step 7: Verify** — `npm test -- membership-plans save-membership` → PASS. Type-check + lint.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/payments/_actions/create-membership-plan.ts src/app/dashboard/payments/_actions/edit-membership-plan.ts src/app/dashboard/payments/_actions/toggle-membership-plan.ts src/app/dashboard/payments/_actions/delete-membership-plan.ts src/app/dashboard/payments/_actions/save-membership.ts src/__tests__/membership-plans.integration.test.ts src/__tests__/save-membership.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(plans): owner CRUD actions + saveMembership stores plan_id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: UI — catalog section + form prefill

**Files:** Create `add-membership-plan-form.tsx`, `membership-plan-row.tsx`; Modify `add-membership-form.tsx`, `payments/page.tsx`. No new tests (UI; type-check + lint + build).

- [ ] **Step 1: Create-plan form**

Create `payments/_components/add-membership-plan-form.tsx`:

```tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useRef } from 'react'
import { createMembershipPlan } from '../_actions/create-membership-plan'

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--c-border)',
  background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13,
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{
      padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 600, opacity: pending ? 0.6 : 1,
    }}>{pending ? 'Saving…' : 'Add plan'}</button>
  )
}

export function AddMembershipPlanForm() {
  const [state, formAction] = useFormState(createMembershipPlan, { error: null })
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => { if (!state.error && formRef.current) formRef.current.reset() }, [state])

  return (
    <form ref={formRef} action={formAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input name="name" placeholder="Plan name (e.g. Unlimited)" style={{ ...inputStyle, width: 200 }} />
      <input name="monthlyPrice" type="number" min={0} step="0.01" placeholder="Monthly price (AED)" style={{ ...inputStyle, width: 160 }} />
      <input name="providerPlanRef" placeholder="Stripe Price ID (optional)" style={{ ...inputStyle, width: 200, fontFamily: 'var(--font-geist-mono, monospace)' }} />
      <SubmitButton />
      {state.error && <span style={{ color: 'var(--c-danger-ink)', fontSize: 12 }}>{state.error}</span>}
    </form>
  )
}
```

- [ ] **Step 2: Plan row (display ↔ inline edit + toggle/delete)**

Create `payments/_components/membership-plan-row.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { editMembershipPlan } from '../_actions/edit-membership-plan'
import { toggleMembershipPlan } from '../_actions/toggle-membership-plan'
import { deleteMembershipPlan } from '../_actions/delete-membership-plan'

type Plan = { id: string; name: string; monthly_price_aed: number | null; provider_plan_ref: string | null; active: boolean }

const cell: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: 'var(--c-ink-2)' }
const btn: React.CSSProperties = { background: 'none', border: '1px solid var(--c-border)', borderRadius: 6, padding: '4px 9px', fontSize: 12, cursor: 'pointer', color: 'var(--c-ink-2)' }
const input: React.CSSProperties = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13 }

export function MembershipPlanRow({ plan }: { plan: Plan }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(plan.name)
  const [price, setPrice] = useState(plan.monthly_price_aed?.toString() ?? '')
  const [ref, setRef] = useState(plan.provider_plan_ref ?? '')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error); else setEditing(false) })

  if (editing) {
    return (
      <tr style={{ borderBottom: '1px solid var(--c-divider)' }}>
        <td style={cell}><input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 150 }} /></td>
        <td style={cell}><input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} step="0.01" style={{ ...input, width: 100 }} /></td>
        <td style={cell}><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Stripe ID" style={{ ...input, width: 150 }} /></td>
        <td style={cell} />
        <td style={{ ...cell, textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button style={btn} disabled={pending} onClick={() => run(() => editMembershipPlan(plan.id, name, price.trim() ? parseFloat(price) : null, ref.trim() || null))}>Save</button>
            <button style={btn} disabled={pending} onClick={() => { setEditing(false); setName(plan.name); setPrice(plan.monthly_price_aed?.toString() ?? ''); setRef(plan.provider_plan_ref ?? '') }}>Cancel</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--c-divider)', opacity: plan.active ? 1 : 0.5 }}>
      <td style={{ ...cell, fontWeight: 600, color: 'var(--c-ink)' }}>{plan.name}</td>
      <td style={cell}>{plan.monthly_price_aed != null ? `${plan.monthly_price_aed} AED` : '—'}</td>
      <td style={{ ...cell, fontFamily: 'var(--font-geist-mono, monospace)', fontSize: 12 }}>{plan.provider_plan_ref ?? '—'}</td>
      <td style={cell}>
        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: plan.active ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)', color: plan.active ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)' }}>
          {plan.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td style={{ ...cell, textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button style={btn} disabled={pending} onClick={() => setEditing(true)}>Edit</button>
          <button style={btn} disabled={pending} onClick={() => run(() => toggleMembershipPlan(plan.id, !plan.active))}>{plan.active ? 'Deactivate' : 'Activate'}</button>
          <button style={{ ...btn, color: 'var(--c-danger-ink)' }} disabled={pending} onClick={() => { if (confirm('Delete this plan?')) run(() => deleteMembershipPlan(plan.id)) }}>Delete</button>
        </div>
      </td>
    </tr>
  )
}
```

- [ ] **Step 3: `AddMembershipForm` — plan select + prefill**

Replace `payments/_components/add-membership-form.tsx` with the controlled version (plan select prefills the three fields; picking nothing keeps free-text):

```tsx
'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { saveMembership } from '../_actions/save-membership'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return <Button type="submit" size="sm" disabled={pending}>{pending ? 'Adding...' : 'Add membership'}</Button>
}

type Athlete = { id: string; full_name: string }
type Plan = { id: string; name: string; monthly_price_aed: number | null; provider_plan_ref: string | null }

const cls = 'rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function AddMembershipForm({ athletes, stripeConnected, plans }: { athletes: Athlete[]; stripeConnected: boolean; plans: Plan[] }) {
  const [state, formAction] = useFormState(saveMembership, { error: null })
  const formRef = useRef<HTMLFormElement>(null)
  const today = new Date().toISOString().slice(0, 10)

  const [planId, setPlanId] = useState('')
  const [planName, setPlanName] = useState('')
  const [monthlyPrice, setMonthlyPrice] = useState('')
  const [stripePriceId, setStripePriceId] = useState('')

  useEffect(() => {
    if (!state.error && formRef.current) {
      formRef.current.reset()
      setPlanId(''); setPlanName(''); setMonthlyPrice(''); setStripePriceId('')
    }
  }, [state])

  function onPick(id: string) {
    setPlanId(id)
    const p = plans.find((x) => x.id === id)
    if (p) {
      setPlanName(p.name)
      setMonthlyPrice(p.monthly_price_aed != null ? String(p.monthly_price_aed) : '')
      setStripePriceId(p.provider_plan_ref ?? '')
    }
  }

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <input type="hidden" name="planId" value={planId} />
      <select name="athleteId" required className={cls}>
        <option value="">Select athlete</option>
        {athletes.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
      </select>
      {plans.length > 0 && (
        <select value={planId} onChange={(e) => onPick(e.target.value)} className={cls}>
          <option value="">— Plan (or type below) —</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.monthly_price_aed != null ? ` · ${p.monthly_price_aed} AED` : ''}</option>)}
        </select>
      )}
      <input name="planName" type="text" required placeholder="Plan (e.g. Unlimited)" value={planName} onChange={(e) => setPlanName(e.target.value)} className={cls} />
      <input name="monthlyPrice" type="number" min={0} step={0.01} placeholder="Price (AED)" value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} className={cls} />
      <input name="startDate" type="date" required defaultValue={today} className={cls} />
      {stripeConnected && (
        <input name="stripePriceId" type="text" placeholder="Stripe Price ID (optional, e.g. price_...)" value={stripePriceId} onChange={(e) => setStripePriceId(e.target.value)} className={`col-span-2 sm:col-span-4 font-mono ${cls}`} />
      )}
      <div className="col-span-2 sm:col-span-4 flex items-center gap-3">
        <SubmitButton />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  )
}
```
NOTE: `stripePriceId` is only submitted when `stripeConnected` (the input renders conditionally) — unchanged from today. The prefill still sets its state; it just isn't posted unless the field is shown.

- [ ] **Step 4: Payments page — load plans, render section, pass to form**

In `payments/page.tsx`:
(a) imports:
```ts
import { AddMembershipPlanForm } from './_components/add-membership-plan-form'
import { MembershipPlanRow } from './_components/membership-plan-row'
```
(b) add a `membership_plans` load to the existing `Promise.all`:
```ts
    supabase.from('membership_plans').select('id, name, monthly_price_aed, provider_plan_ref, active').eq('box_id', profile.box_id).order('active', { ascending: false }).order('name'),
```
destructure it as `{ data: plans }`.
(c) pass active plans to the add-membership form:
```tsx
            <AddMembershipForm athletes={athletes ?? []} stripeConnected={stripeConnected} plans={(plans ?? []).filter((p) => p.active)} />
```
(d) render a "Membership plans" catalog section (place it near the existing Add-membership / Stripe-plan area). A card with the create form + a table of plans:
```tsx
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Membership plans</p>
            <AddMembershipPlanForm />
            {(plans?.length ?? 0) > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th style={{ padding: '6px 14px' }}>Plan</th><th style={{ padding: '6px 14px' }}>Price</th><th style={{ padding: '6px 14px' }}>Stripe ID</th><th style={{ padding: '6px 14px' }}>Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {plans!.map((p) => <MembershipPlanRow key={p.id} plan={p} />)}
                </tbody>
              </table>
            )}
          </div>
```
(Match the surrounding payments-page card styling; place the section above or beside the "Add membership" card.)

- [ ] **Step 5: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/payments` builds. `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/payments/_components/add-membership-plan-form.tsx src/app/dashboard/payments/_components/membership-plan-row.tsx src/app/dashboard/payments/_components/add-membership-form.tsx src/app/dashboard/payments/page.tsx
git commit -m "$(cat <<'EOF'
feat(plans): payments-page plan catalog section + add-membership prefill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. plan-validation, membership-plans, save-membership)
- [ ] `npm run build` → succeeds
- [ ] Final review (owner gate on all actions; 23503 delete-guard; snapshot — editing a plan never touches existing memberships; prefill stays editable), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/035_membership_plans.sql` in Supabase (8th pending, alongside 028–034).
- **Snapshot model:** the membership stores its own `plan_name`/`monthly_price_aed`; `plan_id` is only a provenance link. Editing or deactivating a plan never changes existing members.
- **Boundary:** recurring plans only — credit products remain the Packages catalog.
