# Membership Lifecycle (Freezes + Scheduled Cancellation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Owners can freeze/pause a membership (optional auto-resume) and schedule an end-of-period cancellation. A freeze fully pauses the billing relationship; pre-paid credits stay usable.

**Architecture:** Two date columns on `memberships` + one pure predicate `isFrozenOn` consumed by the entitlement function, the KPI rollups, and the billing-reminder SQL function. Scheduled cancellation reuses `end_date`. Owner actions + member-page UI.

**Tech Stack:** Next.js 16 server actions, Supabase RLS, TypeScript strict, Vitest, Zod. Reference spec: `docs/superpowers/specs/2026-06-09-membership-lifecycle-design.md`.

**Conventions reused (read once):**
- Entitlement core: `src/lib/membership-status.ts` (`getMembershipStatus`). Owner-action pattern: `payments/_actions/save-membership.ts`. Validation: `payments/_lib/validation.ts`.
- check-in/book select `memberships` for status; KPI `kpi/_lib/metrics.ts` has its own `MembershipRow`. Billing eligibility is the SQL fn `cron_eligible_memberships` (migration 010).
- Tests flat in `src/__tests__/`; dual-client mock `helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `migrations/033_membership_freeze.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `src/lib/membership-status.ts` + `src/__tests__/membership-status.test.ts` | modify |
| `src/app/dashboard/kpi/_lib/metrics.ts` + `src/__tests__/kpi-metrics.test.ts` + `kpi/page.tsx` | modify |
| `whiteboard/_actions/check-in.ts`, `schedule/_actions/book-class.ts` | modify (selects) |
| `whiteboard/_components/checkin-button.tsx`, `override-modal.tsx` | modify (`'frozen'`) |
| `src/__tests__/check-in.integration.test.ts` | modify (frozen case) |
| `payments/_actions/freeze-membership.ts`, `schedule-cancellation.ts`, `payments/_lib/lifecycle-validation.ts` | create |
| `src/__tests__/membership-lifecycle.integration.test.ts` | create |
| `members/[memberId]/_components/membership-lifecycle.tsx` + `members/[memberId]/page.tsx` | create / modify |
| `payments/page.tsx` | modify (badges + rollup) |

---

## Task 1: Migration 033

**Files:** Create `migrations/033_membership_freeze.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Write the migration** (columns + the billing fn replaced to skip frozen)

Create `migrations/033_membership_freeze.sql`:

```sql
-- migrations/033_membership_freeze.sql
-- Membership lifecycle (#28/#29): freeze window columns + exclude frozen from billing reminders.
-- Scheduled cancellation reuses the existing end_date. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS frozen_from  date;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS frozen_until date;

-- Billing reminders must skip a membership frozen on the run date. Window is
-- [frozen_from, frozen_until); frozen_until NULL = indefinite freeze.
CREATE OR REPLACE FUNCTION cron_eligible_memberships(p_today DATE)
RETURNS TABLE (
  id UUID, box_id UUID, start_date DATE, last_paid_date DATE, end_date DATE,
  monthly_price_aed NUMERIC, athlete_full_name TEXT, athlete_email TEXT,
  gym_name TEXT, reminders_enabled BOOLEAN, owner_email TEXT
) LANGUAGE sql SECURITY DEFINER AS $func$
  SELECT
    m.id, m.box_id, m.start_date, m.last_paid_date, m.end_date, m.monthly_price_aed,
    a.full_name, a.email,
    b.name, b.reminders_enabled,
    (SELECT o.email FROM profiles o WHERE o.box_id = m.box_id AND o.role = 'owner' LIMIT 1)
  FROM memberships m
  JOIN profiles a ON a.id = m.athlete_id
  JOIN boxes    b ON b.id = m.box_id
  WHERE b.reminders_enabled = true
    AND (m.end_date IS NULL OR m.end_date >= p_today)
    AND NOT (m.frozen_from IS NOT NULL AND m.frozen_from <= p_today
             AND (m.frozen_until IS NULL OR p_today < m.frozen_until))
$func$;
```

- [ ] **Step 2: ROLLBACKS entry**

In `migrations/ROLLBACKS.md`: change header range `008`–`032` → `008`–`033`. Add above `### 032_member_achievements`:

```markdown
### 033_membership_freeze
```sql
ALTER TABLE memberships DROP COLUMN IF EXISTS frozen_from;
ALTER TABLE memberships DROP COLUMN IF EXISTS frozen_until;
-- (Re-run migration 010's original cron_eligible_memberships body to drop the frozen filter.)
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/033_membership_freeze.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(membership): migration 033 — freeze columns + billing-reminder frozen skip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Entitlement core — `isFrozenOn` + `'frozen'`

**Files:** Modify `src/lib/membership-status.ts`, `src/__tests__/membership-status.test.ts`.

- [ ] **Step 1: Add failing tests**

In `src/__tests__/membership-status.test.ts`, change the import and append two describe blocks:

```ts
import { getMembershipStatus, isFrozenOn } from '@/lib/membership-status'
```

```ts
describe('isFrozenOn', () => {
  const m = { frozen_from: '2026-06-01', frozen_until: '2026-07-01' }
  test('before window → false', () => expect(isFrozenOn(m, '2026-05-31')).toBe(false))
  test('inside window → true', () => expect(isFrozenOn(m, '2026-06-15')).toBe(true))
  test('on frozen_until → false (auto-resumed)', () => expect(isFrozenOn(m, '2026-07-01')).toBe(false))
  test('indefinite freeze → true for any date >= from', () =>
    expect(isFrozenOn({ frozen_from: '2026-06-01', frozen_until: null }, '2027-01-01')).toBe(true))
  test('no frozen_from → false', () => expect(isFrozenOn({}, '2026-06-15')).toBe(false))
})

describe('getMembershipStatus with freezes', () => {
  const today = '2026-06-15'
  test('all active memberships frozen → frozen', () => {
    const rows = [{ payment_status: 'paid' as const, end_date: null, frozen_from: '2026-06-01', frozen_until: '2026-07-01' }]
    expect(getMembershipStatus(rows, today)).toBe('frozen')
  })
  test('a live paid membership alongside a frozen one → paid', () => {
    const rows = [
      { payment_status: 'paid' as const, end_date: null, frozen_from: '2026-06-01', frozen_until: '2026-07-01' },
      { payment_status: 'paid' as const, end_date: null },
    ]
    expect(getMembershipStatus(rows, today)).toBe('paid')
  })
  test('live unpaid alongside frozen → unpaid', () => {
    const rows = [
      { payment_status: 'paid' as const, end_date: null, frozen_from: '2026-06-01', frozen_until: '2026-07-01' },
      { payment_status: 'unpaid' as const, end_date: null },
    ]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })
})
```

- [ ] **Step 2: Run → fail** (`isFrozenOn` not exported)

Run: `npm test -- membership-status` → FAIL.

- [ ] **Step 3: Implement** — replace the contents of `src/lib/membership-status.ts`:

```ts
export type MembershipStatus = 'paid' | 'unpaid' | 'no_membership' | 'frozen'

export type MembershipRow = {
  payment_status: 'paid' | 'unpaid'
  end_date: string | null
  frozen_from?: string | null
  frozen_until?: string | null
}

// Freeze window is [frozen_from, frozen_until): auto-resumes ON frozen_until.
// frozen_until null (with a frozen_from) = indefinite freeze until manually resumed.
export function isFrozenOn(
  m: { frozen_from?: string | null; frozen_until?: string | null },
  date: string,
): boolean {
  return !!m.frozen_from && m.frozen_from <= date && (m.frozen_until == null || date < m.frozen_until)
}

export function getMembershipStatus(
  memberships: MembershipRow[],
  today: string,
): MembershipStatus {
  const active = memberships.filter((m) => m.end_date === null || m.end_date >= today)
  if (active.length === 0) return 'no_membership'
  const live = active.filter((m) => !isFrozenOn(m, today))
  if (live.length === 0) return 'frozen'
  if (live.some((m) => m.payment_status !== 'paid')) return 'unpaid'
  return 'paid'
}
```

- [ ] **Step 4: Run → pass** (`npm test -- membership-status`, incl. all existing cases). Type-check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/membership-status.ts src/__tests__/membership-status.test.ts
git commit -m "$(cat <<'EOF'
feat(membership): isFrozenOn predicate + frozen status in entitlement core

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: KPI exclusion of frozen

**Files:** Modify `src/app/dashboard/kpi/_lib/metrics.ts`, `src/__tests__/kpi-metrics.test.ts`, `src/app/dashboard/kpi/page.tsx`.

- [ ] **Step 1: Add the failing test** — append to `kpi-metrics.test.ts`:

```ts
import { mrrAt, activeAt } from '@/app/dashboard/kpi/_lib/metrics'

describe('frozen membership exclusion', () => {
  const rows = [{ athlete_id: 'f', monthly_price_aed: 300, start_date: '2025-01-01', end_date: null, frozen_from: '2026-03-01', frozen_until: '2026-05-01' }]
  test('excluded from MRR/active inside the freeze window', () => {
    expect(mrrAt(rows, '2026-04-01')).toBe(0)
    expect(activeAt(rows, '2026-04-01')).toBe(0)
  })
  test('included again after auto-resume', () => {
    expect(mrrAt(rows, '2026-06-01')).toBe(300)
    expect(activeAt(rows, '2026-06-01')).toBe(1)
  })
})
```
(If `mrrAt`/`activeAt` are already imported at the top of the file, don't re-import — reuse the existing import.)

- [ ] **Step 2: Run → fail** (frozen still counted).

- [ ] **Step 3: Implement** — in `metrics.ts`, add the import, extend the type, and gate `activeOn`:

```ts
import { isFrozenOn } from '@/lib/membership-status'
```
```ts
export type MembershipRow = { athlete_id: string; monthly_price_aed: number | null; start_date: string; end_date: string | null; frozen_from?: string | null; frozen_until?: string | null }
```
```ts
function activeOn(r: MembershipRow, onDate: string): boolean {
  return r.start_date <= onDate && (r.end_date === null || r.end_date > onDate) && !isFrozenOn(r, onDate)
}
```

- [ ] **Step 4: Add freeze cols to the KPI page query** — in `kpi/page.tsx`:

```ts
    supabase.from('memberships').select('athlete_id, monthly_price_aed, start_date, end_date, frozen_from, frozen_until').eq('box_id', profile.box_id),
```

- [ ] **Step 5: Run → pass** (`npm test -- kpi-metrics`). Type-check.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/kpi/_lib/metrics.ts src/__tests__/kpi-metrics.test.ts src/app/dashboard/kpi/page.tsx
git commit -m "$(cat <<'EOF'
feat(membership): exclude frozen members from KPI MRR + active count

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Entitlement ripple — selects + check-in UI

**Files:** Modify `check-in.ts`, `book-class.ts`, `checkin-button.tsx`, `override-modal.tsx`, `check-in.integration.test.ts`.

- [ ] **Step 1: Add freeze cols to the membership selects**

`whiteboard/_actions/check-in.ts` — change the memberships select:
```ts
    .select('payment_status, end_date, last_paid_date, frozen_from, frozen_until')
```
`schedule/_actions/book-class.ts` — change the memberships select:
```ts
    .select('payment_status, end_date, frozen_from, frozen_until')
```

- [ ] **Step 2: Widen `'frozen'` through the check-in UI**

`whiteboard/_components/checkin-button.tsx` — widen the block-reason state and the dot title:
```ts
  const [blockReason, setBlockReason] = useState<'unpaid' | 'no_membership' | 'frozen'>('unpaid')
```
```ts
  const dotTitle = membershipStatus === 'unpaid'
    ? `Payment overdue${lastPaidDate ? ` — last paid ${new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`
    : membershipStatus === 'frozen' ? 'Membership frozen'
    : 'No active membership'
```
`whiteboard/_components/override-modal.tsx` — widen the prop and the title:
```ts
  blockReason: 'unpaid' | 'no_membership' | 'frozen'
```
```ts
  const title = blockReason === 'unpaid' ? 'Payment overdue' : blockReason === 'frozen' ? 'Membership frozen' : 'No active membership'
```

- [ ] **Step 3: Add a frozen check-in integration test** — append to `check-in.integration.test.ts`:

```ts
test('blocks a frozen athlete with no credit-backed booking', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      memberships: { data: [{ payment_status: 'paid', end_date: null, last_paid_date: null, frozen_from: '2026-01-01', frozen_until: null }], error: null },
    },
  }))
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: { credit_id: null }, error: null } } }))

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBe('BLOCKED')
  expect(res.blocked?.reason).toBe('frozen')
})
```

- [ ] **Step 4: Verify** — `npm test -- check-in` → PASS. `npm run type-check` → 0. `npm run lint` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/whiteboard/_actions/check-in.ts src/app/dashboard/schedule/_actions/book-class.ts src/app/dashboard/whiteboard/_components/checkin-button.tsx src/app/dashboard/whiteboard/_components/override-modal.tsx src/__tests__/check-in.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(membership): frozen blocks check-in/booking (credits still bypass)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Owner actions + validation + tests

**Files:** Create `payments/_lib/lifecycle-validation.ts`, `payments/_actions/freeze-membership.ts`, `payments/_actions/schedule-cancellation.ts`, `src/__tests__/membership-lifecycle.integration.test.ts`.

- [ ] **Step 1: Validation** — create `payments/_lib/lifecycle-validation.ts`:

```ts
import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export function validateFreeze(frozenFrom: string, frozenUntil: string | null): string | null {
  if (!dateStr.safeParse(frozenFrom).success) return 'Invalid freeze start date.'
  if (frozenUntil !== null) {
    if (!dateStr.safeParse(frozenUntil).success) return 'Invalid resume date.'
    if (frozenUntil <= frozenFrom) return 'Resume date must be after the freeze start.'
  }
  return null
}

export function validateEndDate(endDate: string, today: string): string | null {
  if (!dateStr.safeParse(endDate).success) return 'Invalid end date.'
  if (endDate < today) return 'Cancellation date must be today or later.'
  return null
}
```

- [ ] **Step 2: Freeze/resume actions** — create `payments/_actions/freeze-membership.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateFreeze } from '../_lib/lifecycle-validation'

async function ownerBox(): Promise<{ boxId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage memberships.' }
  return { boxId: profile.box_id }
}

export async function freezeMembership(
  membershipId: string,
  frozenFrom: string,
  frozenUntil: string | null,
): Promise<{ error: string | null }> {
  const vErr = validateFreeze(frozenFrom, frozenUntil)
  if (vErr) return { error: vErr }
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('memberships')
    .update({ frozen_from: frozenFrom, frozen_until: frozenUntil })
    .eq('id', membershipId)
    .eq('box_id', ctx.boxId)
  if (error) return { error: 'Could not freeze the membership.' }
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}

export async function resumeMembership(membershipId: string): Promise<{ error: string | null }> {
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('memberships')
    .update({ frozen_from: null, frozen_until: null })
    .eq('id', membershipId)
    .eq('box_id', ctx.boxId)
  if (error) return { error: 'Could not resume the membership.' }
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
```

- [ ] **Step 3: Schedule/undo actions** — create `payments/_actions/schedule-cancellation.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateEndDate } from '../_lib/lifecycle-validation'

async function ownerBox(): Promise<{ boxId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage memberships.' }
  return { boxId: profile.box_id }
}

export async function scheduleCancellation(membershipId: string, endDate: string): Promise<{ error: string | null }> {
  const today = new Date().toISOString().slice(0, 10)
  const vErr = validateEndDate(endDate, today)
  if (vErr) return { error: vErr }
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { error } = await supabase.from('memberships').update({ end_date: endDate }).eq('id', membershipId).eq('box_id', ctx.boxId)
  if (error) return { error: 'Could not schedule the cancellation.' }
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}

export async function undoScheduledCancellation(membershipId: string): Promise<{ error: string | null }> {
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { error } = await supabase.from('memberships').update({ end_date: null }).eq('id', membershipId).eq('box_id', ctx.boxId)
  if (error) return { error: 'Could not undo the cancellation.' }
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
```

- [ ] **Step 4: Integration tests** — create `src/__tests__/membership-lifecycle.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { freezeMembership, resumeMembership } from '@/app/dashboard/payments/_actions/freeze-membership'
import { scheduleCancellation, undoScheduledCancellation } from '@/app/dashboard/payments/_actions/schedule-cancellation'

beforeEach(() => vi.clearAllMocks())

function owner() {
  return makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, memberships: { data: null, error: null } },
  })
}
function coach() {
  return makeSupabaseMock({
    user: { id: 'c1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
  })
}

test('freezeMembership writes both columns, scoped by id + box', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await freezeMembership('m1', '2026-07-01', '2026-08-01')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').update).toHaveBeenCalledWith({ frozen_from: '2026-07-01', frozen_until: '2026-08-01' })
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('id', 'm1')
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('freezeMembership rejects an until <= from', async () => {
  serverCreate.mockResolvedValue(owner())
  const res = await freezeMembership('m1', '2026-08-01', '2026-08-01')
  expect(res.error).toMatch(/after the freeze start/i)
})

test('resumeMembership clears both columns', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await resumeMembership('m1')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').update).toHaveBeenCalledWith({ frozen_from: null, frozen_until: null })
})

test('scheduleCancellation sets a future end_date', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await scheduleCancellation('m1', '2030-01-01')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').update).toHaveBeenCalledWith({ end_date: '2030-01-01' })
})

test('scheduleCancellation rejects a past date', async () => {
  serverCreate.mockResolvedValue(owner())
  const res = await scheduleCancellation('m1', '2000-01-01')
  expect(res.error).toMatch(/today or later/i)
})

test('undoScheduledCancellation clears end_date', async () => {
  const rls = owner(); serverCreate.mockResolvedValue(rls)
  const res = await undoScheduledCancellation('m1')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').update).toHaveBeenCalledWith({ end_date: null })
})

test('a non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(coach())
  expect((await freezeMembership('m1', '2026-07-01', null)).error).toMatch(/owners/i)
  expect((await scheduleCancellation('m1', '2030-01-01')).error).toMatch(/owners/i)
})
```

- [ ] **Step 5: Verify** — `npm test -- membership-lifecycle` → PASS. Type-check + lint.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/payments/_lib/lifecycle-validation.ts src/app/dashboard/payments/_actions/freeze-membership.ts src/app/dashboard/payments/_actions/schedule-cancellation.ts src/__tests__/membership-lifecycle.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(membership): owner freeze/resume + schedule/undo cancellation actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: UI — member-page controls + payments badges

**Files:** Create `members/[memberId]/_components/membership-lifecycle.tsx`; Modify `members/[memberId]/page.tsx`, `payments/page.tsx`. No new tests (UI; verified by type-check + lint + build).

- [ ] **Step 1: Lifecycle controls component**

Create `src/app/dashboard/members/[memberId]/_components/membership-lifecycle.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { freezeMembership, resumeMembership } from '@/app/dashboard/payments/_actions/freeze-membership'
import { scheduleCancellation, undoScheduledCancellation } from '@/app/dashboard/payments/_actions/schedule-cancellation'

const box: React.CSSProperties = { height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit' }
const btn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--c-ink-2)' }

export function MembershipLifecycle({
  membershipId, frozenFrom, frozenUntil, endDate, today,
}: {
  membershipId: string
  frozenFrom: string | null
  frozenUntil: string | null
  endDate: string | null
  today: string
}) {
  const [from, setFrom] = useState(today)
  const [until, setUntil] = useState('')
  const [cancelOn, setCancelOn] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error) })

  const isFrozen = !!frozenFrom && frozenFrom <= today && (frozenUntil == null || today < frozenUntil)
  const cancelScheduled = !!endDate && endDate >= today

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Freeze */}
      {isFrozen ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-warn-ink)' }}>
            ❄️ Frozen{frozenUntil ? ` until ${frozenUntil}` : ''}
          </span>
          <button style={ghost} disabled={pending} onClick={() => run(() => resumeMembership(membershipId))}>Resume now</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Freeze from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={box} /></label>
          <label style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>until <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} style={box} /></label>
          <button style={btn} disabled={pending} onClick={() => run(() => freezeMembership(membershipId, from, until || null))}>Freeze</button>
        </div>
      )}

      {/* Scheduled cancellation */}
      {cancelScheduled ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-danger)' }}>Cancels on {endDate}</span>
          <button style={ghost} disabled={pending} onClick={() => run(() => undoScheduledCancellation(membershipId))}>Undo</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Cancel at end of period <input type="date" value={cancelOn} onChange={(e) => setCancelOn(e.target.value)} style={box} /></label>
          <button style={ghost} disabled={pending || !cancelOn} onClick={() => run(() => scheduleCancellation(membershipId, cancelOn))}>Schedule</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into the member page**

In `members/[memberId]/page.tsx`:
(a) add the import:
```ts
import { MembershipLifecycle } from './_components/membership-lifecycle'
```
(b) add `frozen_from, frozen_until` to the memberships select (the `.select('id, plan_name, monthly_price_aed, payment_status, start_date, last_paid_date, end_date')` line):
```ts
      .select('id, plan_name, monthly_price_aed, payment_status, start_date, last_paid_date, end_date, frozen_from, frozen_until')
```
(c) The page already declares `const today = new Date().toISOString().slice(0, 10)` (added for the consistency card) — reuse it; do NOT add a second one.
(d) render the controls (owner-only) right before the `{/* Consistency (Committed Club) */}` comment:
```tsx
            {viewer.role === 'owner' && activeMembership && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Membership lifecycle</div>
                <MembershipLifecycle membershipId={activeMembership.id} frozenFrom={activeMembership.frozen_from ?? null} frozenUntil={activeMembership.frozen_until ?? null} endDate={activeMembership.end_date ?? null} today={today} />
              </div>
            )}
```

- [ ] **Step 3: Payments page — badges + exclude frozen from rollup**

In `payments/page.tsx`:
(a) import the predicate:
```ts
import { isFrozenOn } from '@/lib/membership-status'
```
(b) add `frozen_from, frozen_until` to the memberships select (the `.from('memberships').select(...)` in the Promise.all).
(c) derive today and exclude frozen from the active rollup — change:
```ts
  const active = memberships?.filter((m) => !m.end_date) ?? []
```
to:
```ts
  const todayIso = new Date().toISOString().slice(0, 10)
  const active = memberships?.filter((m) => !m.end_date && !isFrozenOn(m, todayIso)) ?? []
```
(d) in the membership-row map (`memberships?.map((m) => {`), render a small badge when frozen or cancel-scheduled — add inside the row, near the status display:
```tsx
                      {isFrozenOn(m, todayIso) && <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--c-warn-ink)' }}>❄️ Frozen</span>}
                      {m.end_date && m.end_date >= todayIso && <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--c-danger)' }}>Cancels {m.end_date}</span>}
```
(Place these where the row already shows the plan/status; match the existing row layout — wrap in the row's flex container.)

- [ ] **Step 4: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/members/[memberId]` + `/dashboard/payments` build. `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/membership-lifecycle.tsx" "src/app/dashboard/members/[memberId]/page.tsx" src/app/dashboard/payments/page.tsx
git commit -m "$(cat <<'EOF'
feat(membership): member-page freeze/cancel controls + payments badges

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. membership-status, kpi-metrics, check-in, membership-lifecycle)
- [ ] `npm run build` → succeeds
- [ ] Final review (freeze auto-resume by date; credits still bypass; owner gate; box-scoped updates), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/033_membership_freeze.sql` in Supabase (6th pending, alongside 028–032). It also replaces `cron_eligible_memberships` to skip frozen members.
- **Auto-resume needs no cron:** "frozen" is purely `isFrozenOn(today)`; on `frozen_until` the member is simply live again.
- **Credits stay usable while frozen** — the existing `credit_id` bypass in check-in/book is unchanged.
