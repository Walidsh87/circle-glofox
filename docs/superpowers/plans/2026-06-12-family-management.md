# Family Management (#84) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "My family" card on the own profile + household members booking/cancelling classes for each other — per `docs/superpowers/specs/2026-06-12-family-management-design.md`.

**Architecture:** A `resolveBookingTarget` rail (same-household, athlete-only) widens `bookClass`/`cancelBooking` with an optional target; self paths stay bit-identical. **RLS subtlety that shapes the code:** athletes can only insert/delete their OWN booking rows, so on-behalf writes go through the service client (the credit path already does). UI is additive: a FamilyBookingRow under the untouched BookingButton; the FamilyCard reuses the member page's existing household fetches by widening two `isManager` ternaries. **No migration.**

**Tech Stack:** Next.js 16 server actions, Supabase RLS + service role, Ivory & Lime primitives, Vitest mock queues.

**House rules:** commits direct to `main`, `--no-verify -q`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `&&`-chain piped gates with commits. Suite is 954 green before this plan.

---

## File map

| File | Action |
|---|---|
| `src/lib/family.ts` | Create (resolveBookingTarget) |
| `src/__tests__/family.test.ts` | Create (5) |
| `src/app/dashboard/schedule/_actions/book-class.ts` | Modify (on-behalf) |
| `src/app/dashboard/schedule/_actions/cancel-booking.ts` | Modify (on-behalf) |
| `src/__tests__/family-booking.integration.test.ts` | Create (5) |
| `src/app/dashboard/members/[memberId]/_components/family-card.tsx` | Create |
| `src/app/dashboard/members/[memberId]/page.tsx` | Modify (ternary widen + mount) |
| `src/app/dashboard/schedule/_components/family-booking-row.tsx` | Create |
| `src/app/dashboard/schedule/page.tsx` | Modify (co-members fetch + render) |
| `GymGlofox.md` | Modify (#84 → ✅) |

---

### Task 1: `resolveBookingTarget` rail (TDD)

**Files:**
- Create: `src/lib/family.ts`
- Test: `src/__tests__/family.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/family.test.ts
import { describe, test, expect } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { resolveBookingTarget } from '@/lib/family'
import type { SupabaseClient } from '@supabase/supabase-js'

const asClient = (m: ReturnType<typeof makeSupabaseMock>) => m as unknown as SupabaseClient

describe('resolveBookingTarget', () => {
  test('defaults to self without a target (no queries)', async () => {
    const mock = makeSupabaseMock({})
    expect(await resolveBookingTarget(asClient(mock), 'a1', null)).toEqual({ targetId: 'a1' })
    expect(mock.from).not.toHaveBeenCalled()
  })

  test('explicit self short-circuits', async () => {
    const mock = makeSupabaseMock({})
    expect(await resolveBookingTarget(asClient(mock), 'a1', 'a1')).toEqual({ targetId: 'a1' })
  })

  test('caller without a household is rejected', async () => {
    const mock = makeSupabaseMock({ results: { profiles: { data: { household_id: null }, error: null } } })
    expect(await resolveBookingTarget(asClient(mock), 'a1', 'a2'))
      .toEqual({ error: 'You are not part of a household.' })
  })

  test('target outside the household (or missing, or non-athlete) is rejected', async () => {
    const other = makeSupabaseMock({ results: { profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h2', role: 'athlete' }, error: null },
    ] } })
    expect(await resolveBookingTarget(asClient(other), 'a1', 'a2'))
      .toEqual({ error: 'That member is not in your household.' })

    const staff = makeSupabaseMock({ results: { profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h1', role: 'coach' }, error: null },
    ] } })
    expect(await resolveBookingTarget(asClient(staff), 'a1', 'a2'))
      .toEqual({ error: 'That member is not in your household.' })
  })

  test('same-household athlete resolves', async () => {
    const mock = makeSupabaseMock({ results: { profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h1', role: 'athlete' }, error: null },
    ] } })
    expect(await resolveBookingTarget(asClient(mock), 'a1', 'a2')).toEqual({ targetId: 'a2' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/family.test.ts`
Expected: FAIL — cannot resolve `@/lib/family`.

- [ ] **Step 3: Implement**

```ts
// src/lib/family.ts
// #84 on-behalf booking rail: a different target must be an athlete in the
// caller's own household. Self passes through with zero queries.
import type { SupabaseClient } from '@supabase/supabase-js'

export type BookingTarget = { targetId: string } | { error: string }

export async function resolveBookingTarget(
  supabase: SupabaseClient,
  userId: string,
  forAthleteId: string | null | undefined,
): Promise<BookingTarget> {
  if (!forAthleteId || forAthleteId === userId) return { targetId: userId }

  const { data: own } = await supabase.from('profiles').select('household_id').eq('id', userId).single()
  if (!own?.household_id) return { error: 'You are not part of a household.' }

  const { data: target } = await supabase.from('profiles').select('household_id, role').eq('id', forAthleteId).maybeSingle()
  if (!target || target.household_id !== own.household_id || target.role !== 'athlete') {
    return { error: 'That member is not in your household.' }
  }
  return { targetId: forAthleteId }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/__tests__/family.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/family.ts src/__tests__/family.test.ts
git commit --no-verify -q -m "feat(family): same-household booking-target rail (#84 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `bookClass` on-behalf (TDD with Task 3's test file)

**Files:**
- Modify: `src/app/dashboard/schedule/_actions/book-class.ts`
- Test: `src/__tests__/family-booking.integration.test.ts` (create — covers Tasks 2+3)

- [ ] **Step 1: Write the failing tests (both actions' on-behalf cases)**

```ts
// src/__tests__/family-booking.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendWaitlistEmail: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendPushTo: vi.fn(async () => 0) }))

import { bookClass } from '@/app/dashboard/schedule/_actions/book-class'
import { cancelBooking } from '@/app/dashboard/schedule/_actions/cancel-booking'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

const FUTURE = new Date(Date.now() + 48 * 3600_000).toISOString()

test('bookClass rejects a target outside the household and books nothing', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: [
      { data: { household_id: 'h1' }, error: null },                  // rail: own
      { data: { household_id: 'h2', role: 'athlete' }, error: null }, // rail: target
    ],
  } }))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await bookClass('ci1', 'a2')
  expect(res.error).toBe('That member is not in your household.')
  expect(svc.builder('bookings')).toBeUndefined()
})

test('bookClass books the dependent via the service client (membership path)', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: [
      { data: { household_id: 'h1' }, error: null },                          // rail: own
      { data: { household_id: 'h1', role: 'athlete' }, error: null },         // rail: target
      { data: { box_id: 'b1', household_id: 'h1' }, error: null },            // target profile
    ],
    class_instances: { data: { capacity: 12, box_id: 'b1', starts_at: FUTURE, boxes: { booking_close_minutes: 0 } }, error: null },
    households: { data: { primary_athlete_id: 'a1' }, error: null },
  } }))
  const svc = makeSupabaseMock({ results: {
    bookings: [
      { data: null, error: null, count: 3 },  // capacity count
      { data: null, error: null },            // on-behalf insert (service)
    ],
    memberships: { data: [{ payment_status: 'paid', end_date: null, frozen_from: null, frozen_until: null }], error: null },
    package_credits: { data: [], error: null },
    class_waitlist: { data: null, error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await bookClass('ci1', 'a2')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'a2', box_id: 'b1' }))
  expect(svc.builder('class_waitlist').eq).toHaveBeenCalledWith('athlete_id', 'a2')
})

test('bookClass keys the credit lookup to the target', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h1', role: 'athlete' }, error: null },
      { data: { box_id: 'b1', household_id: 'h1' }, error: null },
    ],
    class_instances: { data: { capacity: 12, box_id: 'b1', starts_at: FUTURE, boxes: { booking_close_minutes: 0 } }, error: null },
    households: { data: { primary_athlete_id: 'a1' }, error: null },
  } }))
  const svc = makeSupabaseMock({ results: {
    bookings: { data: null, error: null, count: 3 },
    memberships: { data: [], error: null },        // not paid → credit path
    package_credits: { data: [], error: null },    // no credits either
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await bookClass('ci1', 'a2')
  expect(res.needsCredits).toBe(true)
  expect(svc.builder('package_credits').eq).toHaveBeenCalledWith('athlete_id', 'a2')
})

test('cancelBooking rejects a non-household target', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: { data: { household_id: null }, error: null },
  } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await cancelBooking('ci1', 'a2')
  expect(res.error).toBe('You are not part of a household.')
})

test('cancelBooking deletes the dependent booking via the service client', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: [
      { data: { household_id: 'h1' }, error: null },
      { data: { household_id: 'h1', role: 'athlete' }, error: null },
    ],
    class_instances: { data: { starts_at: FUTURE, boxes: { late_cancel_hours: 0 } }, error: null },
    class_waitlist: { data: [], error: null }, // promotion scan finds nobody
  } }))
  const svc = makeSupabaseMock({ results: {
    bookings: [
      { data: { credit_id: null }, error: null }, // on-behalf lookup
      { data: null, error: null },                // delete
    ],
    class_waitlist: { data: [], error: null },
    class_instances: { data: { capacity: 12, starts_at: FUTURE }, error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await cancelBooking('ci1', 'a2')
  expect(res.error).toBeNull()
  expect(svc.builder('bookings').delete).toHaveBeenCalled()
  expect(svc.builder('bookings').eq).toHaveBeenCalledWith('athlete_id', 'a2')
})
```

(The cancel happy-path mock may need adjustment against the real waitlist-promotion reads — run, READ the failure, align the queue; the promotion block's queries are on the service client.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/family-booking.integration.test.ts`
Expected: FAIL — actions don't accept a second argument / rail errors absent.

- [ ] **Step 3: Modify `bookClass`**

Add import:

```ts
import { resolveBookingTarget } from '@/lib/family'
```

Change the signature and resolve the target right after auth:

```ts
export async function bookClass(instanceId: string, forAthleteId?: string): Promise<BookResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const targetRes = await resolveBookingTarget(supabase, user.id, forAthleteId ?? null)
  if ('error' in targetRes) return { error: targetRes.error }
  const targetId = targetRes.targetId
  const onBehalf = targetId !== user.id
```

Then swap the booking identity through the body:
- profile fetch: `.eq('id', user.id)` → `.eq('id', targetId)` (entitlement resolves through the TARGET's household — same primary by the rail).
- `let billingAthleteId = user.id` → `let billingAthleteId = targetId`
- credit lookup: `.eq('athlete_id', user.id)` → `.eq('athlete_id', targetId)`
- membership-path insert — RLS only allows own-row inserts, so on-behalf goes through the service client:

```ts
  if (decision.kind === 'membership') {
    // RLS lets athletes insert only their OWN row — on-behalf rides the service
    // client (target already validated by the household rail).
    const inserter = onBehalf ? service : supabase
    const { error } = await inserter.from('bookings').insert({
      box_id: profile.box_id,
      class_instance_id: instanceId,
      athlete_id: targetId,
    })
```

- credit-path insert: `athlete_id: user.id` → `athlete_id: targetId`
- both waitlist deletes: `.eq('athlete_id', user.id)` → `.eq('athlete_id', targetId)`

- [ ] **Step 4: Modify `cancelBooking`**

Add import:

```ts
import { resolveBookingTarget } from '@/lib/family'
```

Signature + rail + reader selection (the RLS client cannot see/delete a dependent's row):

```ts
export async function cancelBooking(instanceId: string, forAthleteId?: string): Promise<{ error: string | null; forfeited?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const targetRes = await resolveBookingTarget(supabase, user.id, forAthleteId ?? null)
  if ('error' in targetRes) return { error: targetRes.error }
  const targetId = targetRes.targetId
  const onBehalf = targetId !== user.id
  if (onBehalf && !process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  // RLS scopes reads/deletes to the caller's own bookings — on-behalf needs the service client.
  const db = onBehalf ? createServiceClient() : supabase
```

Then the lookup and delete use `db` + `targetId`:

```ts
  const { data: booking } = await db
    .from('bookings')
    .select('credit_id')
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', targetId)
    .maybeSingle()

  const { error } = await db
    .from('bookings')
    .delete()
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', targetId)
  if (error) return { error: error.message }
```

Everything after (late-cancel policy fetch, refund branch with its own service client, waitlist promotion) stays untouched.

- [ ] **Step 5: Run to verify pass, then the existing booking suites**

Run: `npx vitest run src/__tests__/family-booking.integration.test.ts`
Expected: 5 passed (align the cancel happy-path queue if the promotion reads consume differently — READ the failure).
Run: `npx vitest run src/__tests__/book-class.integration.test.ts src/__tests__/cancel-booking.integration.test.ts`
Expected: all pass — self paths bit-identical.

- [ ] **Step 6: Commit**

```bash
git add src/lib/family.ts src/app/dashboard/schedule/_actions src/__tests__/family-booking.integration.test.ts
git commit --no-verify -q -m "feat(family): on-behalf booking + cancel for household members (#84 T2-T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: FamilyCard on the own profile

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/family-card.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

- [ ] **Step 1: Create the card**

```tsx
// src/app/dashboard/members/[memberId]/_components/family-card.tsx
import { Badge } from '@/components/ui/badge'

type Member = { id: string; full_name: string | null }

export function FamilyCard({ householdName, members, primaryId, selfId }: {
  householdName: string
  members: Member[]
  primaryId: string
  selfId: string
}) {
  const primaryName = members.find((m) => m.id === primaryId)?.full_name ?? 'the primary member'
  return (
    <div>
      <div className="mb-2 text-[13.5px] font-semibold text-ink">{householdName}</div>
      <div className="flex flex-col gap-1.5">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-2 border-t border-line pt-1.5 text-[13px] text-ink-2">
            <span>{m.full_name ?? 'Member'}</span>
            {m.id === primaryId && <Badge tone="ok">pays</Badge>}
            {m.id === selfId && <Badge tone="neutral">you</Badge>}
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-ink-3">Covered by {primaryName}&apos;s membership.</p>
    </div>
  )
}
```

- [ ] **Step 2: Wire the member page**

Import next to the other cards:

```ts
import { FamilyCard } from './_components/family-card'
```

In the second `Promise.all` round, widen the two household ternaries (currently `isManager && member.household_id ? … : …`) to:

```ts
    (isManager || isSelf) && member.household_id
```

(both the `household` fetch and the `householdMembers` fetch; the `allHouseholds` ternary stays `isManager`).

Mount after the Membership Section (before Agreements):

```tsx
        {isSelf && viewer.role === 'athlete' && member.household_id && household && (
          <Section label="My family">
            <FamilyCard
              householdName={household.name}
              members={(householdMembers ?? []) as { id: string; full_name: string | null }[]}
              primaryId={household.primary_athlete_id}
              selfId={user.id}
            />
          </Section>
        )}
```

(Check the actual `household`/`householdMembers` select columns at the widened ternaries — `household` carries `id, name, primary_athlete_id` for the HouseholdCard already; if `householdMembers` selects more than `id, full_name`, the cast above still fits.)

- [ ] **Step 3: Verify and commit**

Run: `npm run type-check` — 0 errors. Run: `npm run lint` — clean. Then:

```bash
git add "src/app/dashboard/members/[memberId]"
git commit --no-verify -q -m "feat(family): My-family card on own profile (#84 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: FamilyBookingRow on the schedule

**Files:**
- Create: `src/app/dashboard/schedule/_components/family-booking-row.tsx`
- Modify: `src/app/dashboard/schedule/page.tsx`

- [ ] **Step 1: Create the row (client)**

```tsx
// src/app/dashboard/schedule/_components/family-booking-row.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { bookClass } from '../_actions/book-class'
import { cancelBooking } from '../_actions/cancel-booking'

type FamilyMember = { id: string; name: string; booked: boolean }

export function FamilyBookingRow({ instanceId, members }: { instanceId: string; members: FamilyMember[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(m: FamilyMember) {
    setBusyId(m.id)
    setError(null)
    const res = m.booked ? await cancelBooking(instanceId, m.id) : await bookClass(instanceId, m.id)
    if ('needsCredits' in res && res.needsCredits) setError(`${m.name} needs a class credit.`)
    else if (res.error) setError(res.error)
    else router.refresh()
    setBusyId(null)
  }

  return (
    <div className="mt-1 flex flex-col items-end gap-0.5">
      {members.map((m) => (
        <button
          key={m.id}
          onClick={() => toggle(m)}
          disabled={busyId !== null}
          className="font-mono text-[11px] text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          {busyId === m.id ? '…' : `${m.name}: ${m.booked ? 'Cancel' : 'Book'}`}
        </button>
      ))}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Wire the schedule page**

Import:

```ts
import { FamilyBookingRow } from './_components/family-booking-row'
import { rosterFirstNames } from '@/lib/roster'
```

(`rosterFirstNames` is already imported — only add FamilyBookingRow.)

After the existing `Promise.all` block, fetch household co-members (athletes only, excluding self):

```ts
  // Family (#84): co-members this athlete can book for.
  let coMembers: { id: string; name: string }[] = []
  const { data: meHh } = await supabase.from('profiles').select('household_id').eq('id', user.id).single()
  if (meHh?.household_id) {
    const { data: fam } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('household_id', meHh.household_id)
      .neq('id', user.id)
    coMembers = ((fam ?? []) as { id: string; full_name: string | null; role: string }[])
      .filter((f) => f.role === 'athlete')
      .map((f) => ({ id: f.id, name: (f.full_name ?? 'Member').split(' ')[0] }))
  }
```

In the instance row, under the `BookingButton` IIFE (inside the same `shrink-0` div — wrap its content in a flex column):

```tsx
                      <div className="flex shrink-0 flex-col items-end">
                        {(() => {
                          const entries = waitlistByInstance.get(instance.id) ?? []
                          const pos = waitlistPosition(entries, user.id)
                          return <BookingButton instanceId={instance.id} isBooked={isBooked} isFull={isFull} isWaitlisted={pos !== null} waitlistPosition={pos} />
                        })()}
                        {coMembers.length > 0 && !isFull && (
                          <FamilyBookingRow
                            instanceId={instance.id}
                            members={coMembers.map((m) => ({
                              ...m,
                              booked: (bookings ?? []).some((b) => b.athlete_id === m.id),
                            }))}
                          />
                        )}
                      </div>
```

(This replaces the existing `<div className="shrink-0">…</div>` wrapper around the BookingButton IIFE.)

- [ ] **Step 3: Verify and commit**

Run: `npm run type-check` — 0 errors. Run: `npm run lint` — clean. Run: `npx vitest run` — 964 passed (READ the number). Then:

```bash
git add src/app/dashboard/schedule
git commit --no-verify -q -m "feat(family): book/cancel for household members on the schedule (#84 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Final gate, roadmap, push

- [ ] **Step 1: Full gate — each SEPARATELY, READ output**

```bash
npm run type-check
```
```bash
npm run lint
```
```bash
npx vitest run
```
Expected: 964 passed (954 + 10), 0 failed.
```bash
npm run build
```

- [ ] **Step 2: Roadmap + push (no migration)**

Flip `GymGlofox.md` item 84 to ✅ (entry: My-family card via widened household fetches; `resolveBookingTarget` same-household rail; bookClass/cancelBooking optional target — on-behalf writes ride the service client because RLS only allows own-row booking writes; credits stay per-person, billing unchanged (same primary by the rail); FamilyBookingRow under the untouched BookingButton; deferred: kid no-email accounts, family waitlist, multi-book, pack-buying for dependents). Then:

```bash
git add GymGlofox.md
git commit --no-verify -q -m "docs(roadmap): #84 family management shipped

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Manual smoke after deploy: staff links two test accounts into a household → primary's schedule shows "Sara: Book" under bookable classes → book → roster shows her → cancel; the My-family card lists both with "pays"/"you" chips.
