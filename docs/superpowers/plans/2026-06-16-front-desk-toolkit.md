# Front Desk Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff-only `/dashboard/desk` surface where front-desk staff search a person and act on them — sign a walk-in up with a trial/plan, take payment (cash or Stripe link/QR), sell a pack, or check them in.

**Architecture:** Approach B — a new page + new desk-scoped server actions (`requireStaffAction`) that call **shared core logic** extracted from existing owner-only actions; the owner Payments tooling is untouched. Money actions write to the existing audit log. No migration.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role client after authz), Tailwind, Vitest, `qrcode` (already a dep). Spec: `docs/superpowers/specs/2026-06-16-front-desk-toolkit-design.md`.

---

## File Structure

**New (created):**
- `src/lib/members.ts` — `createMemberCore` (extracted from `addMember`)
- `src/lib/memberships.ts` — `assignMembershipCore` (extracted from `saveMembership`)
- `src/app/dashboard/desk/page.tsx` — staff-gated page shell
- `src/app/dashboard/desk/_lib/search.ts` — pure `rankPeopleResults` + types
- `src/app/dashboard/desk/_lib/validation.ts` — pure `validateWalkIn`
- `src/app/dashboard/desk/_actions/search-people.ts` — `searchPeople`
- `src/app/dashboard/desk/_actions/load-member-context.ts` — `loadMemberContext`
- `src/app/dashboard/desk/_actions/desk-create-lead.ts` — `deskCreateLead`
- `src/app/dashboard/desk/_actions/desk-sign-up.ts` — `deskSignUp`
- `src/app/dashboard/desk/_actions/desk-money.ts` — `deskRecordCash`, `deskPaymentLink`, `deskSellPackage`
- `src/app/dashboard/desk/_components/DeskSearch.tsx` — client search box + results
- `src/app/dashboard/desk/_components/ResultRow.tsx` — one member/lead row + action drawer
- `src/app/dashboard/desk/_components/WalkInPanel.tsx` — quick-create (lead / sign-up)
- `src/app/dashboard/desk/_components/PaymentActions.tsx` — cash / Stripe link+QR / sell
- `src/app/dashboard/desk/_components/DeskCheckIn.tsx` — today's bookings + check-in/override
- Test files under `src/__tests__/` (one per logic task, named below)

**Modified:**
- `src/lib/audit.ts` — add 3 desk money `AuditAction`s + labels + detail rendering
- `src/app/dashboard/members/_actions/add-member.ts` — call `createMemberCore`
- `src/app/dashboard/payments/_actions/save-membership.ts` — call `assignMembershipCore`
- `src/components/sidebar.tsx` — add staff-tier "Front Desk" nav item
- `src/app/dashboard/layout.tsx` (or wherever the sidebar `active` key is derived) — map `/dashboard/desk` → `desk`

**Conventions to follow (read once before starting):** server actions are `'use server'`, return `{ error: string | null, ... }`; authz guards from `@/lib/auth/action-guards` checked via `if ('error' in auth)`; service-role client `createServiceClient()` from `@/lib/supabase/service` created **after** the authz check; all queries `.eq('box_id', …)`; client forms use `useFormState`/`useActionState`; UI uses `Card`/`Button` from `@/components/ui/*` (see `src/app/dashboard/members/[memberId]/_components/mfa-card.tsx` for styling, `src/components/sidebar.tsx` for the design tokens like `text-ink`, `border-line`).

---

## Phase 0 — Foundations

### Task 1: Add desk money actions to the audit log

**Files:**
- Modify: `src/lib/audit.ts`
- Test: `src/__tests__/audit-desk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/audit-desk.test.ts
import { test, expect } from 'vitest'
import { AUDIT_ACTION_LABELS, describeAuditDetails } from '@/lib/audit'

test('desk money actions have labels', () => {
  expect(AUDIT_ACTION_LABELS['desk.cash_recorded']).toBe('Cash recorded')
  expect(AUDIT_ACTION_LABELS['desk.payment_link']).toBe('Payment link')
  expect(AUDIT_ACTION_LABELS['desk.package_sold']).toBe('Package sold')
})

test('describeAuditDetails renders cash amount', () => {
  expect(describeAuditDetails('desk.cash_recorded', { plan: 'Unlimited', amount_aed: 300 })).toBe('AED 300 — Unlimited')
  expect(describeAuditDetails('desk.package_sold', { package: '10-pack' })).toBe('10-pack')
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/__tests__/audit-desk.test.ts`
Expected: FAIL (label keys missing / detail returns '').

- [ ] **Step 3: Edit `src/lib/audit.ts`**

Extend the union (line 5), the labels map (line 16), and `describeAuditDetails` (the `switch`, before `default`):

```ts
export type AuditAction =
  | 'invoice.refund' | 'staff.role_change' | 'member.remove' | 'staff.mfa_reset'
  | 'desk.cash_recorded' | 'desk.payment_link' | 'desk.package_sold'
```
```ts
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'invoice.refund': 'Refund',
  'staff.role_change': 'Role change',
  'member.remove': 'Member removed',
  'staff.mfa_reset': 'MFA reset',
  'desk.cash_recorded': 'Cash recorded',
  'desk.payment_link': 'Payment link',
  'desk.package_sold': 'Package sold',
}
```
Add these cases inside `describeAuditDetails`'s `switch (action)` before `default`:
```ts
    case 'desk.cash_recorded': {
      const amt = typeof d.amount_aed === 'number' ? `AED ${d.amount_aed}` : 'Cash'
      return d.plan ? `${amt} — ${String(d.plan)}` : amt
    }
    case 'desk.payment_link':
      return d.plan ? `Link · ${String(d.plan)}` : 'Link'
    case 'desk.package_sold':
      return d.package ? String(d.package) : ''
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/__tests__/audit-desk.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts src/__tests__/audit-desk.test.ts
git commit -m "feat(desk): audit-log action keys for desk money actions"
```

---

### Task 2: Extract `createMemberCore` from `addMember`

**Files:**
- Create: `src/lib/members.ts`
- Modify: `src/app/dashboard/members/_actions/add-member.ts`
- Test: `src/__tests__/create-member-core.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/create-member-core.test.ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { createMemberCore } from '@/lib/members'

beforeEach(() => vi.clearAllMocks())

test('creates auth user + athlete profile, returns id', async () => {
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  const res = await createMemberCore(svc as never, { boxId: 'b1', fullName: 'Sara', email: 'sara@x.com', phone: '+97150', role: 'athlete' })
  expect(res.error).toBeNull()
  expect(res.athleteId).toBe('new1')
  expect(svc.auth.admin.createUser).toHaveBeenCalledWith({ email: 'sara@x.com', email_confirm: true })
  expect(svc.builder('profiles').insert).toHaveBeenCalledWith(expect.objectContaining({ box_id: 'b1', role: 'athlete', full_name: 'Sara', email: 'sara@x.com' }))
})

test('rolls back the auth user when the profile insert fails', async () => {
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: { message: 'dup' } } } })
  const res = await createMemberCore(svc as never, { boxId: 'b1', fullName: 'Sara', email: 'sara@x.com', phone: null, role: 'athlete' })
  expect(res.athleteId).toBeNull()
  expect(res.error).toBe('dup')
  expect(svc.auth.admin.deleteUser).toHaveBeenCalledWith('new1')
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/__tests__/create-member-core.test.ts`
Expected: FAIL (`@/lib/members` not found).

- [ ] **Step 3: Create `src/lib/members.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '@/lib/auth/roles'

export type CreateMemberInput = {
  boxId: string
  fullName: string
  email: string
  phone: string | null
  role: Role
  idType?: string | null
  idNumber?: string | null
}
export type CreateMemberResult = { athleteId: string | null; error: string | null }

/**
 * Core member-create. Creates the auth user (no email sent) + the profile row,
 * rolling back the auth user if the profile insert fails. Box-pinned. The CALLER
 * is responsible for authorization and input validation.
 */
export async function createMemberCore(service: SupabaseClient, input: CreateMemberInput): Promise<CreateMemberResult> {
  const { data: newUser, error: authError } = await service.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
  })
  if (authError || !newUser?.user) {
    const msg = authError?.message?.includes('already been registered')
      ? 'A user with this email already exists.'
      : (authError?.message ?? 'Could not create the member account.')
    return { athleteId: null, error: msg }
  }

  const { error: profileError } = await service.from('profiles').insert({
    id: newUser.user.id,
    box_id: input.boxId,
    role: input.role,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    id_type: input.idNumber ? (input.idType ?? null) : null,
    id_number: input.idNumber ?? null,
  })
  if (profileError) {
    await service.auth.admin.deleteUser(newUser.user.id)
    return { athleteId: null, error: profileError.message }
  }
  return { athleteId: newUser.user.id, error: null }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/__tests__/create-member-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `add-member.ts` to use the core (no behavior change)**

Replace the body from line 32 (`const service = createServiceClient()`) through the `profileError` block (line 62) with:
```ts
  const service = createServiceClient()
  const { createMemberCore } = await import('@/lib/members')
  const { error: coreError } = await createMemberCore(service, {
    boxId: callerProfile.box_id,
    fullName,
    email,
    phone,
    role: role as never,
    idType: normalizedId ? idType : null,
    idNumber: normalizedId,
  })
  if (coreError) return { error: coreError }
```
Keep the existing `revalidatePath('/dashboard/members')` and `return { error: null }`. (Top-of-file `import { createMemberCore } from '@/lib/members'` is also fine instead of the dynamic import — match the file's existing import style.)

- [ ] **Step 6: Run the existing add-member tests + the new one, verify green**

Run: `npx vitest run src/__tests__/create-member-core.test.ts && npx vitest run -t "add member|addMember"`
Expected: PASS (the refactor preserves behavior).

- [ ] **Step 7: Commit**

```bash
git add src/lib/members.ts src/app/dashboard/members/_actions/add-member.ts src/__tests__/create-member-core.test.ts
git commit -m "refactor(members): extract createMemberCore for desk reuse"
```

---

### Task 3: Extract `assignMembershipCore` from `saveMembership`

**Files:**
- Create: `src/lib/memberships.ts`
- Modify: `src/app/dashboard/payments/_actions/save-membership.ts`
- Test: `src/__tests__/assign-membership-core.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/assign-membership-core.test.ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { assignMembershipCore } from '@/lib/memberships'

beforeEach(() => vi.clearAllMocks())

test('free trial plan → end_date, is_trial, paid', async () => {
  const svc = makeSupabaseMock({ results: {
    membership_plans: { data: { monthly_price_aed: 0, is_trial: true, trial_days: 7 }, error: null },
    memberships: { data: null, error: null },
  } })
  const res = await assignMembershipCore(svc as never, { boxId: 'b1', athleteId: 'a1', planName: '7-Day Trial', monthlyPrice: 0, startDate: '2026-06-01', planId: 'trial-1' })
  expect(res.error).toBeNull()
  expect(svc.builder('memberships').insert).toHaveBeenCalledWith(expect.objectContaining({
    is_trial: true, end_date: '2026-06-08', payment_status: 'paid', plan_id: 'trial-1',
  }))
})

test('non-trial plan → unpaid, no end_date', async () => {
  const svc = makeSupabaseMock({ results: { memberships: { data: null, error: null } } })
  const res = await assignMembershipCore(svc as never, { boxId: 'b1', athleteId: 'a1', planName: 'Unlimited', monthlyPrice: 300, startDate: '2026-06-01' })
  expect(res.error).toBeNull()
  const arg = svc.builder('memberships').insert.mock.calls[0][0]
  expect(arg.payment_status).toBe('unpaid')
  expect(arg.is_trial).toBe(false)
  expect('end_date' in arg).toBe(false)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/__tests__/assign-membership-core.test.ts`
Expected: FAIL (`@/lib/memberships` not found).

- [ ] **Step 3: Create `src/lib/memberships.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays } from '@/lib/date-utils'

export type AssignMembershipInput = {
  boxId: string
  athleteId: string
  planName: string
  monthlyPrice: number | null
  startDate: string
  planId?: string | null
  stripePriceId?: string | null
}

/**
 * Core membership assignment, incl. trial derivation from the authoritative plan
 * (a trial plan → end_date = start + trial_days; free trial → paid/access, priced
 * intro → unpaid). Box-pinned. The CALLER authorizes + validates. `client` may be
 * the RLS (owner) or service-role (desk) client — both box-scope by .eq.
 */
export async function assignMembershipCore(client: SupabaseClient, input: AssignMembershipInput): Promise<{ error: string | null }> {
  let endDate: string | null = null
  let isTrial = false
  let trialPaymentStatus: 'paid' | 'unpaid' | null = null
  if (input.planId) {
    const { data: plan } = await client
      .from('membership_plans')
      .select('monthly_price_aed, is_trial, trial_days')
      .eq('id', input.planId)
      .eq('box_id', input.boxId)
      .single()
    if (plan?.is_trial && plan.trial_days) {
      isTrial = true
      endDate = addDays(input.startDate, plan.trial_days)
      trialPaymentStatus = (plan.monthly_price_aed == null || Number(plan.monthly_price_aed) === 0) ? 'paid' : 'unpaid'
    }
  }

  const { error } = await client.from('memberships').insert({
    box_id: input.boxId,
    athlete_id: input.athleteId,
    plan_name: input.planName,
    monthly_price_aed: input.monthlyPrice,
    start_date: input.startDate,
    payment_status: trialPaymentStatus ?? 'unpaid',
    is_trial: isTrial,
    ...(endDate ? { end_date: endDate } : {}),
    ...(input.stripePriceId ? { provider_plan_ref: input.stripePriceId } : {}),
    ...(input.planId ? { plan_id: input.planId } : {}),
  })
  if (error) {
    console.error('assignMembershipCore insert failed:', error)
    return { error: 'Could not save the membership.' }
  }
  return { error: null }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/__tests__/assign-membership-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `save-membership.ts` to call the core**

Replace lines 25–60 (the trial derivation + the `supabase.from('memberships').insert({...})` block + its error handling) with:
```ts
  const { assignMembershipCore } = await import('@/lib/memberships')
  const { error } = await assignMembershipCore(supabase, {
    boxId: profile.box_id,
    athleteId,
    planName,
    monthlyPrice,
    startDate,
    planId,
    stripePriceId,
  })
  if (error) return { error }
```
Keep the existing `revalidatePath('/dashboard/payments')` + `return { error: null }`. Remove the now-unused `addDays` import.

- [ ] **Step 6: Run save-membership + core tests, verify green**

Run: `npx vitest run src/__tests__/save-membership.integration.test.ts src/__tests__/assign-membership-core.test.ts`
Expected: PASS (behavior preserved).

- [ ] **Step 7: Commit**

```bash
git add src/lib/memberships.ts src/app/dashboard/payments/_actions/save-membership.ts src/__tests__/assign-membership-core.test.ts
git commit -m "refactor(memberships): extract assignMembershipCore for desk reuse"
```

---

### Task 4: Pure search ranking + walk-in validation

**Files:**
- Create: `src/app/dashboard/desk/_lib/search.ts`
- Create: `src/app/dashboard/desk/_lib/validation.ts`
- Test: `src/__tests__/desk-lib.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/desk-lib.test.ts
import { test, expect } from 'vitest'
import { rankPeopleResults, type MemberRow, type LeadRow } from '@/app/dashboard/desk/_lib/search'
import { validateWalkIn } from '@/app/dashboard/desk/_lib/validation'

const members: MemberRow[] = [
  { id: 'm1', full_name: 'Sara Ali', email: 'sara@x.com', phone: '+971501', status: 'paid' },
  { id: 'm2', full_name: 'Omar Sara', email: null, phone: null, status: 'unpaid' },
]
const leads: LeadRow[] = [{ id: 'l1', full_name: 'Sara Lead', email: null, phone: '+971509', source: 'walk_in', status: 'new' }]

test('exact prefix on name ranks above mid-string match', () => {
  const hits = rankPeopleResults(members, leads, 'sara')
  expect(hits[0].id).toBe('m1') // "Sara Ali" starts with query
  expect(hits.map((h) => h.kind)).toContain('lead')
})

test('members rank above leads at equal score', () => {
  const hits = rankPeopleResults(members, leads, 'sara')
  const firstLead = hits.findIndex((h) => h.kind === 'lead')
  const firstMember = hits.findIndex((h) => h.kind === 'member')
  expect(firstMember).toBeLessThan(firstLead)
})

test('validateWalkIn — lead mode needs name + phone-or-email', () => {
  expect(validateWalkIn({ mode: 'lead', fullName: '', phone: '1', email: '' })).toMatch(/name/i)
  expect(validateWalkIn({ mode: 'lead', fullName: 'A', phone: '', email: '' })).toMatch(/phone or email/i)
  expect(validateWalkIn({ mode: 'lead', fullName: 'A', phone: '+97150', email: '' })).toBeNull()
})

test('validateWalkIn — signup mode needs name + valid email + plan', () => {
  expect(validateWalkIn({ mode: 'signup', fullName: 'A', email: 'bad', planId: 'p1' })).toMatch(/valid email/i)
  expect(validateWalkIn({ mode: 'signup', fullName: 'A', email: 'a@b.com', planId: '' })).toMatch(/plan/i)
  expect(validateWalkIn({ mode: 'signup', fullName: 'A', email: 'a@b.com', planId: 'p1' })).toBeNull()
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/__tests__/desk-lib.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Create `src/app/dashboard/desk/_lib/search.ts`**

```ts
import type { MembershipStatus } from '@/lib/membership-status'

export type MemberRow = { id: string; full_name: string | null; email: string | null; phone: string | null; status: MembershipStatus | 'no_membership' }
export type LeadRow = { id: string; full_name: string | null; email: string | null; phone: string | null; source: string; status: string }

export type PersonHit =
  | { kind: 'member'; id: string; name: string; email: string | null; phone: string | null; status: MemberRow['status']; score: number }
  | { kind: 'lead'; id: string; name: string; email: string | null; phone: string | null; source: string; leadStatus: string; score: number }

// Higher score = better match. Name prefix > name word-prefix > substring (name/email/phone).
function scoreOne(q: string, name: string | null, email: string | null, phone: string | null): number {
  const n = (name ?? '').toLowerCase()
  const e = (email ?? '').toLowerCase()
  const p = (phone ?? '').replace(/\s/g, '')
  const query = q.toLowerCase().trim()
  const pq = query.replace(/\s/g, '')
  if (!query) return 0
  if (n.startsWith(query)) return 100
  if (n.split(/\s+/).some((w) => w.startsWith(query))) return 80
  if (n.includes(query)) return 60
  if (e.startsWith(query)) return 50
  if (e.includes(query)) return 40
  if (pq && p.includes(pq)) return 30
  return 0
}

/** Merge + rank members and leads for the desk search. Members outrank leads at equal score. */
export function rankPeopleResults(members: MemberRow[], leads: LeadRow[], query: string): PersonHit[] {
  const hits: PersonHit[] = []
  for (const m of members) {
    const score = scoreOne(query, m.full_name, m.email, m.phone)
    if (score > 0) hits.push({ kind: 'member', id: m.id, name: m.full_name ?? '—', email: m.email, phone: m.phone, status: m.status, score })
  }
  for (const l of leads) {
    const score = scoreOne(query, l.full_name, l.email, l.phone)
    if (score > 0) hits.push({ kind: 'lead', id: l.id, name: l.full_name ?? '—', email: l.email, phone: l.phone, source: l.source, leadStatus: l.status, score })
  }
  // Members win ties (kindRank 0 < 1); higher score first.
  return hits.sort((a, b) => b.score - a.score || (a.kind === 'member' ? 0 : 1) - (b.kind === 'member' ? 0 : 1))
}
```

- [ ] **Step 4: Create `src/app/dashboard/desk/_lib/validation.ts`**

```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type WalkInInput =
  | { mode: 'lead'; fullName: string; phone?: string; email?: string }
  | { mode: 'signup'; fullName: string; email: string; planId: string }

/** Lead: name + (phone OR email). Signup: name + valid email + a selected plan. Returns a message or null. */
export function validateWalkIn(input: WalkInInput): string | null {
  if (!input.fullName?.trim()) return 'Name is required.'
  if (input.mode === 'lead') {
    if (!input.phone?.trim() && !input.email?.trim()) return 'Add a phone or email.'
    if (input.email?.trim() && !EMAIL_RE.test(input.email.trim())) return 'Enter a valid email address.'
    return null
  }
  if (!input.email?.trim() || !EMAIL_RE.test(input.email.trim())) return 'Enter a valid email address.'
  if (!input.planId?.trim()) return 'Pick a plan to sign them up.'
  return null
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/__tests__/desk-lib.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/desk/_lib src/__tests__/desk-lib.test.ts
git commit -m "feat(desk): pure search ranking + walk-in validation"
```

---

## Phase 1 — Search, page, nav (#100)

### Task 5: `searchPeople` action

**Files:**
- Create: `src/app/dashboard/desk/_actions/search-people.ts`
- Test: `src/__tests__/desk-search.integration.test.ts`

`searchPeople(query)` (staff-gated): box-scoped `ilike` over `profiles` (athletes) and `leads`; for matched athletes, one batched `memberships` fetch + `getMembershipStatus` to attach a status; returns `rankPeopleResults(...)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/desk-search.integration.test.ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))

import { searchPeople } from '@/app/dashboard/desk/_actions/search-people'

beforeEach(() => vi.clearAllMocks())

test('blocks non-staff', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  const res = await searchPeople('sara')
  expect(res.error).toMatch(/staff/i)
})

test('returns ranked member+lead hits for staff', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'r1' },
    results: {
      profiles: [
        { data: { box_id: 'b1', role: 'receptionist', full_name: 'Front Desk' }, error: null }, // guard's profile lookup
        { data: [{ id: 'm1', full_name: 'Sara Ali', email: 'sara@x.com', phone: null }], error: null }, // member search
      ],
      leads: { data: [{ id: 'l1', full_name: 'Sara Lead', email: null, phone: '+97150', source: 'walk_in', status: 'new' }], error: null },
      memberships: { data: [{ athlete_id: 'm1', payment_status: 'paid', end_date: null, last_paid_date: '2026-06-01', frozen_from: null, frozen_until: null }], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await searchPeople('sara')
  expect(res.error).toBeNull()
  expect(res.hits!.length).toBe(2)
  expect(res.hits![0].kind).toBe('member')
})

test('empty query returns no hits, no error', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const res = await searchPeople('   ')
  expect(res).toEqual({ error: null, hits: [] })
})
```

> Note: the mock's `profiles` result is an **array** so the first terminal (the guard's `.single()` profile lookup) and the second (the member `ilike` search) consume successive entries — see `makeSupabaseMock`'s array behavior.

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/__tests__/desk-search.integration.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/app/dashboard/desk/_actions/search-people.ts`**

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { getMembershipStatus } from '@/lib/membership-status'
import { rankPeopleResults, type MemberRow, type LeadRow, type PersonHit } from '../_lib/search'

type State = { error: string | null; hits?: PersonHit[] }

export async function searchPeople(query: string): Promise<State> {
  const q = (query ?? '').trim()
  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  if (q.length < 1) return { error: null, hits: [] }

  const { supabase, profile } = auth
  const boxId = profile.box_id
  const like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`

  const { data: people } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .eq('box_id', boxId)
    .eq('role', 'athlete')
    .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},id_number.ilike.${like}`)
    .limit(20)

  const { data: leads } = await supabase
    .from('leads')
    .select('id, full_name, email, phone, source, status')
    .eq('box_id', boxId)
    .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .limit(20)

  const ids = (people ?? []).map((p) => p.id)
  const today = new Date().toISOString().slice(0, 10)
  let byAthlete: Record<string, { payment_status: string; end_date: string | null; last_paid_date: string | null; frozen_from: string | null; frozen_until: string | null }[]> = {}
  if (ids.length) {
    const { data: ms } = await supabase
      .from('memberships')
      .select('athlete_id, payment_status, end_date, last_paid_date, frozen_from, frozen_until')
      .eq('box_id', boxId)
      .in('athlete_id', ids)
    byAthlete = (ms ?? []).reduce((acc, m) => {
      ;(acc[m.athlete_id] ??= []).push(m)
      return acc
    }, {} as typeof byAthlete)
  }

  const members: MemberRow[] = (people ?? []).map((p) => {
    const mem = byAthlete[p.id] ?? []
    const status = mem.length ? getMembershipStatus(mem, today) : 'no_membership'
    return { id: p.id, full_name: p.full_name, email: p.email, phone: p.phone, status }
  })
  const leadRows: LeadRow[] = (leads ?? []).map((l) => ({ id: l.id, full_name: l.full_name, email: l.email, phone: l.phone, source: l.source, status: l.status }))

  return { error: null, hits: rankPeopleResults(members, leadRows, q) }
}
```

> If `getMembershipStatus`'s row type is stricter than the inline shape, cast the `mem` array with `as never` at the call site — match how `assessCheckInEntitlement` passes memberships.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/__tests__/desk-search.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/desk/_actions/search-people.ts src/__tests__/desk-search.integration.test.ts
git commit -m "feat(desk): box-scoped staff people search (members + leads)"
```

---

### Task 6: Desk page + search UI

**Files:**
- Create: `src/app/dashboard/desk/page.tsx`
- Create: `src/app/dashboard/desk/_components/DeskSearch.tsx`
- Create: `src/app/dashboard/desk/_components/ResultRow.tsx`

No new tests (presentational; logic is covered by Task 4/5). Verify by build + manual.

- [ ] **Step 1: Create the page shell `src/app/dashboard/desk/page.tsx`**

```tsx
import { requireStaffPage } from '@/lib/auth/page-guards'
import { DeskSearch } from './_components/DeskSearch'

export default async function DeskPage() {
  await requireStaffPage()
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Front Desk</h1>
      <p className="mb-5 text-[13px] text-ink-3">Search a member or lead, then check in, take payment, or sign up a walk-in.</p>
      <DeskSearch />
    </div>
  )
}
```
> Confirm `requireStaffPage` exists in `@/lib/auth/page-guards` (it does — see `src/__tests__/auth-guards.test.ts`). If the page needs the box timezone or staff role for child components, fetch it here and pass as props (mirror another dashboard page).

- [ ] **Step 2: Create `DeskSearch.tsx`** (client; autofocus input, ~250ms debounce calling `searchPeople`, renders `ResultRow` list + a "New walk-in" affordance)

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { searchPeople } from '../_actions/search-people'
import type { PersonHit } from '../_lib/search'
import { ResultRow } from './ResultRow'
import { WalkInPanel } from './WalkInPanel'

export function DeskSearch() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PersonHit[]>([])
  const [loading, setLoading] = useState(false)
  const [walkIn, setWalkIn] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (!query) { setHits([]); return }
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      const res = await searchPeople(query)
      if (mine !== seq.current) return // drop stale responses
      setHits(res.hits ?? [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        value={q}
        onChange={(e) => { setQ(e.target.value); setWalkIn(false) }}
        placeholder="Search name / phone / email / Emirates ID…"
        aria-label="Search people"
        className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      {loading && <p className="text-[13px] text-ink-3">Searching…</p>}
      {!loading && q.trim() && hits.length === 0 && (
        <p className="text-[13px] text-ink-3">No match.</p>
      )}
      <div className="flex flex-col gap-2">
        {hits.map((h) => <ResultRow key={`${h.kind}:${h.id}`} hit={h} />)}
      </div>
      {q.trim() && (
        walkIn
          ? <WalkInPanel initialName={q.trim()} onDone={() => { setWalkIn(false); setQ('') }} />
          : <button onClick={() => setWalkIn(true)} className="self-start rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-2">+ New walk-in “{q.trim()}”</button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `ResultRow.tsx`** (a member/lead row; expands to an action drawer)

A `'use client'` component taking `{ hit: PersonHit }`. Render name + a status chip (member: `hit.status`; lead: `hit.source`/`leadStatus`), plus quick-action buttons that toggle an inline drawer:
- **member** → `[Check in] [Take payment] [Open]`. "Open" links to `/dashboard/members/${hit.id}`. "Check in" mounts `<DeskCheckIn athleteId={hit.id} />`; "Take payment" mounts `<PaymentActions athleteId={hit.id} />` (both lazy — only when toggled).
- **lead** → `[Sign up now] [Open]`. "Sign up now" mounts `<WalkInPanel leadId={hit.id} initialName={hit.name} />`.

Match the `Card`/`Button` styling and design tokens from `mfa-card.tsx` and `sidebar.tsx` (`border-line`, `text-ink`, `bg-surface`, chips like `font-mono rounded px-1 py-px text-[10px]`). Keep this file focused on layout + toggling; all data/actions live in the child components.

- [ ] **Step 4: Build, verify it compiles**

Run: `npm run build` (or `npx tsc --noEmit`)
Expected: PASS (components may reference `WalkInPanel`/`PaymentActions`/`DeskCheckIn` created in later tasks — if building before those exist, stub them as `export function X() { return null }` and flesh out in their tasks, OR implement Tasks 8–15 before this build step). Prefer: create empty stub components first so the page renders.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/desk/page.tsx src/app/dashboard/desk/_components/DeskSearch.tsx src/app/dashboard/desk/_components/ResultRow.tsx
git commit -m "feat(desk): /dashboard/desk page + live search UI"
```

---

### Task 7: Sidebar nav entry

**Files:**
- Modify: `src/components/sidebar.tsx`
- Modify: wherever the sidebar `active` key is computed (search for `active=` passed to `<Sidebar`)

- [ ] **Step 1: Add the nav item.** In `getNavGroups`, in the `runTheGym` array, after the `members` push (line 42), add:

```ts
  if (isStaff) runTheGym.push({ key: 'desk', label: 'Front Desk', href: '/dashboard/desk', icon: 'desk' })
```

- [ ] **Step 2: Add a `desk` icon** to `ICON_PATHS` (after `users`):

```tsx
  desk: <><rect x="3" y="9" width="18" height="3" rx="1" /><path d="M5 12v7M19 12v7M4 9l2-4h12l2 4M9 16h6" /></>,
```

- [ ] **Step 3: Map the active key.** Find where `<Sidebar active={…}` is rendered (likely `src/components/shell/dashboard-shell.tsx` or `src/app/dashboard/layout.tsx`); ensure a path of `/dashboard/desk` resolves `active='desk'` (follow how `members`/`whiteboard` are derived from the pathname).

- [ ] **Step 4: Build, verify the nav shows for staff**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx src/components/shell/dashboard-shell.tsx
git commit -m "feat(desk): staff sidebar entry for Front Desk"
```

---

## Phase 2 — Walk-in (#101)

### Task 8: `deskCreateLead` action

**Files:**
- Create: `src/app/dashboard/desk/_actions/desk-create-lead.ts`
- Test: `src/__tests__/desk-create-lead.integration.test.ts`

`deskCreateLead(input)` (staff-gated): validates via `validateWalkIn({mode:'lead',...})`, inserts a `leads` row (`source: input.source ?? 'walk_in'`), box-scoped.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/desk-create-lead.integration.test.ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deskCreateLead } from '@/app/dashboard/desk/_actions/desk-create-lead'

beforeEach(() => vi.clearAllMocks())

test('staff can create a walk-in lead', async () => {
  const rls = makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null }, leads: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await deskCreateLead({ fullName: 'Sara', phone: '+97150', email: '', source: 'walk_in' })
  expect(res.error).toBeNull()
  expect(rls.builder('leads').insert).toHaveBeenCalledWith(expect.objectContaining({ box_id: 'b1', full_name: 'Sara', source: 'walk_in' }))
})

test('rejects missing name', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null } } }))
  const res = await deskCreateLead({ fullName: '', phone: '+97150', email: '' })
  expect(res.error).toMatch(/name/i)
})
```

- [ ] **Step 2: Run it, verify it fails.** Run: `npx vitest run src/__tests__/desk-create-lead.integration.test.ts` → FAIL.

- [ ] **Step 3: Create `desk-create-lead.ts`**

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateWalkIn } from '../_lib/validation'

type Input = { fullName: string; phone?: string; email?: string; source?: string }
type State = { error: string | null }

export async function deskCreateLead(input: Input): Promise<State> {
  const err = validateWalkIn({ mode: 'lead', fullName: input.fullName, phone: input.phone, email: input.email })
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('leads').insert({
    box_id: profile.box_id,
    full_name: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    source: input.source || 'walk_in',
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/desk')
  revalidatePath('/dashboard/members')
  return { error: null }
}
```

- [ ] **Step 4: Run the test → PASS.** Run: `npx vitest run src/__tests__/desk-create-lead.integration.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/desk/_actions/desk-create-lead.ts src/__tests__/desk-create-lead.integration.test.ts
git commit -m "feat(desk): deskCreateLead walk-in capture"
```

---

### Task 9: `deskSignUp` action

**Files:**
- Create: `src/app/dashboard/desk/_actions/desk-sign-up.ts`
- Test: `src/__tests__/desk-sign-up.integration.test.ts`

`deskSignUp(input)` (staff-gated): validates `validateWalkIn({mode:'signup',...})`; obtains an `athleteId` via `convertLeadCore` (if `input.leadId`) **or** `createMemberCore` (new); then `assignMembershipCore` with the picked plan; `startDate = today`. Uses the service client.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/desk-sign-up.integration.test.ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deskSignUp } from '@/app/dashboard/desk/_actions/desk-sign-up'

beforeEach(() => vi.clearAllMocks())

test('new walk-in: creates member then assigns the plan', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null }, membership_plans: { data: { monthly_price_aed: 0, is_trial: true, trial_days: 7 }, error: null }, memberships: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)

  const res = await deskSignUp({ fullName: 'Sara', email: 'sara@x.com', phone: '+97150', planId: 'trial-1', planName: '7-Day Trial', monthlyPrice: 0 })
  expect(res.error).toBeNull()
  expect(res.memberId).toBe('new1')
  expect(svc.auth.admin.createUser).toHaveBeenCalled()
  expect(svc.builder('memberships').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'new1', plan_id: 'trial-1', is_trial: true }))
})

test('rejects bad email before any write', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await deskSignUp({ fullName: 'Sara', email: 'bad', phone: '', planId: 'p1', planName: 'X', monthlyPrice: 0 })
  expect(res.error).toMatch(/valid email/i)
})
```

- [ ] **Step 2: Run it → FAIL.** Run: `npx vitest run src/__tests__/desk-sign-up.integration.test.ts`

- [ ] **Step 3: Create `desk-sign-up.ts`**

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateWalkIn } from '../_lib/validation'
import { convertLeadCore } from '@/lib/convert-lead'
import { createMemberCore } from '@/lib/members'
import { assignMembershipCore } from '@/lib/memberships'

type Input = {
  leadId?: string
  fullName: string
  email: string
  phone?: string
  source?: string
  planId: string
  planName: string
  monthlyPrice?: number | null
  stripePriceId?: string | null
}
type State = { error: string | null; memberId?: string | null }

export async function deskSignUp(input: Input): Promise<State> {
  const err = validateWalkIn({ mode: 'signup', fullName: input.fullName, email: input.email, planId: input.planId })
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth
  const service = createServiceClient()

  // Get an athlete id: convert the matched lead, or create a fresh member.
  let athleteId: string
  if (input.leadId) {
    const conv = await convertLeadCore(service, input.leadId, profile.box_id)
    if (conv.error || !conv.athleteId) return { error: conv.error ?? 'Could not convert the lead.' }
    athleteId = conv.athleteId
  } else {
    const made = await createMemberCore(service, {
      boxId: profile.box_id,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      role: 'athlete',
    })
    if (made.error || !made.athleteId) return { error: made.error ?? 'Could not create the member.' }
    athleteId = made.athleteId
  }

  const today = new Date().toISOString().slice(0, 10)
  const assigned = await assignMembershipCore(service, {
    boxId: profile.box_id,
    athleteId,
    planName: input.planName,
    monthlyPrice: input.monthlyPrice ?? null,
    startDate: today,
    planId: input.planId,
    stripePriceId: input.stripePriceId ?? null,
  })
  if (assigned.error) return { error: assigned.error, memberId: athleteId } // member exists; surface the plan error

  revalidatePath('/dashboard/desk')
  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/payments')
  return { error: null, memberId: athleteId }
}
```

- [ ] **Step 4: Run the test → PASS.** Run: `npx vitest run src/__tests__/desk-sign-up.integration.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/desk/_actions/desk-sign-up.ts src/__tests__/desk-sign-up.integration.test.ts
git commit -m "feat(desk): deskSignUp — walk-in/lead -> member + plan"
```

---

### Task 10: `WalkInPanel` component

**Files:**
- Create: `src/app/dashboard/desk/_components/WalkInPanel.tsx`

A `'use client'` component: props `{ initialName?: string; leadId?: string; onDone?: () => void }`. It needs the gym's active plans for the "Sign up now" picker — fetch them via a small staff-gated action or pass them down from the page. **Simplest:** add a `loadActivePlans()` staff action (box-scoped `membership_plans` where `active=true`) and call it on mount; OR fetch plans in `page.tsx` and thread to `DeskSearch`→`WalkInPanel` as a prop. Choose the prop-threading route (one fetch, no extra action).

Behavior:
- Two buttons/tabs: **Save as lead** and **Sign up now**.
- Fields: full name (prefilled `initialName`), phone, email; for sign-up: a plan `<select>` over active plans (prefills `planName`/`monthlyPrice`/`stripePriceId` from the chosen plan, mirroring `add-member-form`/`AddMembershipForm`).
- **Save as lead** → `deskCreateLead(...)`. **Sign up now** → `deskSignUp({ leadId, ... })`.
- On success: call `onDone?.()`; if sign-up returned `memberId`, show a success line with a "Take payment" affordance that mounts `<PaymentActions athleteId={memberId} />` (so the operator can immediately collect).
- Use `useActionState`/local `useState` + `Button`/`Card` styling per existing forms. Show `state.error` in `text-danger`.

> If `leadId` is set, hide the "Save as lead" tab (the lead already exists) and default to "Sign up now".

- [ ] **Step 1: Implement the component** (no unit test — logic is in Tasks 4/8/9).
- [ ] **Step 2: Update `page.tsx`** to fetch active plans (`membership_plans` where `box_id` + `active`) and pass to `DeskSearch` → `WalkInPanel`. Type: `type PlanOption = { id: string; name: string; monthly_price_aed: number | null; provider_plan_ref: string | null; is_trial: boolean }`.
- [ ] **Step 3: Build → PASS.** Run: `npm run build`
- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/desk/_components/WalkInPanel.tsx src/app/dashboard/desk/page.tsx src/app/dashboard/desk/_components/DeskSearch.tsx
git commit -m "feat(desk): walk-in panel (capture lead / sign up + plan)"
```

---

## Phase 3 — Take payment / sell (#102/#103)

### Task 11: `loadMemberContext` + `desk-money` actions

**Files:**
- Create: `src/app/dashboard/desk/_actions/load-member-context.ts`
- Create: `src/app/dashboard/desk/_actions/desk-money.ts`
- Test: `src/__tests__/desk-money.integration.test.ts`

`loadMemberContext(athleteId)` (staff-gated): returns `{ membership: { id, plan_name, monthly_price_aed, payment_status, provider_plan_ref } | null, todayBookings: {...}[] }` for the action drawers. `deskRecordCash(membershipId)`, `deskPaymentLink(membershipId)`, `deskSellPackage(packageId, athleteId)` mirror the existing owner actions but `requireStaffAction` + `logAudit`.

- [ ] **Step 1: Write the failing test (cash path + gate + audit)**

```ts
// src/__tests__/desk-money.integration.test.ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, auditMock } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn(), auditMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/lib/audit', () => ({ logAudit: auditMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deskRecordCash } from '@/app/dashboard/desk/_actions/desk-money'

beforeEach(() => vi.clearAllMocks())

test('receptionist can record cash; writes paid + audit', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist', full_name: 'Desk' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { memberships: { data: { id: 'mem1', box_id: 'b1', plan_name: 'Unlimited', monthly_price_aed: 300 }, error: null } } })
  serviceCreate.mockReturnValue(svc)

  const res = await deskRecordCash('mem1')
  expect(res.error).toBeNull()
  expect(svc.builder('memberships').update).toHaveBeenCalledWith(expect.objectContaining({ payment_status: 'paid' }))
  expect(auditMock).toHaveBeenCalledWith(svc, expect.objectContaining({ action: 'desk.cash_recorded', boxId: 'b1' }))
})

test('athlete cannot record cash', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await deskRecordCash('mem1')
  expect(res.error).toMatch(/staff/i)
  expect(auditMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run it → FAIL.** Run: `npx vitest run src/__tests__/desk-money.integration.test.ts`

- [ ] **Step 3: Create `desk-money.ts`**

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'

type Cash = { error: string | null }
type Link = { error: string | null; url: string | null }

export async function deskRecordCash(membershipId: string): Promise<Cash> {
  const auth = await requireStaffAction('Only staff can take payment.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth
  const service = createServiceClient()

  const { data: mem } = await service
    .from('memberships')
    .select('id, box_id, plan_name, monthly_price_aed')
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
    .single()
  if (!mem) return { error: 'Membership not found in your gym.' }

  const { error } = await service
    .from('memberships')
    .update({ payment_status: 'paid', last_paid_date: new Date().toISOString().slice(0, 10) })
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
  if (error) return { error: 'Could not record the payment.' }

  await logAudit(service, {
    boxId: profile.box_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: 'desk.cash_recorded',
    target: membershipId,
    details: { plan: mem.plan_name, amount_aed: mem.monthly_price_aed != null ? Number(mem.monthly_price_aed) : null },
  })

  revalidatePath('/dashboard/desk')
  revalidatePath('/dashboard/payments')
  return { error: null }
}

export async function deskPaymentLink(membershipId: string): Promise<Link> {
  const auth = await requireStaffAction('Only staff can take payment.')
  if ('error' in auth) return { error: auth.error, url: null }
  const { user, profile } = auth
  const service = createServiceClient()

  const { data: m } = await service
    .from('memberships')
    .select('id, provider_plan_ref, provider_customer_ref, athlete_id, plan_name')
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
    .single()
  if (!m) return { error: 'Membership not found in your gym.', url: null }
  if (!m.provider_plan_ref) return { error: 'No payment plan linked to this membership.', url: null }

  const { data: box } = await service.from('boxes').select('psp_credentials, stripe_secret_key').eq('id', profile.box_id).single()
  if (!(box?.psp_credentials || box?.stripe_secret_key)) return { error: 'Payment provider is not connected.', url: null }

  const { data: athlete } = await service.from('profiles').select('email, full_name').eq('id', m.athlete_id).single()

  try {
    const provider = await getProviderForBox(profile.box_id)
    let customerRef = m.provider_customer_ref
    if (!customerRef) {
      const created = await provider.createCustomer({ email: athlete?.email ?? null, name: athlete?.full_name ?? null, metadata: { membership_id: membershipId, box_id: profile.box_id } })
      customerRef = created.customerRef
      await service.from('memberships').update({ provider_customer_ref: customerRef }).eq('id', membershipId)
    }
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createCheckoutSession({
      planRef: m.provider_plan_ref,
      customerRef,
      customerEmail: athlete?.email ?? null,
      successUrl: `${baseUrl}/dashboard/desk?paid=1`,
      cancelUrl: `${baseUrl}/dashboard/desk`,
      membershipId,
    })
    await logAudit(service, { boxId: profile.box_id, actorId: user.id, actorName: profile.full_name, action: 'desk.payment_link', target: membershipId, details: { plan: m.plan_name } })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('deskPaymentLink failed:', e)
    return { error: 'Could not create the payment link. Check the gym\'s payment settings.', url: null }
  }
}

export async function deskSellPackage(packageId: string, athleteId: string): Promise<Link> {
  const auth = await requireStaffAction('Only staff can sell packages.')
  if ('error' in auth) return { error: auth.error, url: null }
  const { user, profile } = auth
  const service = createServiceClient()

  const { data: pkg } = await service.from('packages').select('id, name, price_aed, active').eq('id', packageId).eq('box_id', profile.box_id).single()
  if (!pkg || !pkg.active) return { error: 'Package not found or inactive.', url: null }
  const { data: athlete } = await service.from('profiles').select('id, email').eq('id', athleteId).eq('box_id', profile.box_id).single()
  if (!athlete) return { error: 'Member not found in your gym.', url: null }

  try {
    const provider = await getProviderForBox(profile.box_id)
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createPackageCheckout({
      packageId: pkg.id, athleteId: athlete.id, boxId: profile.box_id, packageName: pkg.name,
      priceAed: Number(pkg.price_aed), customerEmail: athlete.email ?? null,
      successUrl: `${baseUrl}/dashboard/desk?package=success`, cancelUrl: `${baseUrl}/dashboard/desk`,
    })
    await logAudit(service, { boxId: profile.box_id, actorId: user.id, actorName: profile.full_name, action: 'desk.package_sold', target: athleteId, details: { package: pkg.name } })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('deskSellPackage failed:', e)
    return { error: 'Could not create the payment link. Check the gym\'s payment settings.', url: null }
  }
}
```

- [ ] **Step 4: Create `load-member-context.ts`**

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'

export type MemberContext = {
  membership: { id: string; plan_name: string; monthly_price_aed: number | null; payment_status: string; provider_plan_ref: string | null } | null
  todayBookings: { bookingId: string; instanceId: string; className: string; startsAt: string; checkedIn: boolean }[]
}
type State = { error: string | null; ctx?: MemberContext }

export async function loadMemberContext(athleteId: string): Promise<State> {
  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth
  const service = createServiceClient()

  const { data: mem } = await service
    .from('memberships')
    .select('id, plan_name, monthly_price_aed, payment_status, provider_plan_ref, start_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)
    .order('start_date', { ascending: false })
    .limit(1)
  const membership = mem?.[0] ?? null

  const today = new Date().toISOString().slice(0, 10)
  const { data: bookings } = await service
    .from('bookings')
    .select('id, checked_in, class_instances!inner(id, starts_at, class_date, class_templates(name))')
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)
    .eq('class_instances.class_date', today)

  const todayBookings = (bookings ?? []).map((b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ci = (b as any).class_instances
    return {
      bookingId: b.id,
      instanceId: ci.id,
      className: ci.class_templates?.name ?? 'Class',
      startsAt: ci.starts_at,
      checkedIn: !!b.checked_in,
    }
  })

  return { error: null, ctx: { membership: membership as MemberContext['membership'], todayBookings } }
}
```

> Verify the exact `class_instances` columns/join names against the real schema (`class_date` vs a timestamp, `class_templates(name)` relationship) by reading `src/app/dashboard/whiteboard/page.tsx` — adjust the select to match. The booking↔instance↔template join is the one place to confirm against the live schema before relying on it.

- [ ] **Step 5: Run the money test → PASS.** Run: `npx vitest run src/__tests__/desk-money.integration.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/desk/_actions/desk-money.ts src/app/dashboard/desk/_actions/load-member-context.ts src/__tests__/desk-money.integration.test.ts
git commit -m "feat(desk): staff cash/payment-link/sell actions (audited) + member context loader"
```

---

### Task 12: `PaymentActions` component

**Files:**
- Create: `src/app/dashboard/desk/_components/PaymentActions.tsx`

`'use client'`, props `{ athleteId: string }`. On mount, call `loadMemberContext(athleteId)`. Render:
- If a membership exists: **Record cash** button → `deskRecordCash(membership.id)` (on success show "Marked paid"); **Payment link** button → `deskPaymentLink(membership.id)` → on success render the returned `url` as a copyable link **and a QR** (`import QRCode from 'qrcode'; const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 })` then `<img src={dataUrl} />`, exactly as `mfa-card.tsx` does).
- **Sell a pack:** a small `<select>` of active packages (fetch via a `loadActivePackages` staff action, or thread from the page like plans) → `deskSellPackage(packageId, athleteId)` → render link+QR.
- Show errors in `text-danger`; disable buttons while busy. Match `Card`/`Button` styling.

- [ ] **Step 1: Implement the component** (presentational; logic covered by Task 11).
- [ ] **Step 2: Build → PASS.** Run: `npm run build`
- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/desk/_components/PaymentActions.tsx
git commit -m "feat(desk): payment actions (cash / Stripe link+QR / sell pack)"
```

---

## Phase 4 — Desk check-in (#99)

### Task 13: `DeskCheckIn` component (reuses existing `checkIn`/`overrideCheckIn`)

**Files:**
- Create: `src/app/dashboard/desk/_components/DeskCheckIn.tsx`

No new action — `checkIn(instanceId, athleteId)` and `overrideCheckIn(instanceId, athleteId, reason)` are **already** `requireStaffAction`. The component loads bookings via `loadMemberContext(athleteId).ctx.todayBookings`.

`'use client'`, props `{ athleteId: string }`:
- On mount, `loadMemberContext(athleteId)` → render today's bookings (time · class · checked-in state).
- Each not-yet-checked-in booking → **Check in** button calling `checkIn(b.instanceId, athleteId)`.
  - If the result is `{ error: 'BLOCKED', blocked }` → show the reason + an **Override** affordance (a reason `<input>` → `overrideCheckIn(b.instanceId, athleteId, reason)`), mirroring the whiteboard's blocked-modal UX (see `src/app/dashboard/whiteboard/_components/*` for the existing pattern).
  - On success → `router.refresh()` or optimistic local state flip.
- No bookings today → "No classes booked today" + a link to `/dashboard/schedule`.

- [ ] **Step 1: Read the whiteboard's blocked/override UI** (`src/app/dashboard/whiteboard/_components/`) to mirror copy + flow.
- [ ] **Step 2: Implement `DeskCheckIn.tsx`** importing `checkIn`/`overrideCheckIn` from `@/app/dashboard/whiteboard/_actions/check-in` and `.../override-check-in`.
- [ ] **Step 3: Wire it into `ResultRow`'s member drawer** ("Check in" button mounts `<DeskCheckIn athleteId={hit.id} />`).
- [ ] **Step 4: Build → PASS.** Run: `npm run build`
- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/desk/_components/DeskCheckIn.tsx src/app/dashboard/desk/_components/ResultRow.tsx
git commit -m "feat(desk): desk check-in mode (reuses staff check-in + override)"
```

---

### Task 14: Full-suite gate + manual smoke

**Files:** none (verification).

- [ ] **Step 1: Run the whole gate**

Run: `npm run lint && npm run type-check && npm run test`
Expected: all green (new tests included).

- [ ] **Step 2: Coverage (if thresholds apply to these files)**

Run: `npm run test:coverage`
Expected: thresholds pass. The pure libs (`_lib/search.ts`, `_lib/validation.ts`, `lib/members.ts`, `lib/memberships.ts`) carry the logic coverage.

- [ ] **Step 3: Manual smoke (dev project, logged in as a receptionist or owner)**
  - Search a known member by name and phone → appears with a status chip.
  - "New walk-in" → Save as lead → appears in `/dashboard/members?tab=leads`.
  - "New walk-in" → Sign up now with a free trial plan → member created, access granted; with a paid plan → member created `unpaid`.
  - On a member: Record cash → status flips to paid; check `/dashboard/audit` shows a `Cash recorded` row.
  - Payment link/sell pack → a Stripe URL + scannable QR render (or a clear "payment not configured" message if no PSP).
  - Check in a member booked into a class today; try a blocked (unpaid) member → override-with-reason works.

- [ ] **Step 4: Final commit (if any lint/type fixups)**

```bash
git add -A
git commit -m "chore(desk): front-desk toolkit gate green"
```

---

## Self-Review (run before handing off)

**Spec coverage:** #100 search → Tasks 4–6; #101 walk-in → Tasks 8–10; #102/#103 payment/sell → Tasks 11–12; #99 check-in → Task 13; all-staff permissions → `requireStaffAction` throughout; money audit → Task 1 + 11; shared-core extraction → Tasks 2–3; no migration → confirmed (only data + audit strings). ✅

**Open verification flags for the implementer (not placeholders — real "confirm against live code" notes):**
1. The `class_instances`/`class_templates` join shape in `loadMemberContext` (Task 11) — confirm column/relationship names against `src/app/dashboard/whiteboard/page.tsx` before relying on it.
2. The sidebar `active`-key derivation file (Task 7, Step 3) — locate the exact file that maps pathname → active key.
3. `getMembershipStatus` row-type strictness (Task 5) — cast if TS complains, matching `assessCheckInEntitlement`.
4. The whiteboard blocked/override component path (Task 13) — mirror the existing UX.

**Type consistency:** `createMemberCore` / `assignMembershipCore` / `convertLeadCore` all return `{ ...Id, error }` and take `(service, input)`; `PersonHit` is the single shared search type used by the action and components; desk money actions all `requireStaffAction` + `logAudit`. ✅
