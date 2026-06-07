# Packages PR-3 — Entitlement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce credit entitlement — a member with no paid membership can book a class only if they have a class credit (consumed at booking, refunded on cancel), credit-backed bookings pass check-in, and an owner can manually redeem a PT-session credit.

**Architecture:** Pure precedence logic lives in `src/lib/credits.ts` (best-batch selection + entitlement decision), mirroring `membership-status.ts`. Atomic credit mutation runs through two SQL functions (migration `023`) — `consume_credit` (guarded `-1 … RETURNING`, NULL if empty) and `refund_credit` (`+1`) — because PostgREST cannot express `col = col - 1`, and both booking and cancel need it. `book-class` / `cancel-booking` / `check-in` / a new owner `redeem-session` action call these via the **service role** (`package_credits` has no client-write policy — see migration 020). UI changes are minimal: a "pack" badge on the whiteboard for credit-backed bookings, and a buy-a-pack link when booking is refused.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (RLS + service role), Postgres functions, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-packages-design.md` → "Entitlement enforcement" + "PR-3" in Sequencing.

**Scope guard:** Behavior-changing. The hard-gate at booking is NEW — `book-class` today only checks capacity. Only affects members with **no paid membership AND no credits** (already blocked at check-in today; the gate just moves the rejection earlier). Does NOT touch the catalog (PR-1), the purchase/grant/webhook path (PR-2), or membership billing.

**Deviation from spec (intentional, see Architecture):** adds migration `023_credit_functions.sql`. The spec listed only migrations 020+021 for the data model; the atomic ±1 operations require server-side functions. Rollback is a clean `DROP FUNCTION` (Task 2).

---

### Task 1: Pure entitlement logic — `src/lib/credits.ts`

**Files:**
- Create: `src/lib/credits.ts`
- Test: `src/__tests__/credits.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/credits.test.ts`:
```ts
import { selectBestBatch, decideEntitlement, type CreditBatch } from '@/lib/credits'

const today = '2026-06-06'

describe('selectBestBatch', () => {
  test('returns null when there are no batches', () => {
    expect(selectBestBatch([], today)).toBeNull()
  })

  test('skips batches with zero remaining', () => {
    const batches: CreditBatch[] = [{ id: 'a', credits_remaining: 0, expires_at: null }]
    expect(selectBestBatch(batches, today)).toBeNull()
  })

  test('skips expired batches (expires_at before today)', () => {
    const batches: CreditBatch[] = [{ id: 'a', credits_remaining: 5, expires_at: '2026-06-05' }]
    expect(selectBestBatch(batches, today)).toBeNull()
  })

  test('keeps a batch expiring exactly today', () => {
    const batches: CreditBatch[] = [{ id: 'a', credits_remaining: 5, expires_at: today }]
    expect(selectBestBatch(batches, today)?.id).toBe('a')
  })

  test('picks the soonest-expiring usable batch', () => {
    const batches: CreditBatch[] = [
      { id: 'later', credits_remaining: 5, expires_at: '2026-12-31' },
      { id: 'sooner', credits_remaining: 5, expires_at: '2026-07-01' },
    ]
    expect(selectBestBatch(batches, today)?.id).toBe('sooner')
  })

  test('prefers a dated batch over a never-expiring one (use perishable credits first)', () => {
    const batches: CreditBatch[] = [
      { id: 'forever', credits_remaining: 5, expires_at: null },
      { id: 'dated', credits_remaining: 5, expires_at: '2026-08-01' },
    ]
    expect(selectBestBatch(batches, today)?.id).toBe('dated')
  })

  test('falls back to a never-expiring batch when no dated one is usable', () => {
    const batches: CreditBatch[] = [
      { id: 'forever', credits_remaining: 5, expires_at: null },
      { id: 'expired', credits_remaining: 5, expires_at: '2020-01-01' },
    ]
    expect(selectBestBatch(batches, today)?.id).toBe('forever')
  })
})

describe('decideEntitlement', () => {
  const batch: CreditBatch = { id: 'a', credits_remaining: 5, expires_at: null }

  test('paid membership wins even when a credit exists', () => {
    expect(decideEntitlement(true, batch)).toEqual({ kind: 'membership' })
  })

  test('no membership + a usable credit → consume the credit', () => {
    expect(decideEntitlement(false, batch)).toEqual({ kind: 'credit', batch })
  })

  test('no membership + no credit → none', () => {
    expect(decideEntitlement(false, null)).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/credits.test.ts`
Expected: FAIL (Cannot find module `@/lib/credits`).

- [ ] **Step 3: Implement the logic**

Create `src/lib/credits.ts`:
```ts
// Pure credit-entitlement logic. No I/O — mirrors membership-status.ts.
// Atomic mutation of credits_remaining happens in the consume_credit /
// refund_credit SQL functions (migration 023), called via the service role.

export type CreditBatch = {
  id: string
  credits_remaining: number
  /** 'YYYY-MM-DD', or null = never expires. */
  expires_at: string | null
}

export type EntitlementDecision =
  | { kind: 'membership' }
  | { kind: 'credit'; batch: CreditBatch }
  | { kind: 'none' }

/**
 * The batch to draw a class credit from: soonest-expiring, non-expired
 * (expires_at >= today, or null), with credits left. Dated batches are used
 * before never-expiring ones so perishable credits aren't wasted. null = none.
 */
export function selectBestBatch(batches: CreditBatch[], today: string): CreditBatch | null {
  const usable = batches.filter(
    (b) => b.credits_remaining > 0 && (b.expires_at === null || b.expires_at >= today),
  )
  if (usable.length === 0) return null
  return usable.slice().sort((a, b) => {
    if (a.expires_at === b.expires_at) return 0
    if (a.expires_at === null) return 1 // never-expiring sorts last
    if (b.expires_at === null) return -1
    return a.expires_at < b.expires_at ? -1 : 1
  })[0]
}

/** Booking precedence: paid membership → credit → refuse. */
export function decideEntitlement(
  membershipPaid: boolean,
  bestBatch: CreditBatch | null,
): EntitlementDecision {
  if (membershipPaid) return { kind: 'membership' }
  if (bestBatch) return { kind: 'credit', batch: bestBatch }
  return { kind: 'none' }
}
```

- [ ] **Step 4: Run it — verify PASS (10 tests)**

Run: `npx vitest run src/__tests__/credits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/credits.ts src/__tests__/credits.test.ts
git commit -m "feat(packages): pure credit entitlement logic (selectBestBatch, decideEntitlement)"
```

---

### Task 2: Migration 023 — atomic credit functions + test-mock support

**Files:**
- Create: `migrations/023_credit_functions.sql`
- Modify: `migrations/ROLLBACKS.md`
- Modify: `src/__tests__/helpers/supabase-mock.ts`

- [ ] **Step 1: Write the migration**

Create `migrations/023_credit_functions.sql`:
```sql
-- migrations/023_credit_functions.sql
-- Atomic credit consume/refund for the entitlement PR (PR-3). PostgREST can't
-- express `col = col - 1`, so these do the guarded update server-side in one
-- statement. Called ONLY via the service role in book-class / cancel-booking /
-- redeem-session (package_credits has no client write policy — see 020).
-- Run in Supabase SQL Editor. Idempotent. Requires 020.

-- Decrement one credit from a batch IFF it still has one. Returns the new
-- remaining count, or NULL if the batch was already empty (no credit / lost race).
CREATE OR REPLACE FUNCTION consume_credit(p_credit_id UUID)
RETURNS INTEGER
LANGUAGE sql
AS $$
  UPDATE package_credits
     SET credits_remaining = credits_remaining - 1
   WHERE id = p_credit_id
     AND credits_remaining > 0
  RETURNING credits_remaining;
$$;

-- Give one credit back to a batch (cancel, or roll back a failed booking insert).
CREATE OR REPLACE FUNCTION refund_credit(p_credit_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE package_credits
     SET credits_remaining = credits_remaining + 1
   WHERE id = p_credit_id;
$$;

-- Defense in depth: only the service role may execute these. (RLS on
-- package_credits already blocks client writes, but make intent explicit.)
REVOKE EXECUTE ON FUNCTION consume_credit(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION refund_credit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_credit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION refund_credit(UUID) TO service_role;
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, add a new entry directly under the `# Migration rollbacks` intro block, immediately **above** the `### 019_rls_hardening` entry (highest number first):
```markdown
### 023_credit_functions
```sql
DROP FUNCTION IF EXISTS consume_credit(UUID);
DROP FUNCTION IF EXISTS refund_credit(UUID);
```
```
(Note for the human running this: migrations 020–022 are not yet in this file — out of scope for PR-3; add separately if needed.)

- [ ] **Step 3: Add `rpc` to the Supabase test mock**

In `src/__tests__/helpers/supabase-mock.ts`, extend the options type and the returned client.

Change the function signature's options to add `rpc`:
```ts
export function makeSupabaseMock(opts: {
  user?: { id: string } | null
  results?: Record<string, MockResult>
  rpc?: MockResult
}) {
```

In the returned object, add an `rpc` method alongside `from` (a single configurable result is enough — each test exercises one credit path):
```ts
  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: opts.user ?? null }, error: null })),
      admin: { deleteUser: vi.fn(() => Promise.resolve({ error: null })) },
    },
    from: vi.fn((table: string) => (builders[table] ??= makeBuilder(table))),
    rpc: vi.fn((_fn: string, _args?: unknown) => Promise.resolve(opts.rpc ?? { data: null, error: null })),
    builder: (table: string) => builders[table],
  }
```

- [ ] **Step 4: Type-check + run full suite (mock change must not break existing tests)**

Run: `npm run type-check && npm run test`
Expected: 0 type errors; all existing tests still pass (the new `rpc` field is optional).

- [ ] **Step 5: Commit**

```bash
git add migrations/023_credit_functions.sql migrations/ROLLBACKS.md src/__tests__/helpers/supabase-mock.ts
git commit -m "feat(packages): atomic consume_credit/refund_credit fns (023) + rpc test mock"
```

---

### Task 3: Booking hard-gate + credit consume — `book-class.ts`

**Files:**
- Modify: `src/app/dashboard/schedule/_actions/book-class.ts`
- Test: `src/__tests__/book-class.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/__tests__/book-class.integration.test.ts`:
```ts
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { bookClass } from '@/app/dashboard/schedule/_actions/book-class'

beforeEach(() => vi.clearAllMocks())

// RLS client: athlete u1 in box b1, booking a class with capacity 10.
function rlsClient(opts: { bookingInsertError?: { code?: string; message: string } } = {}) {
  return makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      class_instances: { data: { capacity: 10, box_id: 'b1' }, error: null },
      profiles: { data: { box_id: 'b1' }, error: null },
      bookings: { data: null, error: opts.bookingInsertError ?? null },
    },
  })
}

test('refuses when no paid membership and no credits — no booking, signals needsCredits', async () => {
  serverCreate.mockResolvedValue(rlsClient())
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: {
      memberships: { data: [], error: null },        // no membership
      package_credits: { data: [], error: null },     // no credits
      bookings: { data: null, error: null },          // capacity count
    },
  }))

  const res = await bookClass('class-1')
  expect(res.error).toMatch(/membership or class credits/i)
  expect(res.needsCredits).toBe(true)
})

test('paid membership books free — no credit consumed', async () => {
  const rls = rlsClient()
  serverCreate.mockResolvedValue(rls)
  const svc = makeSupabaseMock({
    results: {
      memberships: { data: [{ payment_status: 'paid', end_date: null }], error: null },
      package_credits: { data: [], error: null },
      bookings: { data: null, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await bookClass('class-1')
  expect(res.error).toBeNull()
  // booked via the RLS client with no credit_id
  expect(rls.builder('bookings').insert).toHaveBeenCalledWith(
    expect.objectContaining({ class_instance_id: 'class-1', athlete_id: 'u1' }),
  )
  const payload = rls.builder('bookings').insert.mock.calls[0][0]
  expect(payload).not.toHaveProperty('credit_id')
  // consume_credit not called
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('no membership + a credit → consumes one and books linked to it', async () => {
  serverCreate.mockResolvedValue(rlsClient())
  const svc = makeSupabaseMock({
    results: {
      memberships: { data: [], error: null },
      package_credits: { data: [{ id: 'batch-1', credits_remaining: 5, expires_at: null }], error: null },
      bookings: { data: null, error: null },
    },
    rpc: { data: 4, error: null }, // consume_credit → 4 remaining
  })
  serviceCreate.mockReturnValue(svc)

  const res = await bookClass('class-1')
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('consume_credit', { p_credit_id: 'batch-1' })
  expect(svc.builder('bookings').insert).toHaveBeenCalledWith(
    expect.objectContaining({ class_instance_id: 'class-1', athlete_id: 'u1', credit_id: 'batch-1' }),
  )
})

test('credit consumed but booking insert fails → refunds the credit', async () => {
  serverCreate.mockResolvedValue(rlsClient())
  const svc = makeSupabaseMock({
    results: {
      memberships: { data: [], error: null },
      package_credits: { data: [{ id: 'batch-1', credits_remaining: 5, expires_at: null }], error: null },
      bookings: { data: null, error: { code: '23505', message: 'dup' } }, // already booked
    },
    rpc: { data: 4, error: null },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await bookClass('class-1')
  expect(res.error).toBe('Already booked.')
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'batch-1' })
})
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/book-class.integration.test.ts`
Expected: FAIL (current `book-class` has no gate / no `needsCredits`).

- [ ] **Step 3: Rewrite the action**

Replace the entire contents of `src/app/dashboard/schedule/_actions/book-class.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getMembershipStatus } from '@/lib/membership-status'
import { selectBestBatch, decideEntitlement } from '@/lib/credits'

type BookResult = { error: string | null; needsCredits?: boolean }

export async function bookClass(instanceId: string): Promise<BookResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: instance } = await supabase
    .from('class_instances')
    .select('capacity, box_id')
    .eq('id', instanceId)
    .single()
  if (!instance) return { error: 'Class not found.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.' }
  if (instance.box_id !== profile.box_id) return { error: 'Class not found.' }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  // Capacity (service role bypasses athlete RLS to count everyone's bookings).
  const { count } = await service
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_instance_id', instanceId)
  if ((count ?? 0) >= instance.capacity) return { error: 'Class is full.' }

  // Entitlement precedence: paid membership → free; else a class credit; else refuse.
  const today = new Date().toISOString().slice(0, 10)

  const { data: memberships } = await service
    .from('memberships')
    .select('payment_status, end_date')
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
  const membershipPaid = getMembershipStatus(memberships ?? [], today) === 'paid'

  const { data: batches } = await service
    .from('package_credits')
    .select('id, credits_remaining, expires_at')
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
    .eq('kind', 'class')
    .gt('credits_remaining', 0)
  const best = selectBestBatch(batches ?? [], today)

  const decision = decideEntitlement(membershipPaid, best)

  if (decision.kind === 'none') {
    return { error: 'You need an active membership or class credits to book.', needsCredits: true }
  }

  if (decision.kind === 'membership') {
    // Free booking via the RLS client (athlete inserts own row), credit_id null.
    const { error } = await supabase.from('bookings').insert({
      box_id: profile.box_id,
      class_instance_id: instanceId,
      athlete_id: user.id,
    })
    if (error) {
      if (error.code === '23505') return { error: 'Already booked.' }
      return { error: error.message }
    }
    revalidatePath('/dashboard/schedule')
    return { error: null }
  }

  // decision.kind === 'credit' — consume one atomically, then book linked to it.
  const creditId = decision.batch.id
  const { data: remaining, error: consumeErr } = await service.rpc('consume_credit', {
    p_credit_id: creditId,
  })
  if (consumeErr || remaining === null || remaining === undefined) {
    return { error: 'Could not reserve a credit. Please try again.' }
  }

  const { error: insErr } = await service.from('bookings').insert({
    box_id: profile.box_id,
    class_instance_id: instanceId,
    athlete_id: user.id,
    credit_id: creditId,
  })
  if (insErr) {
    await service.rpc('refund_credit', { p_credit_id: creditId }) // give it back
    if (insErr.code === '23505') return { error: 'Already booked.' }
    return { error: insErr.message }
  }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
```

- [ ] **Step 4: Run it — verify PASS (4 tests)**

Run: `npx vitest run src/__tests__/book-class.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 errors. (The `BookResult.needsCredits` field is consumed in Task 8; `booking-button` already destructures only `error`, so existing callers compile.)

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/schedule/_actions/book-class.ts src/__tests__/book-class.integration.test.ts
git commit -m "feat(packages): hard-gate booking on entitlement, consume credit at booking"
```

---

### Task 4: Refund the credit on cancel — `cancel-booking.ts`

**Files:**
- Modify: `src/app/dashboard/schedule/_actions/cancel-booking.ts`
- Test: `src/__tests__/cancel-booking.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/__tests__/cancel-booking.integration.test.ts`:
```ts
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { cancelBooking } from '@/app/dashboard/schedule/_actions/cancel-booking'

beforeEach(() => vi.clearAllMocks())

test('credit-backed booking → deletes and refunds the credit', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { bookings: { data: { credit_id: 'batch-1' }, error: null } },
  }))
  const svc = makeSupabaseMock({ rpc: { data: null, error: null } })
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'batch-1' })
})

test('membership-covered booking (no credit_id) → deletes, no refund', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { bookings: { data: { credit_id: null }, error: null } },
  }))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(svc.rpc).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/cancel-booking.integration.test.ts`
Expected: FAIL (current `cancel-booking` never reads `credit_id` or refunds).

- [ ] **Step 3: Rewrite the action**

Replace the entire contents of `src/app/dashboard/schedule/_actions/cancel-booking.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function cancelBooking(instanceId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Read which credit (if any) this booking drew from, before deleting it.
  // Athletes can SELECT their own bookings under the athlete_book RLS policy.
  const { data: booking } = await supabase
    .from('bookings')
    .select('credit_id')
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
    .maybeSingle()

  // athlete_book RLS policy covers delete for own bookings.
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
  if (error) return { error: error.message }

  // Cancel refunds the credit. (No-show never reaches here, so it forfeits — by
  // design.) Delete-then-refund: a double-click's second pass reads credit_id =
  // null (row already gone), so a credit is never refunded twice.
  if (booking?.credit_id) {
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    await service.rpc('refund_credit', { p_credit_id: booking.credit_id })
  }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
```

- [ ] **Step 4: Run it — verify PASS (2 tests)**

Run: `npx vitest run src/__tests__/cancel-booking.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/schedule/_actions/cancel-booking.ts src/__tests__/cancel-booking.integration.test.ts
git commit -m "feat(packages): refund the consumed credit on booking cancel"
```

---

### Task 5: Credit-backed bookings pass check-in — `check-in.ts`

**Files:**
- Modify: `src/app/dashboard/whiteboard/_actions/check-in.ts`
- Test: `src/__tests__/check-in.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/__tests__/check-in.integration.test.ts`:
```ts
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { checkIn } from '@/app/dashboard/whiteboard/_actions/check-in'

beforeEach(() => vi.clearAllMocks())

// Staff coach in box b1; the athlete being checked in has NO paid membership.
function staffClient() {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      memberships: { data: [], error: null }, // no_membership
    },
  })
}

test('blocks an unpaid athlete with no credit-backed booking', async () => {
  serverCreate.mockResolvedValue(staffClient())
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: { bookings: { data: { credit_id: null }, error: null } },
  }))

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBe('BLOCKED')
  expect(res.blocked?.reason).toBe('no_membership')
})

test('allows an unpaid athlete whose booking is credit-backed', async () => {
  serverCreate.mockResolvedValue(staffClient())
  const svc = makeSupabaseMock({
    results: { bookings: { data: { credit_id: 'batch-1' }, error: null } },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await checkIn('class-1', 'athlete-1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).toHaveBeenCalledWith(
    expect.objectContaining({ checked_in: true }),
  )
})
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/check-in.integration.test.ts`
Expected: FAIL (current `check-in` blocks any non-paid athlete regardless of credit).

- [ ] **Step 3: Edit the action — accept a credit-backed booking**

In `src/app/dashboard/whiteboard/_actions/check-in.ts`, the current body after the staff-role check is:
```ts
  const { data: memberships } = await supabase
    .from('memberships')
    .select('payment_status, end_date, last_paid_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  const today = new Date().toISOString().slice(0, 10)
  const status = getMembershipStatus(memberships ?? [], today)

  if (status !== 'paid') {
    const lastPaidDate = (memberships ?? [])
      .map((m) => m.last_paid_date)
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null
    return { error: 'BLOCKED', blocked: { reason: status, lastPaidDate } }
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service
```
Replace that span (from the `memberships` fetch through `const service = …` creation) with the version below, which creates the service client *before* the gate and lets a credit-backed booking through:
```ts
  const { data: memberships } = await supabase
    .from('memberships')
    .select('payment_status, end_date, last_paid_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  const today = new Date().toISOString().slice(0, 10)
  const status = getMembershipStatus(memberships ?? [], today)

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (status !== 'paid') {
    // A credit-backed booking is a valid entitlement on its own — let it through.
    const { data: booking } = await service
      .from('bookings')
      .select('credit_id')
      .eq('class_instance_id', instanceId)
      .eq('athlete_id', athleteId)
      .eq('box_id', profile.box_id)
      .maybeSingle()

    if (!booking?.credit_id) {
      const lastPaidDate = (memberships ?? [])
        .map((m) => m.last_paid_date)
        .filter((d): d is string => !!d)
        .sort()
        .pop() ?? null
      return { error: 'BLOCKED', blocked: { reason: status, lastPaidDate } }
    }
  }

  const { error } = await service
```
(The trailing `.from('bookings').update({ checked_in: … })` block is unchanged.)

- [ ] **Step 4: Run it — verify PASS (2 tests)**

Run: `npx vitest run src/__tests__/check-in.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/whiteboard/_actions/check-in.ts src/__tests__/check-in.integration.test.ts
git commit -m "feat(packages): accept credit-backed bookings at check-in"
```

---

### Task 6: Owner "Redeem session" for PT-block credits

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/_lib/validation.ts`
- Create: `src/app/dashboard/members/[memberId]/_actions/redeem-session.ts`
- Modify: `src/app/dashboard/members/[memberId]/_components/sell-package.tsx`
- Test: `src/__tests__/redeem-session-validation.test.ts`

- [ ] **Step 1: Write the failing validation test**

Create `src/__tests__/redeem-session-validation.test.ts`:
```ts
import { validateRedeemInput } from '@/app/dashboard/members/[memberId]/_lib/validation'

describe('validateRedeemInput', () => {
  test('accepts a non-empty credit id', () => {
    expect(validateRedeemInput('batch-1')).toBeNull()
  })
  test('rejects an empty credit id', () => {
    expect(validateRedeemInput('')).toMatch(/credit/i)
  })
  test('rejects whitespace-only credit id', () => {
    expect(validateRedeemInput('   ')).toMatch(/credit/i)
  })
})
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/redeem-session-validation.test.ts`
Expected: FAIL (`validateRedeemInput` not exported).

- [ ] **Step 3: Add the validator**

In `src/app/dashboard/members/[memberId]/_lib/validation.ts`, append (keep the existing `validateSellPackageInput`):
```ts
export function validateRedeemInput(creditId: string): string | null {
  if (!creditId?.trim()) return 'Missing credit batch.'
  return null
}
```

- [ ] **Step 4: Run it — verify PASS (3 tests)**

Run: `npx vitest run src/__tests__/redeem-session-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the action**

Create `src/app/dashboard/members/[memberId]/_actions/redeem-session.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { validateRedeemInput } from '../_lib/validation'

export async function redeemSession(creditId: string): Promise<{ error: string | null }> {
  const validationError = validateRedeemInput(creditId)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can redeem sessions.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // The batch must be a PT-session batch in the owner's box (tenant scope).
  const { data: batch } = await service
    .from('package_credits')
    .select('id, athlete_id, kind, credits_remaining')
    .eq('id', creditId)
    .eq('box_id', profile.box_id)
    .eq('kind', 'pt_session')
    .maybeSingle()
  if (!batch) return { error: 'PT credit batch not found.' }
  if (batch.credits_remaining < 1) return { error: 'No sessions left in this batch.' }

  const { data: remaining, error } = await service.rpc('consume_credit', { p_credit_id: creditId })
  if (error || remaining === null || remaining === undefined) {
    return { error: 'Could not redeem a session. Please try again.' }
  }

  revalidatePath(`/dashboard/members/${batch.athlete_id}`)
  return { error: null }
}
```

- [ ] **Step 6: Wire the button into the credits list**

In `src/app/dashboard/members/[memberId]/_components/sell-package.tsx`, add the redeem action wiring. At the top, extend the imports:
```tsx
import { useState, useTransition } from 'react'
import { sellPackage } from '../_actions/sell-package'
import { redeemSession } from '../_actions/redeem-session'
```
Inside the component, add redeem state right after the existing `const [pending, startTransition] = useTransition()` line:
```tsx
  const [redeeming, setRedeeming] = useState<string | null>(null)

  function onRedeem(creditId: string) {
    setRedeeming(creditId)
    startTransition(async () => {
      const res = await redeemSession(creditId)
      if (res.error) alert(res.error)
      setRedeeming(null)
    })
  }
```
Then, in the credits list, replace the existing per-credit row:
```tsx
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--c-ink-2)' }}>
              <span>{pkgName(c)} <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>({c.kind === 'pt_session' ? 'PT' : 'class'})</span></span>
              <span className="mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
            </div>
```
with a version that adds a "Redeem session" button for PT batches that still have credits:
```tsx
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13, color: 'var(--c-ink-2)' }}>
              <span>{pkgName(c)} <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>({c.kind === 'pt_session' ? 'PT' : 'class'})</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
                {c.kind === 'pt_session' && c.credits_remaining > 0 && (
                  <button
                    onClick={() => onRedeem(c.id)}
                    disabled={redeeming === c.id}
                    style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: redeeming === c.id ? 0.6 : 1 }}
                  >
                    {redeeming === c.id ? 'Redeeming…' : 'Redeem session'}
                  </button>
                )}
              </span>
            </div>
```

- [ ] **Step 7: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/members/[memberId]/_lib/validation.ts src/app/dashboard/members/[memberId]/_actions/redeem-session.ts src/app/dashboard/members/[memberId]/_components/sell-package.tsx src/__tests__/redeem-session-validation.test.ts
git commit -m "feat(packages): owner redeem-session for PT-block credits"
```

---

### Task 7: Whiteboard "pack" badge for credit-backed bookings

**Files:**
- Modify: `src/app/dashboard/whiteboard/page.tsx`
- Modify: `src/app/dashboard/whiteboard/_components/checkin-button.tsx`

- [ ] **Step 1: Select `credit_id` and pass `hasCredit` (page)**

In `src/app/dashboard/whiteboard/page.tsx`, in the `class_instances` query, add `credit_id` to the nested bookings select. Change:
```tsx
      bookings(athlete_id, checked_in, profiles!bookings_athlete_id_fkey(full_name))
```
to:
```tsx
      bookings(athlete_id, checked_in, credit_id, profiles!bookings_athlete_id_fkey(full_name))
```
Then update the `bookings` type cast (where it's read for the athlete list) to include `credit_id`. Change:
```tsx
            const bookings = instance.bookings as {
              athlete_id: string
              checked_in: boolean
              profiles: { full_name: string } | { full_name: string }[]
            }[] | null
```
to:
```tsx
            const bookings = instance.bookings as {
              athlete_id: string
              checked_in: boolean
              credit_id: string | null
              profiles: { full_name: string } | { full_name: string }[]
            }[] | null
```
Finally, pass `hasCredit` to `CheckInButton`. Change the JSX:
```tsx
                          <CheckInButton
                            instanceId={instance.id}
                            athleteId={booking.athlete_id}
                            athleteName={athleteProfile?.full_name ?? 'Unknown'}
                            checkedIn={booking.checked_in}
                            membershipStatus={status}
                            lastPaidDate={lastPaid}
                          />
```
to add one prop:
```tsx
                          <CheckInButton
                            instanceId={instance.id}
                            athleteId={booking.athlete_id}
                            athleteName={athleteProfile?.full_name ?? 'Unknown'}
                            checkedIn={booking.checked_in}
                            membershipStatus={status}
                            lastPaidDate={lastPaid}
                            hasCredit={!!booking.credit_id}
                          />
```

- [ ] **Step 2: Render the badge instead of the block dot (button)**

In `src/app/dashboard/whiteboard/_components/checkin-button.tsx`, add the `hasCredit` prop and adjust the dot logic.

Add `hasCredit` to the props destructure and type:
```tsx
export function CheckInButton({
  instanceId,
  athleteId,
  athleteName,
  checkedIn,
  membershipStatus,
  lastPaidDate,
  hasCredit = false,
}: {
  instanceId: string
  athleteId: string
  athleteName: string
  checkedIn: boolean
  membershipStatus: MembershipStatus
  lastPaidDate: string | null
  hasCredit?: boolean
}) {
```
Change the dot condition so a credit-backed booking shows no danger dot:
```tsx
  const showDot = !done && membershipStatus !== 'paid' && !hasCredit
```
Then, inside the `<button>`, immediately after the `{showDot && ( … )}` block, add a "pack" badge for credit-backed unpaid athletes:
```tsx
        {!done && membershipStatus !== 'paid' && hasCredit && (
          <span
            title="Booked with a class credit"
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
              background: 'var(--circle-lime-soft)', color: 'var(--circle-lime-ink)',
              textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
            }}
          >
            Pack
          </span>
        )}
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/whiteboard/page.tsx src/app/dashboard/whiteboard/_components/checkin-button.tsx
git commit -m "feat(packages): pack badge for credit-backed bookings on the whiteboard"
```

---

### Task 8: Buy-a-pack link when booking is refused

**Files:**
- Modify: `src/app/dashboard/schedule/_components/booking-button.tsx`

- [ ] **Step 1: Show an inline buy link on the hard-gate refusal**

In `src/app/dashboard/schedule/_components/booking-button.tsx`, surface the buy link when `bookClass` returns `needsCredits`. Add the `Link` import and a `useState` flag, render the link below the button, and clear it on a fresh click.

Replace the import block:
```tsx
'use client'

import { useState } from 'react'
import { bookClass } from '../_actions/book-class'
import { cancelBooking } from '../_actions/cancel-booking'
```
with:
```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { bookClass } from '../_actions/book-class'
import { cancelBooking } from '../_actions/cancel-booking'
```
Replace the `handleClick` + `isFull` early-return region. Current:
```tsx
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const { error } = isBooked ? await cancelBooking(instanceId) : await bookClass(instanceId)
    if (error) alert(error)
    setLoading(false)
  }
```
becomes (track a `needsCredits` flag; non-gate errors keep the existing `alert`):
```tsx
  const [loading, setLoading] = useState(false)
  const [needsCredits, setNeedsCredits] = useState(false)

  async function handleClick() {
    setLoading(true)
    setNeedsCredits(false)
    const res = isBooked ? await cancelBooking(instanceId) : await bookClass(instanceId)
    if ('needsCredits' in res && res.needsCredits) {
      setNeedsCredits(true)
    } else if (res.error) {
      alert(res.error)
    }
    setLoading(false)
  }
```
Then wrap the returned `<button>` so the link can render beneath it. Change the final `return ( <button … /> )` to:
```tsx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          height: 30, padding: '0 14px',
          background: isBooked ? 'transparent' : 'var(--circle-lime)',
          border: isBooked ? '1px solid var(--c-border)' : 'none',
          borderRadius: 7, cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 12.5, fontWeight: 700,
          color: isBooked ? 'var(--c-ink-2)' : 'var(--circle-ink)',
          fontFamily: 'inherit', transition: 'opacity 120ms',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? '…' : isBooked ? 'Cancel' : 'Book'}
      </button>
      {needsCredits && (
        <Link href="/dashboard/shop" style={{ fontSize: 11, color: 'var(--circle-lime-ink)', textDecoration: 'underline' }}>
          Need a class credit — buy a pack
        </Link>
      )}
    </div>
  )
```
(The `isFull && !isBooked` early-return block above stays exactly as-is.)

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors, 0 warnings. (`'needsCredits' in res` narrows safely: `cancelBooking` returns `{ error }`, `bookClass` returns `{ error; needsCredits? }`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/schedule/_components/booking-button.tsx
git commit -m "feat(packages): buy-a-pack link when a booking is refused for no entitlement"
```

---

### Task 9: Full verification + scope doc

**Files:**
- Modify: `GymGlofox.md` (scope/roadmap log)

- [ ] **Step 1: Static gates**

Run: `npm run type-check && npm run lint && npm run test && npm run build`
Expected: 0 type errors, 0 lint warnings, all tests pass (incl. the 4 new credit/booking suites), build compiles.

- [ ] **Step 2: Run migration 023 (Supabase SQL Editor)**

Paste `migrations/023_credit_functions.sql` into the Supabase SQL Editor for the project and run it. Verify both functions exist:
```sql
SELECT proname FROM pg_proc WHERE proname IN ('consume_credit', 'refund_credit');
```
Expected: two rows.

- [ ] **Step 3: Manual smoke (Stripe test mode + a member with credits)**

Pre-req: a member with **no paid membership** who owns a class-credit batch (buy one via `/dashboard/shop`, PR-2b, or owner-sell).

1. As that member, open `/dashboard/schedule` and **Book** a class → succeeds. On `/dashboard/shop`, "Your credits" shows the batch decremented by 1.
2. **Cancel** the same booking → the credit returns (balance back up by 1).
3. As a member with **no membership and no credits**, **Book** → refused; the "Need a class credit — buy a pack" link appears and opens `/dashboard/shop`.
4. With a credit-backed booking present, open the **whiteboard** → that athlete shows a lime **Pack** badge (not the red unpaid dot) and **checks in** without the block modal.
5. As an **owner**, open a member profile holding a **PT block** batch → **Redeem session** decrements it by 1.
6. Regression: a member with a **paid membership** books and checks in exactly as before — no credit consumed (`credit_id` null on the booking).

- [ ] **Step 4: Update the scope log**

In `GymGlofox.md`, update the Packages line to record PR-3 as shipped (match the existing format used for PR-1/PR-2b — find the line referencing "PR-3 entitlement" and mark it done, e.g. "Packages PR-3 merged — entitlement (book/cancel/check-in consume+refund, PT redeem); Packages feature complete").

- [ ] **Step 5: Commit**

```bash
git add GymGlofox.md
git commit -m "docs(scope): Packages PR-3 merged — credit entitlement; Packages feature complete"
```

---

## Self-Review

**Spec coverage** (spec "Entitlement enforcement" + "PR-3"):
- `book-class.ts` precedence (membership → credit → refuse) + guarded atomic consume → Task 3 (`decideEntitlement` + `consume_credit` RPC) ✅. The spec's `WHERE remaining > 0 RETURNING` is realized as `consume_credit` (Task 2), which returns NULL when empty.
- "Best batch = soonest-expiring, non-expired, remaining > 0" → `selectBestBatch`, Task 1 ✅.
- `cancel-booking.ts` reads `credit_id`, refunds atomically → Task 4 (`refund_credit`) ✅. Order is delete-then-refund (deviation from the spec's refund-then-delete) to make a double-click idempotent — noted inline.
- `check-in.ts` "valid if paid membership OR `booking.credit_id is not null`" → Task 5 ✅; existing block + override unchanged.
- PT block "Redeem session" guarded −1 by owner → Task 6 ✅.
- Pure logic in a credits module mirroring `membership-status.ts` → Task 1 (`src/lib/credits.ts`) ✅.
- UI: hard-gate refusal shows reason + buy link → Task 8 ✅; whiteboard "pack" badge → Task 7 ✅.
- Testing: best-batch + entitlement unit tests → Task 1 ✅; booking consumes / cancel refunds / hard-gate refuses integration tests → Tasks 3–5 ✅.
  - **Gap vs spec wording:** the spec listed a pure-logic "refund" unit test. With atomic refund in SQL there is no pure refund logic to unit-test; refund is covered by the cancel **integration** test (Task 4) and the failed-insert rollback assertion (Task 3) instead. Intentional.
  - **Webhook grant test** named in the spec's Testing section belongs to PR-2 (already shipped); not re-tested here.

**Placeholder scan:** none — every code step has complete code; every command has an expected result.

**Type consistency:**
- `CreditBatch { id, credits_remaining, expires_at }` defined in Task 1; the `book-class` `package_credits` select (`id, credits_remaining, expires_at`) matches it (Task 3).
- `EntitlementDecision` discriminated union (`membership` | `credit` { batch } | `none`) is produced by `decideEntitlement` (Task 1) and consumed by `book-class` (Task 3) — `decision.batch.id` is type-narrowed, no non-null assertion.
- RPC names/args are identical everywhere: `consume_credit` / `refund_credit` with `{ p_credit_id }` (Tasks 2, 3, 4, 6), matching the SQL function signatures (Task 2).
- `bookClass` returns `{ error; needsCredits? }` (Task 3); `booking-button` narrows with `'needsCredits' in res` (Task 8); `cancelBooking` still returns `{ error }` (Task 4) — both call sites compile.
- `CheckInButton` gains optional `hasCredit?: boolean` (Task 7 button) and the whiteboard passes `hasCredit={!!booking.credit_id}` (Task 7 page) after adding `credit_id` to the select.
- `validateRedeemInput(creditId): string | null` (Task 6) matches its test and the `redeemSession` call site.
- Test mock `rpc?: MockResult` + `rpc()` method (Task 2) match every `service.rpc(...)` assertion in Tasks 3–5.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-06-packages-pr3-entitlement.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
