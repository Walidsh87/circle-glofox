# Booking-Rule Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two per-box booking policies — a booking-close window (book-class) and a late-cancel credit cutoff (cancel-booking) — configured on the settings page.

**Architecture:** Two integer columns on `boxes` + a pure `booking-policy.ts`; enforced in `book-class` (close → refuse) and `cancel-booking` (late → cancel proceeds but credit forfeited). Settings card to set them.

**Tech Stack:** Next.js 16 server actions, Supabase, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-09-booking-policies-design.md`.

**Conventions reused (read once):**
- Box-config update via service role + owner gate: `settings/_actions/update-settings.ts`. Settings page card render: `settings/page.tsx` (loads `box`, renders `SettingsForm`/`TvDisplayCard`).
- Book/cancel flows: `schedule/_actions/book-class.ts`, `cancel-booking.ts`; `schedule/_components/booking-button.tsx`. Dual-client tests: `src/__tests__/book-class.integration.test.ts`, `cancel-booking.integration.test.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `migrations/039_booking_policies.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `src/lib/booking-policy.ts` + `src/__tests__/booking-policy.test.ts` | create |
| `schedule/_actions/book-class.ts` + `src/__tests__/book-class.integration.test.ts` | modify |
| `schedule/_actions/cancel-booking.ts` + `src/__tests__/cancel-booking.integration.test.ts` | modify |
| `schedule/_components/booking-button.tsx` | modify |
| `settings/_actions/save-booking-policy.ts` + `settings/_components/booking-policy-card.tsx` | create |
| `settings/page.tsx` | modify |

---

## Task 1: Migration 039

**Files:** Create `migrations/039_booking_policies.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Migration**

Create `migrations/039_booking_policies.sql`:

```sql
-- migrations/039_booking_policies.sql
-- Booking-rule policies (#35): per-box close window + late-cancel credit cutoff.
-- 0 = disabled. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS booking_close_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_cancel_hours     integer NOT NULL DEFAULT 0;
```

- [ ] **Step 2: ROLLBACKS entry**

Change header range `008`–`038` → `008`–`039`. Add above `### 038_households`:

```markdown
### 039_booking_policies
```sql
ALTER TABLE boxes DROP COLUMN IF EXISTS booking_close_minutes, DROP COLUMN IF EXISTS late_cancel_hours;
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/039_booking_policies.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(booking-policy): migration 039 — booking_close_minutes + late_cancel_hours on boxes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure policy rules

**Files:** Create `src/lib/booking-policy.ts`; Test `src/__tests__/booking-policy.test.ts`.

- [ ] **Step 1: Failing tests**

Create `src/__tests__/booking-policy.test.ts`:

```ts
import { bookingClosed, isLateCancel } from '@/lib/booking-policy'

const start = '2026-06-10T10:00:00Z'

describe('bookingClosed', () => {
  test('0 minutes → never closed', () => expect(bookingClosed(start, '2026-06-10T09:59:00Z', 0)).toBe(false))
  test('well before the window → open', () => expect(bookingClosed(start, '2026-06-10T08:00:00Z', 30)).toBe(false))
  test('inside the window → closed', () => expect(bookingClosed(start, '2026-06-10T09:45:00Z', 30)).toBe(true))
  test('after start → closed', () => expect(bookingClosed(start, '2026-06-10T10:30:00Z', 30)).toBe(true))
})

describe('isLateCancel', () => {
  test('0 hours → never late', () => expect(isLateCancel(start, '2026-06-10T09:00:00Z', 0)).toBe(false))
  test('inside the window → late', () => expect(isLateCancel(start, '2026-06-10T09:00:00Z', 2)).toBe(true))
  test('before the window → not late', () => expect(isLateCancel(start, '2026-06-10T07:00:00Z', 2)).toBe(false))
})
```

- [ ] **Step 2: Run → fail** (`npm test -- booking-policy`).

- [ ] **Step 3: Implement**

Create `src/lib/booking-policy.ts`:

```ts
// Booking has closed if 'now' is within closeMinutes of the start (or past). 0 → never closed.
export function bookingClosed(startsAt: string, now: string, closeMinutes: number): boolean {
  if (closeMinutes <= 0) return false
  return Date.parse(startsAt) - Date.parse(now) < closeMinutes * 60_000
}

// A cancel is "late" if 'now' is within lateCancelHours of the start (or past). 0 → never late.
export function isLateCancel(startsAt: string, now: string, lateCancelHours: number): boolean {
  if (lateCancelHours <= 0) return false
  return Date.parse(startsAt) - Date.parse(now) < lateCancelHours * 3_600_000
}
```

- [ ] **Step 4: Run → pass** (`npm test -- booking-policy`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/booking-policy.ts src/__tests__/booking-policy.test.ts
git commit -m "$(cat <<'EOF'
feat(booking-policy): pure bookingClosed + isLateCancel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: book-class close-window enforcement

**Files:** Modify `schedule/_actions/book-class.ts`, `src/__tests__/book-class.integration.test.ts`.

- [ ] **Step 1: Enforce**

Add the import:
```ts
import { bookingClosed } from '@/lib/booking-policy'
```
Change the instance load to include the start + policy:
```ts
  const { data: instance } = await supabase
    .from('class_instances')
    .select('capacity, box_id, starts_at, boxes(booking_close_minutes)')
    .eq('id', instanceId)
    .single()
  if (!instance) return { error: 'Class not found.' }

  const policyBox = Array.isArray(instance.boxes) ? instance.boxes[0] : instance.boxes
  if (bookingClosed(instance.starts_at, new Date().toISOString(), policyBox?.booking_close_minutes ?? 0)) {
    return { error: 'Booking has closed for this class.' }
  }
```
(Place the close check immediately after `if (!instance) …`, before the profile/capacity checks.)

- [ ] **Step 2: Test**

Append to `book-class.integration.test.ts`:

```ts
test('refuses a booking inside the close window', async () => {
  const startsAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min away
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      class_instances: { data: { capacity: 10, box_id: 'b1', starts_at: startsAt, boxes: { booking_close_minutes: 30 } }, error: null },
      profiles: { data: { box_id: 'b1' }, error: null },
    },
  }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await bookClass('class-1')
  expect(res.error).toMatch(/closed/i)
})
```
NOTE: the existing tests pass `class_instances` with no `boxes`/`starts_at` → `booking_close_minutes` defaults to 0 → `bookingClosed` short-circuits to `false` → unaffected.

- [ ] **Step 3: Verify** — `npm test -- book-class` → all green. Type-check + lint.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/schedule/_actions/book-class.ts src/__tests__/book-class.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(booking-policy): enforce the booking-close window in book-class

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: cancel-booking late-cancel forfeit

**Files:** Modify `schedule/_actions/cancel-booking.ts`, `schedule/_components/booking-button.tsx`, `src/__tests__/cancel-booking.integration.test.ts`.

- [ ] **Step 1: Enforce + return `forfeited`**

In `cancel-booking.ts`:
(a) add the import `import { isLateCancel } from '@/lib/booking-policy'`.
(b) change the signature return type to `Promise<{ error: string | null; forfeited?: boolean }>`.
(c) after the booking delete succeeds (before the refund block), load the policy:
```ts
  const { data: policyInstance } = await supabase
    .from('class_instances')
    .select('starts_at, boxes(late_cancel_hours)')
    .eq('id', instanceId)
    .single()
  const policyBox = Array.isArray(policyInstance?.boxes) ? policyInstance.boxes[0] : policyInstance?.boxes
  const late = policyInstance ? isLateCancel(policyInstance.starts_at, new Date().toISOString(), policyBox?.late_cancel_hours ?? 0) : false
```
(d) replace the refund block with a forfeit-aware version:
```ts
  let forfeited = false
  if (booking?.credit_id) {
    if (late) {
      forfeited = true // late cancel → credit forfeited, no refund
    } else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY missing; cannot refund credit:', booking.credit_id)
    } else {
      const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: booking.credit_id })
      if (refundErr) console.error('refund_credit failed on cancel; credit stranded:', booking.credit_id, refundErr)
    }
  }
```
(e) change the final `return { error: null }` → `return { error: null, forfeited }`. (The waitlist-notify hook is unchanged.)

- [ ] **Step 2: `BookingButton` forfeited note**

In `schedule/_components/booking-button.tsx`, the `handleClick` already does `const res = isBooked ? await cancelBooking(instanceId) : await bookClass(instanceId)`. After the existing error handling, add:
```ts
    if ('forfeited' in res && res.forfeited) alert('Late cancel — your class credit wasn’t refunded.')
```
(Place it after the `needsCredits`/`res.error` handling, before `setLoading(false)`; it only fires on a successful late cancel.)

- [ ] **Step 3: Tests**

Append to `cancel-booking.integration.test.ts`:

```ts
test('a late cancel of a credit booking forfeits the credit (no refund)', async () => {
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h away, inside a 2h window
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      bookings: { data: { credit_id: 'batch-1' }, error: null },
      class_instances: { data: { starts_at: startsAt, boxes: { late_cancel_hours: 2 } }, error: null },
    },
  }))
  const svc = makeSupabaseMock({ rpc: { data: null, error: null } })
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(res.forfeited).toBe(true)
  expect(svc.rpc).not.toHaveBeenCalledWith('refund_credit', expect.anything())
})

test('an early cancel still refunds the credit', async () => {
  const startsAt = new Date(Date.now() + 100 * 60 * 60 * 1000).toISOString() // 100h away
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: {
      bookings: { data: { credit_id: 'batch-1' }, error: null },
      class_instances: { data: { starts_at: startsAt, boxes: { late_cancel_hours: 2 } }, error: null },
    },
  }))
  const svc = makeSupabaseMock({ rpc: { data: null, error: null } })
  serviceCreate.mockReturnValue(svc)

  const res = await cancelBooking('class-1')
  expect(res.error).toBeNull()
  expect(res.forfeited).toBeFalsy()
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'batch-1' })
})
```
NOTE: existing cancel tests have no `class_instances` on the RLS mock → `policyInstance` null → `late = false` → refund unchanged.

- [ ] **Step 4: Verify** — `npm test -- cancel-booking` → all green. Type-check + lint.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/schedule/_actions/cancel-booking.ts src/app/dashboard/schedule/_components/booking-button.tsx src/__tests__/cancel-booking.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(booking-policy): late cancel forfeits the class credit (cancel still proceeds)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Settings — configure the policies

**Files:** Create `settings/_actions/save-booking-policy.ts`, `settings/_components/booking-policy-card.tsx`; Modify `settings/page.tsx`. No new test beyond the action (UI verified by build).

- [ ] **Step 1: `saveBookingPolicy` action**

Create `settings/_actions/save-booking-policy.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function saveBookingPolicy(closeMinutes: number, lateCancelHours: number): Promise<{ error: string | null }> {
  if (!Number.isInteger(closeMinutes) || closeMinutes < 0 || !Number.isInteger(lateCancelHours) || lateCancelHours < 0) {
    return { error: 'Policies must be whole numbers of zero or more.' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can update settings.' }

  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await service.from('boxes').update({ booking_close_minutes: closeMinutes, late_cancel_hours: lateCancelHours }).eq('id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}
```

- [ ] **Step 2: `BookingPolicyCard` component**

Create `settings/_components/booking-policy-card.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { saveBookingPolicy } from '../_actions/save-booking-policy'

const card: React.CSSProperties = { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', marginTop: 16, boxShadow: 'var(--c-shadow-sm)' }
const inp: React.CSSProperties = { height: 34, width: 90, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit' }

export function BookingPolicyCard({ closeMinutes, lateCancelHours }: { closeMinutes: number; lateCancelHours: number }) {
  const [close, setClose] = useState(String(closeMinutes))
  const [late, setLate] = useState(String(lateCancelHours))
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <div style={card}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 4 }}>Booking policies</p>
      <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginBottom: 12 }}>0 disables a rule.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-ink-2)' }}>
          <input type="number" min={0} value={close} onChange={(e) => { setClose(e.target.value); setSaved(false) }} style={inp} /> minutes before start — bookings close
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-ink-2)' }}>
          <input type="number" min={0} value={late} onChange={(e) => { setLate(e.target.value); setSaved(false) }} style={inp} /> hours before start — cancel forfeits the credit
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button
          disabled={pending}
          onClick={() => start(async () => { const r = await saveBookingPolicy(parseInt(close) || 0, parseInt(late) || 0); if (r.error) alert(r.error); else setSaved(true) })}
          style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >{pending ? 'Saving…' : 'Save'}</button>
        {saved && <span style={{ fontSize: 12.5, color: 'var(--c-ok-ink)' }}>Saved</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Settings page — load + render**

In `settings/page.tsx`: add `booking_close_minutes, late_cancel_hours` to the `box` select, import `BookingPolicyCard`, and render it after `<TvDisplayCard .../>`:
```tsx
            <BookingPolicyCard closeMinutes={box?.booking_close_minutes ?? 0} lateCancelHours={box?.late_cancel_hours ?? 0} />
```

- [ ] **Step 4: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/settings` builds. `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/settings/_actions/save-booking-policy.ts src/app/dashboard/settings/_components/booking-policy-card.tsx src/app/dashboard/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat(booking-policy): settings card + saveBookingPolicy action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. booking-policy, book-class, cancel-booking)
- [ ] `npm run build` → succeeds
- [ ] Final review (0 = disabled short-circuits; close refuses before entitlement; late cancel still frees the spot + notifies waitlist but skips the credit refund; owner gate), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/039_booking_policies.sql` in Supabase (12th pending, alongside 028–038).
- **Defaults are 0** (both rules off) — existing gyms behave exactly as before until the owner sets a value.
- **No-show unchanged** — a no-show's consumed credit was never on the refund path.
