# Class Waitlist + Auto-Notify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Athletes join a waitlist when a class is full; a cancellation emails the next person in line to come book. No auto-promote, no held reservation.

**Architecture:** A `class_waitlist` table (migration 031) + `joinWaitlist`/`leaveWaitlist` actions. `cancelBooking` gains a best-effort hook that emails the earliest waitlister (`sendWaitlistEmail` via the existing Resend wrapper). `bookClass` removes the booker's waitlist row. The schedule UI shows join/leave + position. Pure `nextInLine`/`waitlistPosition` helpers.

**Tech Stack:** Next.js 16 server actions, Supabase RLS + service-role clients, Resend, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-08-class-waitlist-design.md`.

**Conventions reused (read once):**
- Capacity-count + service-role pattern + entitlement: `src/app/dashboard/schedule/_actions/book-class.ts`. Cancel + refund: `cancel-booking.ts`. Resend wrapper + helpers: `src/lib/email.ts`. Booking UI: `_components/booking-button.tsx`, `schedule/page.tsx`.
- Tests FLAT in `src/__tests__/`. Dual-client harness: `src/__tests__/cancel-booking.integration.test.ts`. Mock: `helpers/supabase-mock.ts`. `env.NEXT_PUBLIC_APP_URL` from `@/env`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `migrations/031_class_waitlist.sql` | create | `class_waitlist` + RLS |
| `migrations/ROLLBACKS.md` | modify | `### 031_class_waitlist` |
| `src/app/dashboard/schedule/_lib/waitlist.ts` | create, pure | `nextInLine`, `waitlistPosition` |
| `src/__tests__/waitlist.test.ts` | create | pure tests |
| `src/lib/email.ts` | modify | `sendWaitlistEmail` |
| `src/app/dashboard/schedule/_actions/join-waitlist.ts` | create, DB | `joinWaitlist` |
| `src/app/dashboard/schedule/_actions/leave-waitlist.ts` | create, DB | `leaveWaitlist` |
| `src/__tests__/join-waitlist.integration.test.ts` | create | join/leave tests |
| `src/app/dashboard/schedule/_actions/cancel-booking.ts` | modify | notify-#1 hook |
| `src/app/dashboard/schedule/_actions/book-class.ts` | modify | remove waitlist row on book |
| `src/__tests__/cancel-booking.integration.test.ts` | modify | notify assertions |
| `src/app/dashboard/schedule/_components/booking-button.tsx` | modify | join/leave UI |
| `src/app/dashboard/schedule/page.tsx` | modify | waitlist load + position |

---

## Task 1: Migration 031 + rollback

**Files:** Create `migrations/031_class_waitlist.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Write the migration**

Create `migrations/031_class_waitlist.sql`:

```sql
-- migrations/031_class_waitlist.sql
-- Waitlist for full classes (#26). One row per athlete per class; the earliest
-- created_at is "next in line". Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS class_waitlist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id            uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  class_instance_id uuid NOT NULL REFERENCES class_instances(id) ON DELETE CASCADE,
  athlete_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_instance_id, athlete_id)
);

ALTER TABLE class_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS box_read_waitlist ON class_waitlist;
CREATE POLICY box_read_waitlist ON class_waitlist
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS athlete_manage_waitlist ON class_waitlist;
CREATE POLICY athlete_manage_waitlist ON class_waitlist
  FOR ALL
  USING (athlete_id = auth.uid() AND box_id = auth_box_id())
  WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE INDEX IF NOT EXISTS idx_class_waitlist_instance ON class_waitlist (class_instance_id, created_at);
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, change the header range `008`–`030` to `008`–`031`. Add this entry immediately above the `### 030_member_outreach` heading:

```markdown
### 031_class_waitlist
```sql
DROP TABLE IF EXISTS class_waitlist;
```

```

- [ ] **Step 3: Commit**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add migrations/031_class_waitlist.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(waitlist): migration 031 — class_waitlist table (box-read + athlete-manage RLS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure waitlist helpers

**Files:** Create `src/app/dashboard/schedule/_lib/waitlist.ts`; Test `src/__tests__/waitlist.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/waitlist.test.ts`:

```ts
import { nextInLine, waitlistPosition } from '@/app/dashboard/schedule/_lib/waitlist'

const e = (id: string, at: string) => ({ athlete_id: id, created_at: at })

describe('nextInLine', () => {
  test('returns the earliest entry', () => {
    expect(nextInLine([e('b', '2026-06-02'), e('a', '2026-06-01'), e('c', '2026-06-03')])?.athlete_id).toBe('a')
  })
  test('empty → null', () => {
    expect(nextInLine([])).toBeNull()
  })
})

describe('waitlistPosition', () => {
  const list = [e('b', '2026-06-02'), e('a', '2026-06-01'), e('c', '2026-06-03')]
  test('1-based rank by created_at', () => {
    expect(waitlistPosition(list, 'a')).toBe(1)
    expect(waitlistPosition(list, 'b')).toBe(2)
    expect(waitlistPosition(list, 'c')).toBe(3)
  })
  test('absent → null', () => {
    expect(waitlistPosition(list, 'z')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- waitlist`
Expected: FAIL — module doesn't exist. (Note: `-- waitlist` also matches `join-waitlist` later; here only this file exists.)

- [ ] **Step 3: Implement**

Create `src/app/dashboard/schedule/_lib/waitlist.ts`:

```ts
export type WaitlistEntry = { athlete_id: string; created_at: string }

// Earliest entry = next in line (null if empty).
export function nextInLine(entries: WaitlistEntry[]): WaitlistEntry | null {
  let earliest: WaitlistEntry | null = null
  for (const e of entries) {
    if (!earliest || e.created_at < earliest.created_at) earliest = e
  }
  return earliest
}

// 1-based rank of `athleteId` among `entries` (by created_at asc); null if absent.
export function waitlistPosition(entries: WaitlistEntry[], athleteId: string): number | null {
  const mine = entries.find((e) => e.athlete_id === athleteId)
  if (!mine) return null
  let rank = 1
  for (const e of entries) {
    if (e.athlete_id !== athleteId && e.created_at < mine.created_at) rank++
  }
  return rank
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/__tests__/waitlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/schedule/_lib/waitlist.ts src/__tests__/waitlist.test.ts
git commit -m "$(cat <<'EOF'
feat(waitlist): pure nextInLine + waitlistPosition helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: join/leave actions + waitlist email

**Files:** Create `src/app/dashboard/schedule/_actions/join-waitlist.ts`, `leave-waitlist.ts`; Modify `src/lib/email.ts`; Test `src/__tests__/join-waitlist.integration.test.ts`.

- [ ] **Step 1: Add `sendWaitlistEmail` to `src/lib/email.ts`**

Append (the file already has `resend`, `env`, and the `resend.emails.send` pattern):

```ts
export type WaitlistEmailInput = {
  to: string; athleteName: string; className: string; classTime: string; gymName: string; bookUrl: string
}

export async function sendWaitlistEmail(input: WaitlistEmailInput): Promise<{ id: string | null; error: string | null }> {
  const body = `<p>Hi ${input.athleteName},</p>
<p>A spot just opened in <strong>${input.className}</strong> (${input.classTime}) at ${input.gymName}. Spots go fast — book now:</p>
<p><a href="${input.bookUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Book now</a></p>
<p>— ${input.gymName}</p>`
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: `A spot opened in ${input.className} at ${input.gymName}`,
      html: body,
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Write the failing integration tests**

Create `src/__tests__/join-waitlist.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { joinWaitlist } from '@/app/dashboard/schedule/_actions/join-waitlist'
import { leaveWaitlist } from '@/app/dashboard/schedule/_actions/leave-waitlist'

beforeEach(() => vi.clearAllMocks())

function rlsFor(role = 'athlete') {
  return makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      class_instances: { data: { capacity: 12, box_id: 'b1' }, error: null },
      profiles: { data: { box_id: 'b1' }, error: null },
      class_waitlist: { data: null, error: null },
    },
  })
}

test('rejects when the class is not full', async () => {
  serverCreate.mockResolvedValue(rlsFor())
  const svc = makeSupabaseMock({ results: { bookings: { data: [], error: null, count: 5 } } })
  serviceCreate.mockReturnValue(svc)
  const res = await joinWaitlist('c1')
  expect(res.error).toMatch(/isn't full/i)
})

test('rejects when already booked', async () => {
  serverCreate.mockResolvedValue(rlsFor())
  const svc = makeSupabaseMock({ results: { bookings: { data: { id: 'bk1' }, error: null, count: 12 } } })
  serviceCreate.mockReturnValue(svc)
  const res = await joinWaitlist('c1')
  expect(res.error).toMatch(/already booked/i)
})

test('joins when full and not booked', async () => {
  const rls = rlsFor()
  serverCreate.mockResolvedValue(rls)
  const svc = makeSupabaseMock({ results: { bookings: { data: null, error: null, count: 12 } } })
  serviceCreate.mockReturnValue(svc)
  const res = await joinWaitlist('c1')
  expect(res.error).toBeNull()
  const arg = rls.builder('class_waitlist').insert.mock.calls[0][0]
  expect(arg).toEqual(expect.objectContaining({ box_id: 'b1', class_instance_id: 'c1', athlete_id: 'a1' }))
})

test('leaveWaitlist deletes the caller own row', async () => {
  const rls = makeSupabaseMock({ user: { id: 'a1' }, results: { class_waitlist: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await leaveWaitlist('c1')
  expect(res.error).toBeNull()
  expect(rls.builder('class_waitlist').delete).toHaveBeenCalled()
  expect(rls.builder('class_waitlist').eq).toHaveBeenCalledWith('athlete_id', 'a1')
})
```

NOTE: the `bookings` capacity check uses `.select('id', { count: 'exact', head: true })`, so the mock needs `count` on that result — the shared mock's `MockResult` already supports `count`. The "already booked" lookup is a second `bookings` query (`.maybeSingle()`) returning `.data`. Since the mock returns the SAME builder per table, set `bookings` to `{ data: <booking or null>, error: null, count: <n> }` — the count chain reads `count`, the maybeSingle reads `data`.

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -- join-waitlist`
Expected: FAIL — modules don't exist.

- [ ] **Step 4: Implement the actions**

Create `src/app/dashboard/schedule/_actions/join-waitlist.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function joinWaitlist(instanceId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: instance } = await supabase
    .from('class_instances')
    .select('capacity, box_id')
    .eq('id', instanceId)
    .single()
  if (!instance) return { error: 'Class not found.' }

  const { data: profile } = await supabase.from('profiles').select('box_id').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found.' }
  if (instance.box_id !== profile.box_id) return { error: 'Class not found.' }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { count } = await service.from('bookings').select('id', { count: 'exact', head: true }).eq('class_instance_id', instanceId)
  if ((count ?? 0) < instance.capacity) return { error: "This class isn't full — you can book it directly." }

  const { data: existing } = await service.from('bookings').select('id').eq('class_instance_id', instanceId).eq('athlete_id', user.id).maybeSingle()
  if (existing) return { error: "You're already booked." }

  const { error } = await supabase.from('class_waitlist').insert({
    box_id: profile.box_id,
    class_instance_id: instanceId,
    athlete_id: user.id,
  })
  if (error) {
    if (error.code === '23505') return { error: "You're already on the waitlist." }
    return { error: error.message }
  }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
```

Create `src/app/dashboard/schedule/_actions/leave-waitlist.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function leaveWaitlist(instanceId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('class_waitlist')
    .delete()
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test -- join-waitlist`
Expected: PASS — 4 tests green.

- [ ] **Step 6: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/lib/email.ts src/app/dashboard/schedule/_actions/join-waitlist.ts src/app/dashboard/schedule/_actions/leave-waitlist.ts src/__tests__/join-waitlist.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(waitlist): joinWaitlist/leaveWaitlist actions + sendWaitlistEmail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Cancel notify hook + book cleanup

**Files:** Modify `src/app/dashboard/schedule/_actions/cancel-booking.ts`, `book-class.ts`, `src/__tests__/cancel-booking.integration.test.ts`.

- [ ] **Step 1: Add the notify branch to `cancelBooking`**

In `cancel-booking.ts`, add the imports:
```ts
import { sendWaitlistEmail } from '@/lib/email'
import { env } from '@/env'
```
Then, immediately BEFORE the final `revalidatePath('/dashboard/schedule')` / `return { error: null }`, insert the best-effort notify:

```ts
  // A spot just freed → email the next person in line. Best-effort; never fails the cancel.
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { data: next } = await svc
        .from('class_waitlist')
        .select('athlete_id')
        .eq('class_instance_id', instanceId)
        .order('created_at')
        .limit(1)
        .maybeSingle()
      if (next) {
        const { data: athlete } = await svc.from('profiles').select('email, full_name').eq('id', next.athlete_id).single()
        const { data: inst } = await svc.from('class_instances').select('starts_at, class_templates(name), boxes(name, timezone)').eq('id', instanceId).single()
        if (athlete?.email && inst) {
          const tmpl = Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates
          const box = Array.isArray(inst.boxes) ? inst.boxes[0] : inst.boxes
          const classTime = new Intl.DateTimeFormat('en-GB', { timeZone: box?.timezone ?? 'Asia/Dubai', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(inst.starts_at))
          await sendWaitlistEmail({
            to: athlete.email,
            athleteName: athlete.full_name ?? 'there',
            className: tmpl?.name ?? 'your class',
            classTime,
            gymName: box?.name ?? 'your gym',
            bookUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard/schedule`,
          })
        }
      }
    }
  } catch (e) {
    console.error('waitlist notify failed (cancel still succeeded):', e)
  }
```

- [ ] **Step 2: Add the book cleanup to `bookClass`**

In `book-class.ts`, the `service` client is already created. Add a best-effort waitlist removal on BOTH success paths — immediately before each `revalidatePath('/dashboard/schedule'); return { error: null }` (the membership path and the credit path):

```ts
  await service.from('class_waitlist').delete().eq('class_instance_id', instanceId).eq('athlete_id', user.id)
```

(Ignore its result — a missing row is fine; this just removes a waitlister who has now booked.)

- [ ] **Step 3: Extend the cancel-booking tests**

In `src/__tests__/cancel-booking.integration.test.ts`, add the email mock at the top (with the other `vi.mock` calls) and two tests. Add a hoisted `emailMock`:
```ts
const { serverCreate, serviceCreate, emailMock } = vi.hoisted(() => ({
  serverCreate: vi.fn(), serviceCreate: vi.fn(), emailMock: vi.fn(() => Promise.resolve({ id: 'e1', error: null })),
}))
```
Add `vi.mock('@/lib/email', () => ({ sendWaitlistEmail: emailMock }))` next to the other mocks. (The two existing tests still pass: their service mock has no `class_waitlist` row → `maybeSingle` returns `{ data: null }` → notify skipped → `emailMock` not called.)

Add these tests:
```ts
test('a freed spot emails the next waitlister', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'u1' }, results: { bookings: { data: { credit_id: null }, error: null } } }))
  const svc = makeSupabaseMock({
    results: {
      class_waitlist: { data: { athlete_id: 'a2' }, error: null },
      profiles: { data: { email: 'mike@x.com', full_name: 'Mike' }, error: null },
      class_instances: { data: { starts_at: '2026-07-01T06:00:00Z', class_templates: { name: 'Fran' }, boxes: { name: 'Iron Box', timezone: 'Asia/Dubai' } }, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)
  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(emailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mike@x.com', className: 'Fran', gymName: 'Iron Box' }))
})

test('a failing notify never fails the cancel', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'u1' }, results: { bookings: { data: { credit_id: null }, error: null } } }))
  emailMock.mockRejectedValueOnce(new Error('resend down'))
  const svc = makeSupabaseMock({
    results: {
      class_waitlist: { data: { athlete_id: 'a2' }, error: null },
      profiles: { data: { email: 'mike@x.com', full_name: 'Mike' }, error: null },
      class_instances: { data: { starts_at: '2026-07-01T06:00:00Z', class_templates: { name: 'Fran' }, boxes: { name: 'Iron Box', timezone: 'Asia/Dubai' } }, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)
  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
})
```

- [ ] **Step 4: Run + verify**

Run: `npm test -- cancel-booking`
Expected: PASS — the 2 existing + 2 new tests green. (If the existing tests break, the most likely cause is the email mock or the service-mock `class_waitlist` default; ensure existing tests' service mock has no `class_waitlist` result so notify is skipped.)

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm test -- book-class` (if a book-class test exists) → still green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/schedule/_actions/cancel-booking.ts src/app/dashboard/schedule/_actions/book-class.ts src/__tests__/cancel-booking.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(waitlist): cancel emails the next in line + book leaves the waitlist

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Schedule UI (join/leave + position)

**Files:** Modify `src/app/dashboard/schedule/_components/booking-button.tsx`, `src/app/dashboard/schedule/page.tsx`. No new tests (UI; verified by type-check + lint + build).

- [ ] **Step 1: Extend `BookingButton`**

In `booking-button.tsx`:

(a) Add imports + props:
```tsx
import { joinWaitlist } from '../_actions/join-waitlist'
import { leaveWaitlist } from '../_actions/leave-waitlist'
```
Extend the props type with `isWaitlisted: boolean` and `waitlistPosition: number | null`, and destructure them.

(b) Replace the existing **full + not-booked** branch (currently the "Full" span) with:
```tsx
  if (isFull && !isBooked) {
    if (isWaitlisted) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-ink-muted)' }}>On waitlist · #{waitlistPosition ?? '–'}</span>
          <button onClick={async () => { setLoading(true); const r = await leaveWaitlist(instanceId); if (r.error) alert(r.error); setLoading(false) }} disabled={loading} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--c-border)', background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.5 : 1 }}>Leave</button>
        </div>
      )
    }
    return (
      <button onClick={async () => { setLoading(true); const r = await joinWaitlist(instanceId); if (r.error) alert(r.error); setLoading(false) }} disabled={loading} style={{ height: 30, padding: '0 14px', borderRadius: 7, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-2)', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.5 : 1 }}>{loading ? '…' : 'Join waitlist'}</button>
    )
  }
```
(Keep the existing book/cancel branch + `needsCredits` UI unchanged.)

- [ ] **Step 2: Load waitlist data in `schedule/page.tsx`**

In `schedule/page.tsx`:

(a) Add a waitlist import:
```tsx
import { waitlistPosition } from './_lib/waitlist'
```

(b) Add a 4th query to the existing `Promise.all` (alongside instances/box/myBookings): the box's waitlist for the upcoming window — simplest is all the caller box's waitlist rows:
```tsx
    supabase.from('class_waitlist').select('class_instance_id, athlete_id, created_at').eq('box_id', profile.box_id),
```
Name the result `waitlist` and group by `class_instance_id`:
```tsx
  const waitlistByInstance = new Map<string, { athlete_id: string; created_at: string }[]>()
  for (const w of (waitlist ?? []) as { class_instance_id: string; athlete_id: string; created_at: string }[]) {
    const arr = waitlistByInstance.get(w.class_instance_id) ?? []
    arr.push({ athlete_id: w.athlete_id, created_at: w.created_at })
    waitlistByInstance.set(w.class_instance_id, arr)
  }
```

(c) Where `<BookingButton ... />` is rendered, compute and pass the two new props:
```tsx
                          {(() => {
                            const entries = waitlistByInstance.get(instance.id) ?? []
                            const pos = waitlistPosition(entries, user.id)
                            return <BookingButton instanceId={instance.id} isBooked={isBooked} isFull={isFull} isWaitlisted={pos !== null} waitlistPosition={pos} />
                          })()}
```
(Replace the existing `<BookingButton instanceId={instance.id} isBooked={isBooked} isFull={isFull} />`.)

- [ ] **Step 3: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → succeeds (`/dashboard/schedule` builds). `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/schedule/_components/booking-button.tsx src/app/dashboard/schedule/page.tsx
git commit -m "$(cat <<'EOF'
feat(waitlist): schedule UI — Join waitlist / On waitlist #N + Leave

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green
- [ ] `npm run build` → succeeds
- [ ] Dispatch a final code reviewer over the whole branch (focus: cancel-notify is best-effort/never throws; box-scoping; entitlement still enforced on book), then use `superpowers:finishing-a-development-branch`.

## Notes

- **Manual deploy step (user only):** run `migrations/031_class_waitlist.sql` in Supabase. (4th pending alongside 028/029/030.)
- **Notify-to-book:** the cancel hook only *emails*; the waitlister books via the normal `bookClass` entitlement flow — no auto-promote, no credit consumed without their action.
- **Best-effort notify:** wrapped in try/catch; a Resend failure logs and the cancel still returns success.
