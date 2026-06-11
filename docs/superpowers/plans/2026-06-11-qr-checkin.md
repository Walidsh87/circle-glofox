# #61 QR Self Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members scan a printed QR at the gym door and check themselves into today's booked classes from their own phone.

**Architecture:** A rotatable `checkin_token` on boxes (exact `tv_token` pattern) resolves a public `/checkin/[token]` page. Logged-out visitors get the existing `GymLoginForm` inline (new `redirectTo` prop); logged-in members see today's bookings with per-class states and a Check-in button calling `selfCheckIn`. The membership/credit entitlement gate is extracted from the staff whiteboard action into `src/lib/checkin-entitlement.ts` so the two flows share one gate.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS + service clients), Vitest + `makeSupabaseMock` (result-queue support landed in #60), `qrcode` (new dep) for the printable poster.

**Spec:** `docs/superpowers/specs/2026-06-11-qr-checkin-design.md`

**House rules that apply here:**
- TDD for libs and server actions; pages and 'use client' components untested by convention.
- Never chain `vitest … && git commit` — run the test, READ the output, then commit.
- Commits to `main`, style `feat(checkin): …`, ending `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Migration 056 applied to prod in the final task via docker psql. NEVER write the DB password into a committed file.
- Test count baseline: 788 passing before this feature.

---

## File map

| File | Change |
|---|---|
| `migrations/056_checkin_token.sql` | Create — `checkin_token` on boxes |
| `migrations/ROLLBACKS.md` | Modify — header range + 056 entry |
| `package.json` | Modify — add `qrcode` dep + `@types/qrcode` devDep (via npm) |
| `src/lib/self-checkin.ts` (+ `.test.ts`) | Create — pure `checkInWindow` |
| `src/lib/checkin-entitlement.ts` | Create — shared entitlement gate (extracted) |
| `src/app/dashboard/whiteboard/_actions/check-in.ts` | Modify — call the shared gate (behavior identical) |
| `src/app/checkin/_actions/self-check-in.ts` | Create — `selfCheckIn` action |
| `src/__tests__/self-check-in.integration.test.ts` | Create — 8 tests |
| `src/app/dashboard/settings/_actions/set-checkin-token.ts` | Create — owner action |
| `src/__tests__/set-checkin-token.integration.test.ts` | Create — 3 tests (mirror tv-token) |
| `src/app/dashboard/settings/_components/checkin-qr-card.tsx` | Create — settings card |
| `src/app/dashboard/settings/page.tsx` | Modify — select `checkin_token`, render card |
| `src/app/[gymSlug]/_components/gym-login-form.tsx` | Modify — optional `redirectTo` prop |
| `src/app/checkin/[token]/page.tsx` | Create — member check-in page |
| `src/app/checkin/_components/check-in-button.tsx` | Create — client button |
| `src/app/dashboard/settings/checkin-poster/page.tsx` | Create — printable poster |
| `GymGlofox.md` | Modify — roadmap line 211 (#61 → ✅) |

Middleware needs NO change: only `/dashboard` and `/onboarding` are auth-protected; `/checkin/*` passes through (session still refreshed).

---

### Task 1: Migration 056, rollback entry, qrcode dependency

**Files:**
- Create: `migrations/056_checkin_token.sql`
- Modify: `migrations/ROLLBACKS.md` (header line 3 + new entry above `### 055_task_assignee`)
- Modify: `package.json` (+ lockfile, via npm)

- [ ] **Step 1: Create the migration file**

`migrations/056_checkin_token.sql`:

```sql
-- migrations/056_checkin_token.sql
-- Per-gym secret for the door check-in QR (#61). NULL = self check-in disabled.
-- Mirrors 028_tv_token.sql. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS checkin_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_checkin_token ON boxes (checkin_token) WHERE checkin_token IS NOT NULL;
```

- [ ] **Step 2: Update ROLLBACKS.md**

Change line 3 to:

```markdown
Reverse procedures for migrations `008`–`056` (referenced by the DR runbook, `docs/runbooks/disaster-recovery.md`).
```

Insert directly above the `### 055_task_assignee` heading:

```markdown
### 056_checkin_token
```sql
DROP INDEX IF EXISTS idx_boxes_checkin_token;
ALTER TABLE boxes DROP COLUMN IF EXISTS checkin_token;
```

```

(Blank line between the new entry's closing fence and `### 055_task_assignee`.)

- [ ] **Step 3: Install qrcode**

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

Expected: both succeed; `qrcode` appears under dependencies, `@types/qrcode` under devDependencies.

- [ ] **Step 4: Commit**

```bash
git add migrations/056_checkin_token.sql migrations/ROLLBACKS.md package.json package-lock.json
git commit -m "feat(checkin): mig 056 checkin_token + qrcode dep (#61 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `checkInWindow` pure helper (TDD)

**Files:**
- Create: `src/lib/self-checkin.ts`
- Test: `src/lib/self-checkin.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/self-checkin.test.ts`:

```ts
import { test, expect } from 'vitest'
import { checkInWindow } from './self-checkin'

const START = '2026-06-11T18:00:00.000Z'

test('open exactly 60 minutes before start (inclusive)', () => {
  expect(checkInWindow(START, '2026-06-11T17:00:00.000Z')).toBe('open')
})

test('early 60 minutes and 1 second before start', () => {
  expect(checkInWindow(START, '2026-06-11T16:59:59.000Z')).toBe('early')
})

test('open at start time', () => {
  expect(checkInWindow(START, '2026-06-11T18:00:00.000Z')).toBe('open')
})

test('open exactly 30 minutes after start (inclusive)', () => {
  expect(checkInWindow(START, '2026-06-11T18:30:00.000Z')).toBe('open')
})

test('closed 30 minutes and 1 second after start', () => {
  expect(checkInWindow(START, '2026-06-11T18:30:01.000Z')).toBe('closed')
})

test('early the morning of an evening class', () => {
  expect(checkInWindow(START, '2026-06-11T08:00:00.000Z')).toBe('early')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/self-checkin.test.ts`
Expected: FAIL — cannot resolve `./self-checkin`.

- [ ] **Step 3: Implement**

`src/lib/self-checkin.ts`:

```ts
// Self check-in window (#61): a member can check into a booked class from
// 60 minutes before start until 30 minutes after start, inclusive.
const OPEN_BEFORE_MS = 60 * 60_000
const CLOSE_AFTER_MS = 30 * 60_000

export function checkInWindow(startsAtIso: string, nowIso: string): 'open' | 'early' | 'closed' {
  const start = new Date(startsAtIso).getTime()
  const now = new Date(nowIso).getTime()
  if (now < start - OPEN_BEFORE_MS) return 'early'
  if (now > start + CLOSE_AFTER_MS) return 'closed'
  return 'open'
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/self-checkin.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/self-checkin.ts src/lib/self-checkin.test.ts
git commit -m "feat(checkin): checkInWindow helper, -60/+30 inclusive (#61 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Extract the shared entitlement gate (green-to-green refactor)

The staff whiteboard `checkIn` and the new `selfCheckIn` must apply the SAME gate: paid membership (resolved through the household primary) OR a credit-backed booking. Extract it; staff behavior must be byte-identical — the 6 existing tests in `src/__tests__/check-in.integration.test.ts` pass UNCHANGED.

Mock note: `requireStaffAction` reads `profiles` once and the gate reads `profiles` again (household_id) on the same RLS client — existing tests configure `profiles` as a single sticky object that serves both reads (e.g. test 4 includes `household_id: 'hh1'` in that one object). The extraction preserves this exactly.

**Files:**
- Create: `src/lib/checkin-entitlement.ts`
- Modify: `src/app/dashboard/whiteboard/_actions/check-in.ts`
- Test (existing, unchanged): `src/__tests__/check-in.integration.test.ts`

- [ ] **Step 1: Run the existing staff tests (green before)**

Run: `npx vitest run src/__tests__/check-in.integration.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 2: Create the shared gate**

`src/lib/checkin-entitlement.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus, type MembershipStatus } from '@/lib/membership-status'

export type CheckInEntitlement =
  | { status: 'ok' }
  | { status: 'blocked'; reason: Exclude<MembershipStatus, 'paid'>; lastPaidDate: string | null }
  | { status: 'error'; message: string }

// Shared gate for staff check-in (#whiteboard) and member self check-in (#61):
// paid membership — resolved through the household primary — OR a credit-backed booking.
export async function assessCheckInEntitlement(
  rls: SupabaseClient,
  service: SupabaseClient,
  args: { athleteId: string; instanceId: string; boxId: string },
): Promise<CheckInEntitlement> {
  // Family: a member's entitlement resolves through their household's primary.
  let billingAthleteId = args.athleteId
  const { data: athleteProfile } = await rls.from('profiles').select('household_id').eq('id', args.athleteId).single()
  if (athleteProfile?.household_id) {
    const { data: hh } = await rls.from('households').select('primary_athlete_id').eq('id', athleteProfile.household_id).single()
    if (hh?.primary_athlete_id) billingAthleteId = hh.primary_athlete_id
  }

  const { data: memberships } = await rls
    .from('memberships')
    .select('payment_status, end_date, last_paid_date, frozen_from, frozen_until')
    .eq('athlete_id', billingAthleteId)
    .eq('box_id', args.boxId)

  const today = new Date().toISOString().slice(0, 10)
  const status = getMembershipStatus(memberships ?? [], today)
  if (status === 'paid') return { status: 'ok' }

  // A credit-backed booking is a valid entitlement on its own — let it through.
  const { data: booking, error: bookingErr } = await service
    .from('bookings')
    .select('credit_id')
    .eq('class_instance_id', args.instanceId)
    .eq('athlete_id', args.athleteId)
    .eq('box_id', args.boxId)
    .maybeSingle()
  if (bookingErr) return { status: 'error', message: bookingErr.message }
  if (booking?.credit_id) return { status: 'ok' }

  const lastPaidDate = (memberships ?? [])
    .map((m) => m.last_paid_date)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null
  return { status: 'blocked', reason: status, lastPaidDate }
}
```

Type contingency: if `tsc` rejects passing the RLS client (from `@supabase/ssr`) where `SupabaseClient` is expected, loosen BOTH client params to `Pick<SupabaseClient, 'from'>` — nothing else about the file changes.

- [ ] **Step 3: Refactor the staff action to call it**

Replace the full contents of `src/app/dashboard/whiteboard/_actions/check-in.ts` with:

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import type { MembershipStatus } from '@/lib/membership-status'
import { assessCheckInEntitlement } from '@/lib/checkin-entitlement'
import { awardConsistency } from './_award'

type CheckInResult = {
  error: string | null
  blocked?: {
    reason: Exclude<MembershipStatus, 'paid'>
    lastPaidDate: string | null
  }
}

export async function checkIn(
  instanceId: string,
  athleteId: string
): Promise<CheckInResult> {
  const auth = await requireStaffAction('Only staff can check in athletes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const service = createServiceClient()

  const gate = await assessCheckInEntitlement(supabase, service, { athleteId, instanceId, boxId: profile.box_id })
  if (gate.status === 'error') return { error: gate.message }
  if (gate.status === 'blocked') return { error: 'BLOCKED', blocked: { reason: gate.reason, lastPaidDate: gate.lastPaidDate } }

  const { error } = await service
    .from('bookings')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  const today = new Date().toISOString().slice(0, 10)
  try { await awardConsistency(service, profile.box_id, athleteId, today) }
  catch (e) { console.error('awardConsistency failed (check-in still succeeded):', e) }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
```

- [ ] **Step 4: Verify green after — staff tests unchanged, type-check clean**

Run: `npx vitest run src/__tests__/check-in.integration.test.ts`
Expected: 6/6 PASS (file untouched).
Run: `npm run type-check`
Expected: 0 errors (apply the type contingency from Step 2 if not).

- [ ] **Step 5: Commit**

```bash
git add src/lib/checkin-entitlement.ts src/app/dashboard/whiteboard/_actions/check-in.ts
git commit -m "refactor(checkin): extract shared entitlement gate (#61 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `selfCheckIn` action (TDD)

**Files:**
- Create: `src/app/checkin/_actions/self-check-in.ts`
- Test: `src/__tests__/self-check-in.integration.test.ts`

Mock map for the happy paths — the SERVICE client's `bookings` builder is hit multiple times, so use the #60 result-queue feature (array results consumed per terminal call):
1. booking lookup (`maybeSingle`) → `{ checked_in, class_instances: { starts_at } }`
2. (only when not paid) entitlement credit check (`maybeSingle`) → `{ credit_id }`
3. the `update` (awaited builder) → `{ data: null, error: null }`
4. `awardConsistency`'s history read (awaited builder) → `{ data: [], error: null }`

The RLS client reads `profiles` (twice: action + gate — one sticky object covers both) and `memberships`.

- [ ] **Step 1: Write the failing tests**

`src/__tests__/self-check-in.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { selfCheckIn } from '@/app/checkin/_actions/self-check-in'

beforeEach(() => vi.clearAllMocks())

const IN_WINDOW = () => new Date(Date.now() + 10 * 60_000).toISOString()   // starts in 10 min
const TOO_EARLY = () => new Date(Date.now() + 2 * 3_600_000).toISOString() // starts in 2 h
const TOO_LATE  = () => new Date(Date.now() - 2 * 3_600_000).toISOString() // started 2 h ago

function rlsPaid() {
  return makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      profiles: { data: { box_id: 'b1', household_id: null }, error: null },
      memberships: { data: [{ payment_status: 'paid', end_date: null }], error: null },
    },
  })
}

test('rejects an unauthenticated caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Not authenticated.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('errors when the caller has no booking for the class', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: null, error: null } } }))
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Booking not found.')
})

test('is idempotent when already checked in', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  const svc = makeSupabaseMock({ results: { bookings: { data: { checked_in: true, class_instances: { starts_at: IN_WINDOW() } }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).not.toHaveBeenCalled()
})

test('rejects before the window opens', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  const svc = makeSupabaseMock({ results: { bookings: { data: { checked_in: false, class_instances: { starts_at: TOO_EARLY() } }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Check-in opens 60 minutes before class.')
  expect(svc.builder('bookings').update).not.toHaveBeenCalled()
})

test('rejects after the window closes', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  const svc = makeSupabaseMock({ results: { bookings: { data: { checked_in: false, class_instances: { starts_at: TOO_LATE() } }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Check-in for this class has closed.')
  expect(svc.builder('bookings').update).not.toHaveBeenCalled()
})

test('blocks an unpaid member with no credit-backed booking', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      profiles: { data: { box_id: 'b1', household_id: null }, error: null },
      memberships: { data: [], error: null }, // no_membership
    },
  }))
  const svc = makeSupabaseMock({ results: { bookings: [
    { data: { checked_in: false, class_instances: { starts_at: IN_WINDOW() } }, error: null }, // lookup
    { data: { credit_id: null }, error: null },                                                 // credit check
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBe('Please see the front desk about your membership.')
  expect(svc.builder('bookings').update).not.toHaveBeenCalled()
})

test('lets a credit-backed booking through without a paid membership', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      profiles: { data: { box_id: 'b1', household_id: null }, error: null },
      memberships: { data: [], error: null },
    },
  }))
  const svc = makeSupabaseMock({ results: { bookings: [
    { data: { checked_in: false, class_instances: { starts_at: IN_WINDOW() } }, error: null }, // lookup
    { data: { credit_id: 'batch-1' }, error: null },                                            // credit check
    { data: null, error: null },                                                                // update
    { data: [], error: null },                                                                  // award history
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).toHaveBeenCalledWith(expect.objectContaining({ checked_in: true }))
})

test('checks a paid member into an in-window booked class', async () => {
  serverCreate.mockResolvedValue(rlsPaid())
  const svc = makeSupabaseMock({ results: { bookings: [
    { data: { checked_in: false, class_instances: { starts_at: IN_WINDOW() } }, error: null }, // lookup
    { data: null, error: null },                                                                // update
    { data: [], error: null },                                                                  // award history
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await selfCheckIn('ci1')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').update).toHaveBeenCalledWith(expect.objectContaining({ checked_in: true }))
  expect(svc.builder('bookings').eq).toHaveBeenCalledWith('athlete_id', 'ath1') // own booking only
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/self-check-in.integration.test.ts`
Expected: FAIL — cannot resolve `@/app/checkin/_actions/self-check-in`.

- [ ] **Step 3: Implement**

`src/app/checkin/_actions/self-check-in.ts`:

```ts
'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { assessCheckInEntitlement } from '@/lib/checkin-entitlement'
import { checkInWindow } from '@/lib/self-checkin'
import { awardConsistency } from '@/app/dashboard/whiteboard/_actions/_award'

export async function selfCheckIn(instanceId: string): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: profile } = await supabase.from('profiles').select('box_id').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found.' }

  const service = createServiceClient()

  // Own booking only — athlete_id is pinned to the caller.
  const { data: booking } = await service
    .from('bookings')
    .select('checked_in, class_instances(starts_at)')
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
    .maybeSingle()
  if (!booking) return { error: 'Booking not found.' }
  if (booking.checked_in) return { error: null } // idempotent

  const ci = Array.isArray(booking.class_instances) ? booking.class_instances[0] : booking.class_instances
  if (!ci?.starts_at) return { error: 'Class not found.' }

  const win = checkInWindow(ci.starts_at, new Date().toISOString())
  if (win === 'early') return { error: 'Check-in opens 60 minutes before class.' }
  if (win === 'closed') return { error: 'Check-in for this class has closed.' }

  const gate = await assessCheckInEntitlement(supabase, service, { athleteId: user.id, instanceId, boxId: profile.box_id })
  if (gate.status === 'error') return { error: gate.message }
  if (gate.status === 'blocked') return { error: 'Please see the front desk about your membership.' }

  const { error } = await service
    .from('bookings')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  try { await awardConsistency(service, profile.box_id, user.id, new Date().toISOString().slice(0, 10)) }
  catch (e) { console.error('awardConsistency failed (self check-in still succeeded):', e) }

  return { error: null }
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run src/__tests__/self-check-in.integration.test.ts`
Expected: 8/8 PASS.
Then run: `npx vitest run src/__tests__/check-in.integration.test.ts`
Expected: 6/6 PASS (staff flow untouched).

- [ ] **Step 5: Commit**

```bash
git add src/app/checkin/_actions/self-check-in.ts src/__tests__/self-check-in.integration.test.ts
git commit -m "feat(checkin): selfCheckIn action — own booking, window, shared gate (#61 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `setCheckinToken` action (TDD) + settings card + settings wiring

**Files:**
- Create: `src/app/dashboard/settings/_actions/set-checkin-token.ts`
- Test: `src/__tests__/set-checkin-token.integration.test.ts`
- Create: `src/app/dashboard/settings/_components/checkin-qr-card.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Write the failing tests**

`src/__tests__/set-checkin-token.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setCheckinToken } from '@/app/dashboard/settings/_actions/set-checkin-token'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-owner (coach) and never touches the service client', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await setCheckinToken('generate')
  expect(res.error).toMatch(/only owners/i)
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('generate writes a uuid checkin_token to the caller box', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { boxes: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setCheckinToken('generate')
  expect(res.error).toBeNull()
  const arg = svc.builder('boxes').update.mock.calls[0][0]
  expect(arg.checkin_token).toMatch(/^[0-9a-f-]{36}$/)
  expect(svc.builder('boxes').eq).toHaveBeenCalledWith('id', 'b1')
})

test('disable nulls the checkin_token, box-scoped', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { boxes: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setCheckinToken('disable')
  expect(res.error).toBeNull()
  expect(svc.builder('boxes').update.mock.calls[0][0]).toEqual({ checkin_token: null })
  expect(svc.builder('boxes').eq).toHaveBeenCalledWith('id', 'b1')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/set-checkin-token.integration.test.ts`
Expected: FAIL — cannot resolve the action module.

- [ ] **Step 3: Implement the action**

`src/app/dashboard/settings/_actions/set-checkin-token.ts`:

```ts
'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function setCheckinToken(action: 'generate' | 'disable'): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage door check-in.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()
  const checkin_token = action === 'generate' ? crypto.randomUUID() : null
  const { error } = await service.from('boxes').update({ checkin_token }).eq('id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/__tests__/set-checkin-token.integration.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Create the settings card**

`src/app/dashboard/settings/_components/checkin-qr-card.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { setCheckinToken } from '../_actions/set-checkin-token'

const btn: React.CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)',
  background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)',
  cursor: 'pointer', fontFamily: 'inherit',
}

export function CheckinQrCard({ link }: { link: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)

  function act(action: 'generate' | 'disable') {
    start(async () => {
      const res = await setCheckinToken(action)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }
  function copy() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>Door check-in QR</div>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 4, lineHeight: 1.5 }}>
        Members scan a printed QR at the door to check themselves into booked classes (opens 60 min before class). Regenerate to invalidate old posters and shared links.
      </p>
      {link ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1, height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface-alt)', color: 'var(--c-ink-2)', fontSize: 12.5, fontFamily: 'var(--font-geist-mono, monospace)' }} />
            <button type="button" onClick={copy} style={btn}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Link href="/dashboard/settings/checkin-poster" style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: 'var(--circle-lime)', border: 'none', color: 'var(--circle-ink)', fontWeight: 700 }}>Print poster</Link>
            <button type="button" disabled={pending} onClick={() => act('generate')} style={btn}>Regenerate</button>
            <button type="button" disabled={pending} onClick={() => act('disable')} style={{ ...btn, color: 'var(--c-danger)' }}>Disable</button>
          </div>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => act('generate')} style={{ ...btn, marginTop: 12, background: 'var(--circle-lime)', border: 'none', color: 'var(--circle-ink)', fontWeight: 700 }}>Enable door check-in</button>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire it into the settings page**

In `src/app/dashboard/settings/page.tsx`:

(a) Add the import after the `TvDisplayCard` import (line 5):

```ts
import { CheckinQrCard } from './_components/checkin-qr-card'
```

(b) Add `checkin_token` to the box select (line 19):

```ts
      .select('trn, legal_name, billing_address, tv_token, checkin_token, booking_close_minutes, late_cancel_hours')
```

(c) Directly under the `<TvDisplayCard …/>` line (line 67), add:

```tsx
            <CheckinQrCard link={box?.checkin_token ? `${env.NEXT_PUBLIC_APP_URL}/checkin/${box.checkin_token}` : null} />
```

- [ ] **Step 7: Verify gates**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/settings/_actions/set-checkin-token.ts src/__tests__/set-checkin-token.integration.test.ts src/app/dashboard/settings/_components/checkin-qr-card.tsx src/app/dashboard/settings/page.tsx
git commit -m "feat(checkin): owner token action + settings card (#61 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `/checkin/[token]` page + check-in button + login redirect prop

**Files:**
- Modify: `src/app/[gymSlug]/_components/gym-login-form.tsx` (three small edits)
- Create: `src/app/checkin/_components/check-in-button.tsx`
- Create: `src/app/checkin/[token]/page.tsx`

- [ ] **Step 1: Add the `redirectTo` prop to GymLoginForm**

In `src/app/[gymSlug]/_components/gym-login-form.tsx`:

(a) Change the signature (line 7):

```tsx
export function GymLoginForm({ gymName, gymSlug, redirectTo }: { gymName: string; gymSlug: string; redirectTo?: string }) {
```

(b) In `handleSignIn`, change the success redirect (line 27):

```ts
      window.location.href = redirectTo ?? `/join/${gymSlug}`
```

(c) In `handleVerifyCode`, change the success redirect (line 53):

```ts
      window.location.href = redirectTo ?? `/join/${gymSlug}`
```

(No other changes — default behavior is identical.)

- [ ] **Step 2: Create the check-in button**

`src/app/checkin/_components/check-in-button.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { selfCheckIn } from '../_actions/self-check-in'

export function CheckInButton({ instanceId }: { instanceId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onCheckIn() {
    setError(null)
    start(async () => {
      const res = await selfCheckIn(instanceId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button onClick={onCheckIn} disabled={pending} style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
        {pending ? 'Checking in…' : 'Check in'}
      </button>
      {error && <p style={{ fontSize: 12, color: 'var(--c-danger)', margin: 0, textAlign: 'right' }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Create the page**

`src/app/checkin/[token]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { GymLoginForm } from '@/app/[gymSlug]/_components/gym-login-form'
import { CircleMark } from '@/components/circle-mark'
import { checkInWindow } from '@/lib/self-checkin'
import { CheckInButton } from '../_components/check-in-button'

export const dynamic = 'force-dynamic'

// Gulf timezones have no DST — a fixed-offset map is the house convention (see /tv/[token]).
const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}

function localTime(iso: string, offsetHours: number): string {
  return new Date(new Date(iso).getTime() + offsetHours * 3_600_000).toISOString().slice(11, 16)
}

type BookingRow = {
  class_instance_id: string
  checked_in: boolean
  class_instances: { starts_at: string; status: string; class_templates: { name: string } | { name: string }[] | null } | { starts_at: string; status: string; class_templates: { name: string } | { name: string }[] | null }[] | null
}

function Shell({ boxName, children }: { boxName: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)', display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 26, fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 17, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-ink)' }}>
          <CircleMark size={22} />
          <span>{boxName}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

export default async function CheckinPage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // Token resolution has no session yet → service role; everything after is box-scoped.
  const service = createServiceClient()
  const { data: box } = await service
    .from('boxes')
    .select('id, name, slug, timezone')
    .eq('checkin_token', token)
    .maybeSingle()
  if (!box) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return <GymLoginForm gymName={box.name} gymSlug={box.slug ?? ''} redirectTo={`/checkin/${token}`} />
  }

  const { data: profile } = await supabase.from('profiles').select('box_id, full_name').eq('id', user.id).single()
  if (!profile || profile.box_id !== box.id) {
    return (
      <Shell boxName={box.name}>
        <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 24, color: 'var(--c-ink)', marginBottom: 8 }}>Wrong gym</h1>
        <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>This QR belongs to another gym.</p>
      </Shell>
    )
  }

  // "Today" = the box-timezone calendar day (fixed Gulf offsets, no DST).
  const offset = TIMEZONE_OFFSETS[box.timezone ?? 'Asia/Dubai'] ?? 4
  const localDay = new Date(Date.now() + offset * 3_600_000).toISOString().slice(0, 10)
  const dayStartUtc = new Date(new Date(`${localDay}T00:00:00Z`).getTime() - offset * 3_600_000).toISOString()
  const dayEndUtc = new Date(new Date(`${localDay}T00:00:00Z`).getTime() - offset * 3_600_000 + 24 * 3_600_000).toISOString()

  const { data: rows } = await supabase
    .from('bookings')
    .select('class_instance_id, checked_in, class_instances!inner(starts_at, status, class_templates(name))')
    .eq('athlete_id', user.id)
    .eq('box_id', box.id)
    .neq('class_instances.status', 'cancelled')
    .gte('class_instances.starts_at', dayStartUtc)
    .lt('class_instances.starts_at', dayEndUtc)

  const nowIso = new Date().toISOString()
  const bookings = ((rows ?? []) as BookingRow[])
    .map((r) => {
      const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
      if (!ci) return null
      const t = Array.isArray(ci.class_templates) ? ci.class_templates[0] : ci.class_templates
      return { instanceId: r.class_instance_id, checkedIn: r.checked_in, startsAt: ci.starts_at, name: t?.name ?? 'Class', window: checkInWindow(ci.starts_at, nowIso) }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

  return (
    <Shell boxName={box.name}>
      <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 26, letterSpacing: '-0.02em', color: 'var(--c-ink)', marginBottom: 4 }}>
        Hi {profile.full_name?.split(' ')[0] ?? 'there'} 👋
      </h1>
      <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginBottom: 22 }}>Tap to check into today&apos;s class.</p>

      {bookings.length === 0 ? (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '28px 22px', textAlign: 'center' }}>
          <p style={{ fontSize: 14.5, color: 'var(--c-ink)', fontWeight: 600, marginBottom: 6 }}>Nothing booked today</p>
          <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Book a class first, then scan again to check in.</p>
          <Link href="/dashboard/schedule" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 10, background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Book a class</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bookings.map((b) => (
            <div key={b.instanceId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '16px 18px' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-ink)' }}>{b.name}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginTop: 2 }}>{localTime(b.startsAt, offset)}</div>
              </div>
              {b.checkedIn ? (
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>✓ Checked in</span>
              ) : b.window === 'open' ? (
                <CheckInButton instanceId={b.instanceId} />
              ) : b.window === 'early' ? (
                <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>Opens at {localTime(new Date(new Date(b.startsAt).getTime() - 60 * 60_000).toISOString(), offset)}</span>
              ) : (
                <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>Closed</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
```

- [ ] **Step 4: Verify gates**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run lint`
Expected: 0 errors.
Run: `npx vitest run`
Expected: all pass (805 = 788 + 6 window + 8 self-check-in + 3 token).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[gymSlug]/_components/gym-login-form.tsx" src/app/checkin/_components/check-in-button.tsx "src/app/checkin/[token]/page.tsx"
git commit -m "feat(checkin): /checkin/[token] member page + login redirect (#61 T6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Printable poster page

**Files:**
- Create: `src/app/dashboard/settings/checkin-poster/page.tsx`

- [ ] **Step 1: Create the poster page**

`src/app/dashboard/settings/checkin-poster/page.tsx`:

```tsx
import QRCode from 'qrcode'
import { notFound } from 'next/navigation'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { env } from '@/env'

export default async function CheckinPosterPage() {
  const { supabase, profile, box } = await requireOwnerPage()

  const { data: boxRow } = await supabase.from('boxes').select('checkin_token').eq('id', profile.box_id).single()
  if (!boxRow?.checkin_token) notFound()

  const url = `${env.NEXT_PUBLIC_APP_URL}/checkin/${boxRow.checkin_token}`
  const qr = await QRCode.toDataURL(url, { width: 560, margin: 1 })

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-geist-sans)' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', color: '#111', marginBottom: 6 }}>{box.name}</div>
        <div style={{ fontSize: 19, color: '#555', marginBottom: 28 }}>Scan to check in</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Check-in QR code" width={420} height={420} style={{ display: 'block', margin: '0 auto' }} />
        <div className="mono" style={{ fontSize: 12, color: '#999', marginTop: 26 }}>Open your phone camera and point it here</div>
        <p style={{ fontSize: 12, color: '#bbb', marginTop: 34 }}>Print this page (Ctrl/Cmd+P) and tape it at the door. Regenerating the link in Settings invalidates this poster.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify gates**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run lint`
Expected: 0 errors (the inline eslint-disable covers the data-URL `<img>`).

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/settings/checkin-poster/page.tsx
git commit -m "feat(checkin): printable door poster with QR (#61 T7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Final gate, apply migration 056, roadmap, push

**Files:**
- Modify: `GymGlofox.md` (line 211)

- [ ] **Step 1: Full gate**

Run each separately and READ the output:

```bash
npm run type-check
npm run lint
npx vitest run
npm run build
```

Expected: 0 type errors, 0 lint errors, 805 tests pass, build succeeds (new routes `/checkin/[token]`, `/dashboard/settings/checkin-poster` listed).

- [ ] **Step 2: Apply migration 056 to prod**

Docker psql, Session-pooler URL from `docs/runbooks/deploy-pass-2026-06-11.md` Step 3 (password held by Walid — NEVER in a committed file):

```bash
docker run --rm -i postgres:17 psql "<SESSION_POOLER_URL>" -v ON_ERROR_STOP=1 < migrations/056_checkin_token.sql
```

Then probe:

```bash
docker run --rm postgres:17 psql "<SESSION_POOLER_URL>" -tc "SELECT count(*) FROM information_schema.columns WHERE table_name='boxes' AND column_name='checkin_token'"
```

Expected: `1`.

- [ ] **Step 3: Roadmap update**

In `GymGlofox.md` line 211, replace:

```markdown
61. ⬜ `[G-gap]` QR / barcode self check-in
```

with:

```markdown
61. ✅ `[G-gap]` **QR self check-in** — printed door QR encodes `/checkin/<token>` (rotatable `boxes.checkin_token`, mig 056, tv_token pattern; settings card + printable poster via `qrcode` dep). Member scans with their phone → logs in (GymLoginForm `redirectTo` prop) → today's bookings with per-class states (✓ / Check in / opens at / closed); `selfCheckIn` enforces own-booking, −60/+30 min window, and the SAME entitlement gate as staff check-in — extracted to `src/lib/checkin-entitlement.ts` (paid via household primary OR credit-backed booking); blocked → "see the front desk" (staff override unchanged). No booking → link to `/dashboard/schedule`. Kiosk/badge scanning, book+check-in fusion, notifications deferred. Spec `…qr-checkin-design.md`.
```

- [ ] **Step 4: Commit and push**

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #61 QR self check-in shipped — mig 056 applied

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Push auto-deploys to Vercel. Report: poster printable at `/dashboard/settings/checkin-poster` once the owner enables door check-in in Settings.
