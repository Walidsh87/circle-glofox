# Check-in Membership Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block check-in at the whiteboard when an athlete has no active paid membership; allow coaches to override with a recorded reason.

**Architecture:** Pure helper `getMembershipStatus()` powers both the pre-tap red dot in the roster and the server-side block check in `checkIn`. When blocked, the action returns a `BLOCKED` sentinel; the client opens an override modal that calls a separate `overrideCheckIn` action that writes `overridden_by` / `overridden_reason` / `overridden_at` columns on the booking row. Owner sees recent overrides in a card on the payments page.

**Tech Stack:** Next.js 14 App Router server components, Supabase (Postgres + RLS), Zod, `useFormState`/`useFormStatus` (react-dom), Vitest.

---

## File Map

| File | Action |
|------|--------|
| `migrations/009_checkin_blocks.sql` | CREATE — add 3 nullable columns to `bookings` |
| `src/lib/membership-status.ts` | CREATE — `getMembershipStatus` pure helper |
| `src/__tests__/membership-status.test.ts` | CREATE — 5 unit tests |
| `src/app/dashboard/whiteboard/_actions/check-in.ts` | MODIFY — return `BLOCKED` sentinel when not paid |
| `src/app/dashboard/whiteboard/_actions/override-check-in.ts` | CREATE — write override row |
| `src/app/dashboard/whiteboard/_components/override-modal.tsx` | CREATE — reason chip picker |
| `src/app/dashboard/whiteboard/_components/checkin-button.tsx` | MODIFY — open modal on BLOCKED |
| `src/app/dashboard/whiteboard/page.tsx` | MODIFY — fetch memberships, pass status to button, render red dot |
| `src/app/dashboard/payments/page.tsx` | MODIFY — add "Recent overrides" card |

---

## Task 1: Database migration

**Files:**
- Create: `migrations/009_checkin_blocks.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/009_checkin_blocks.sql
-- Run in Supabase SQL Editor

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS overridden_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS overridden_reason text,
  ADD COLUMN IF NOT EXISTS overridden_at timestamptz;
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Copy the file contents into Supabase → SQL Editor → New query → Run.

Expected: success with no errors. Verify in Table Editor: `bookings` table now has the three new columns, all nullable.

- [ ] **Step 3: Commit**

```bash
cd "Circle Glofox" && git add migrations/009_checkin_blocks.sql && git commit -m "feat(checkin): add override audit columns to bookings"
```

---

## Task 2: Membership status helper + tests (TDD)

**Files:**
- Create: `src/__tests__/membership-status.test.ts`
- Create: `src/lib/membership-status.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/__tests__/membership-status.test.ts`:

```typescript
import { getMembershipStatus } from '@/lib/membership-status'

describe('getMembershipStatus', () => {
  const today = '2026-05-26'

  test('returns no_membership when memberships array is empty', () => {
    expect(getMembershipStatus([], today)).toBe('no_membership')
  })

  test('returns paid when one active paid membership exists', () => {
    const rows = [{ payment_status: 'paid' as const, end_date: null }]
    expect(getMembershipStatus(rows, today)).toBe('paid')
  })

  test('returns unpaid when one active unpaid membership exists', () => {
    const rows = [{ payment_status: 'unpaid' as const, end_date: null }]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })

  test('returns unpaid when one expired paid and one active unpaid exist', () => {
    const rows = [
      { payment_status: 'paid' as const,   end_date: '2024-01-01' },
      { payment_status: 'unpaid' as const, end_date: null },
    ]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })

  test('returns unpaid when any active membership is unpaid (mixed)', () => {
    const rows = [
      { payment_status: 'paid' as const,   end_date: null },
      { payment_status: 'unpaid' as const, end_date: null },
    ]
    expect(getMembershipStatus(rows, today)).toBe('unpaid')
  })

  test('returns no_membership when all memberships are expired', () => {
    const rows = [{ payment_status: 'paid' as const, end_date: '2024-01-01' }]
    expect(getMembershipStatus(rows, today)).toBe('no_membership')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "Circle Glofox" && npm run test -- membership-status 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '@/lib/membership-status'`.

- [ ] **Step 3: Create the helper**

Create `src/lib/membership-status.ts`:

```typescript
export type MembershipStatus = 'paid' | 'unpaid' | 'no_membership'

export type MembershipRow = {
  payment_status: 'paid' | 'unpaid'
  end_date: string | null
}

export function getMembershipStatus(
  memberships: MembershipRow[],
  today: string
): MembershipStatus {
  const active = memberships.filter(
    (m) => m.end_date === null || m.end_date >= today
  )
  if (active.length === 0) return 'no_membership'
  if (active.some((m) => m.payment_status !== 'paid')) return 'unpaid'
  return 'paid'
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "Circle Glofox" && npm run test -- membership-status 2>&1 | tail -10
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "Circle Glofox" && git add src/lib/membership-status.ts src/__tests__/membership-status.test.ts && git commit -m "feat(checkin): add getMembershipStatus helper with tests"
```

---

## Task 3: Modify checkIn action to block unpaid athletes

**Files:**
- Modify: `src/app/dashboard/whiteboard/_actions/check-in.ts`

- [ ] **Step 1: Replace the file with the blocking version**

Overwrite `src/app/dashboard/whiteboard/_actions/check-in.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getMembershipStatus, type MembershipStatus } from '@/lib/membership-status'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only staff can check in athletes.' }
  }

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
    .from('bookings')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
```

- [ ] **Step 2: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 3: Run all tests**

```bash
cd "Circle Glofox" && npm run test 2>&1 | tail -10
```

Expected: all existing tests still pass (membership-status tests included).

- [ ] **Step 4: Commit**

```bash
cd "Circle Glofox" && git add src/app/dashboard/whiteboard/_actions/check-in.ts && git commit -m "feat(checkin): block check-in when athlete has no active paid membership"
```

---

## Task 4: Override check-in server action

**Files:**
- Create: `src/app/dashboard/whiteboard/_actions/override-check-in.ts`

- [ ] **Step 1: Create the override action**

Create `src/app/dashboard/whiteboard/_actions/override-check-in.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const overrideSchema = z.object({
  instanceId: z.string().uuid(),
  athleteId:  z.string().uuid(),
  reason:     z.string().min(1).max(200),
})

export async function overrideCheckIn(
  instanceId: string,
  athleteId: string,
  reason: string
): Promise<{ error: string | null }> {
  const parsed = overrideSchema.safeParse({ instanceId, athleteId, reason })
  if (!parsed.success) return { error: 'Invalid input.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only staff can override check-in.' }
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date().toISOString()
  const { error } = await service
    .from('bookings')
    .update({
      checked_in: true,
      checked_in_at: now,
      overridden_by: user.id,
      overridden_reason: parsed.data.reason,
      overridden_at: now,
    })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
```

- [ ] **Step 2: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "Circle Glofox" && git add src/app/dashboard/whiteboard/_actions/override-check-in.ts && git commit -m "feat(checkin): add overrideCheckIn server action with audit fields"
```

---

## Task 5: Override modal component

**Files:**
- Create: `src/app/dashboard/whiteboard/_components/override-modal.tsx`

- [ ] **Step 1: Create the modal**

Create `src/app/dashboard/whiteboard/_components/override-modal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { overrideCheckIn } from '../_actions/override-check-in'

const PRESET_REASONS = [
  'Card on file failed',
  'Pays today at desk',
  'New member — setup pending',
  'Other',
] as const

type Reason = typeof PRESET_REASONS[number]

export function OverrideModal({
  open,
  onClose,
  onSuccess,
  instanceId,
  athleteId,
  athleteName,
  blockReason,
  lastPaidDate,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  instanceId: string
  athleteId: string
  athleteName: string
  blockReason: 'unpaid' | 'no_membership'
  lastPaidDate: string | null
}) {
  const [selected, setSelected] = useState<Reason | null>(null)
  const [otherText, setOtherText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) return null

  const finalReason = selected === 'Other' ? otherText.trim() : (selected ?? '')
  const canSubmit = finalReason.length > 0 && !pending

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const { error: err } = await overrideCheckIn(instanceId, athleteId, finalReason)
      if (err) { setError(err); return }
      onSuccess()
      onClose()
    })
  }

  const title = blockReason === 'unpaid' ? 'Payment overdue' : 'No active membership'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: 'var(--c-surface)',
          border: '1px solid var(--c-border)',
          borderRadius: 14, padding: 24,
          fontFamily: 'var(--font-geist-sans)',
          color: 'var(--c-ink)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 700 }}>
            {title}
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 4 }}>
          {athleteName}
        </div>
        {lastPaidDate && (
          <div style={{ fontSize: 12, color: 'var(--c-ink-faint)', marginBottom: 18 }}>
            Last paid: {new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}
        {!lastPaidDate && <div style={{ marginBottom: 18 }} />}

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-ink-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
          Reason for override
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {PRESET_REASONS.map((r) => {
            const active = selected === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setSelected(r)}
                style={{
                  padding: '8px 12px', borderRadius: 999, fontSize: 12.5,
                  border: `1px solid ${active ? 'var(--circle-lime)' : 'var(--c-border)'}`,
                  background: active ? 'var(--c-surface-alt)' : 'var(--c-surface)',
                  color: active ? 'var(--circle-lime)' : 'var(--c-ink-2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {r}
              </button>
            )
          })}
        </div>

        {selected === 'Other' && (
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Describe the reason"
            maxLength={200}
            style={{
              width: '100%', height: 40, padding: '0 12px', marginBottom: 14,
              background: 'var(--c-surface-alt)',
              border: '1px solid var(--c-border)',
              borderRadius: 8, fontSize: 13.5, color: 'var(--c-ink)',
              fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
            }}
          />
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--c-danger)', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              padding: '10px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
              background: 'transparent',
              border: '1px solid var(--c-border)',
              color: 'var(--c-ink-2)',
              cursor: pending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: '10px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 700,
              background: canSubmit ? 'var(--circle-lime)' : 'var(--c-surface-alt)',
              border: 'none',
              color: canSubmit ? 'var(--circle-ink)' : 'var(--c-ink-muted)',
              cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}
          >
            {pending ? 'Saving…' : 'Override & check in'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "Circle Glofox" && git add src/app/dashboard/whiteboard/_components/override-modal.tsx && git commit -m "feat(checkin): add OverrideModal with reason chips"
```

---

## Task 6: CheckInButton — open modal on BLOCKED, render red dot

**Files:**
- Modify: `src/app/dashboard/whiteboard/_components/checkin-button.tsx`

- [ ] **Step 1: Replace the file with the modal-aware version**

Overwrite `src/app/dashboard/whiteboard/_components/checkin-button.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { checkIn } from '../_actions/check-in'
import { OverrideModal } from './override-modal'
import type { MembershipStatus } from '@/lib/membership-status'

export function CheckInButton({
  instanceId,
  athleteId,
  athleteName,
  checkedIn,
  membershipStatus,
  lastPaidDate,
}: {
  instanceId: string
  athleteId: string
  athleteName: string
  checkedIn: boolean
  membershipStatus: MembershipStatus
  lastPaidDate: string | null
}) {
  const [done, setDone] = useState(checkedIn)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [blockReason, setBlockReason] = useState<'unpaid' | 'no_membership'>('unpaid')
  const [modalLastPaid, setModalLastPaid] = useState<string | null>(null)

  async function handleTap() {
    if (done) return
    setLoading(true)
    const result = await checkIn(instanceId, athleteId)
    setLoading(false)
    if (result.error === 'BLOCKED' && result.blocked) {
      setBlockReason(result.blocked.reason)
      setModalLastPaid(result.blocked.lastPaidDate)
      setModalOpen(true)
      return
    }
    if (result.error) { alert(result.error); return }
    setDone(true)
  }

  const showDot = !done && membershipStatus !== 'paid'
  const dotTitle = membershipStatus === 'unpaid'
    ? `Payment overdue${lastPaidDate ? ` — last paid ${new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`
    : 'No active membership'

  return (
    <>
      <button
        onClick={handleTap}
        disabled={loading || done}
        style={{
          width: '100%', borderRadius: 12, padding: '14px 16px',
          textAlign: 'left', fontWeight: 600, fontSize: 15,
          cursor: done ? 'default' : 'pointer',
          background: done ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
          border: `1px solid ${done ? 'var(--c-ok-soft)' : 'var(--c-border)'}`,
          color: done ? 'var(--c-ok-ink)' : 'var(--c-ink)',
          fontFamily: 'inherit', transition: 'background 150ms',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        {done && <span style={{ fontSize: 14 }}>✓</span>}
        {showDot && (
          <span
            title={dotTitle}
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--c-danger)', flexShrink: 0,
            }}
          />
        )}
        <span style={{ flex: 1 }}>{athleteName}</span>
        {loading && <span style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>…</span>}
      </button>
      <OverrideModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setDone(true)}
        instanceId={instanceId}
        athleteId={athleteId}
        athleteName={athleteName}
        blockReason={blockReason}
        lastPaidDate={modalLastPaid}
      />
    </>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -20
```

Expected: errors about missing `membershipStatus` / `lastPaidDate` props at the call site in `page.tsx`. That's fixed in Task 7 — type-check will go green there. Do NOT commit yet.

- [ ] **Step 3: Continue to Task 7 before committing**

(Commit happens at the end of Task 7 alongside the page changes so the codebase isn't broken between commits.)

---

## Task 7: Whiteboard roster — fetch memberships, pass status to button

**Files:**
- Modify: `src/app/dashboard/whiteboard/page.tsx`

- [ ] **Step 1: Update the bookings select to include memberships**

In `src/app/dashboard/whiteboard/page.tsx`, find this query block:

```typescript
  const { data: instances } = await supabase
    .from('class_instances')
    .select(`
      id, starts_at, capacity, status,
      class_templates(name),
      profiles(full_name),
      bookings(athlete_id, checked_in, profiles(full_name))
    `)
```

Replace the `bookings` line so the nested `profiles` also pulls memberships and `last_paid_date`:

```typescript
  const { data: instances } = await supabase
    .from('class_instances')
    .select(`
      id, starts_at, capacity, status,
      class_templates(name),
      profiles(full_name),
      bookings(
        athlete_id,
        checked_in,
        profiles(
          full_name,
          memberships(payment_status, end_date, last_paid_date)
        )
      )
    `)
```

- [ ] **Step 2: Compute status and pass to CheckInButton**

Find every place where `<CheckInButton ... />` is rendered in this file. The current props are:

```typescript
<CheckInButton
  instanceId={inst.id}
  athleteId={booking.athlete_id}
  athleteName={booking.profiles?.full_name ?? 'Athlete'}
  checkedIn={booking.checked_in}
/>
```

Add an import at the top of the file (just below the other imports):

```typescript
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
```

Add a helper near the top of the file (after `formatTime`):

```typescript
function todayLocalDate(timezone: string): string {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  const localMs = Date.now() + offsetHours * 60 * 60 * 1000
  return new Date(localMs).toISOString().slice(0, 10)
}
```

Then, just before the JSX returns (after `const today = ...` line ~70), add:

```typescript
const todayIso = todayLocalDate(timezone)
```

In each `<CheckInButton>` call site, change the JSX to:

```typescript
{(() => {
  const athleteProfile = booking.profiles as { full_name?: string; memberships?: MembershipRow[] & { last_paid_date: string | null }[] } | null
  const memberships = (athleteProfile?.memberships ?? []) as Array<MembershipRow & { last_paid_date: string | null }>
  const status = getMembershipStatus(memberships, todayIso)
  const lastPaid = memberships
    .map((m) => m.last_paid_date)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null
  return (
    <CheckInButton
      instanceId={inst.id}
      athleteId={booking.athlete_id}
      athleteName={athleteProfile?.full_name ?? 'Athlete'}
      checkedIn={booking.checked_in}
      membershipStatus={status}
      lastPaidDate={lastPaid}
    />
  )
})()}
```

- [ ] **Step 3: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -15
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests**

```bash
cd "Circle Glofox" && npm run test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit (Tasks 6 + 7 together)**

```bash
cd "Circle Glofox" && git add src/app/dashboard/whiteboard/_components/checkin-button.tsx src/app/dashboard/whiteboard/page.tsx && git commit -m "feat(checkin): show red dot on roster and open override modal on block"
```

---

## Task 8: Recent overrides card on payments page

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx`

- [ ] **Step 1: Read the current file structure**

Open `src/app/dashboard/payments/page.tsx` and locate where the membership list is rendered. The card must be inserted ABOVE the membership list, after the page header.

- [ ] **Step 2: Add the overrides query**

Find the existing data-fetching block in the page (the part that runs `await supabase.from('memberships')...` or similar). Add this query in parallel (use `Promise.all` if the page already uses it; otherwise add as a separate `await`):

```typescript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

const { data: overrides } = await supabase
  .from('bookings')
  .select(`
    overridden_at,
    overridden_reason,
    athlete:profiles!bookings_athlete_id_fkey(full_name),
    coach:profiles!bookings_overridden_by_fkey(full_name)
  `)
  .eq('box_id', profile.box_id)
  .not('overridden_at', 'is', null)
  .gte('overridden_at', thirtyDaysAgo)
  .order('overridden_at', { ascending: false })
  .limit(10)
```

- [ ] **Step 3: Render the card**

In the JSX, immediately after the page header (the `<h1>` or page title block) and BEFORE the membership list, add:

```typescript
<div style={{
  background: 'var(--c-surface)',
  border: '1px solid var(--c-border)',
  borderRadius: 14,
  overflow: 'hidden',
  marginBottom: 20,
  boxShadow: 'var(--c-shadow-sm)',
}}>
  <div style={{
    padding: '14px 20px',
    borderBottom: '1px solid var(--c-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }}>
    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>
      Recent overrides (30 days)
    </span>
    <span style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>
      {(overrides ?? []).length} {(overrides ?? []).length === 1 ? 'override' : 'overrides'}
    </span>
  </div>
  {(overrides ?? []).length === 0 ? (
    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
      No overrides in the last 30 days.
    </div>
  ) : (
    (overrides ?? []).map((o, i) => {
      const athlete = (Array.isArray(o.athlete) ? o.athlete[0] : o.athlete) as { full_name?: string } | null
      const coach   = (Array.isArray(o.coach)   ? o.coach[0]   : o.coach)   as { full_name?: string } | null
      return (
        <div key={i} style={{
          padding: '12px 20px',
          borderBottom: i < (overrides ?? []).length - 1 ? '1px solid var(--c-divider)' : 'none',
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 10,
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 13.5, color: 'var(--c-ink)', fontWeight: 500 }}>
              {athlete?.full_name ?? 'Athlete'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 2 }}>
              {o.overridden_reason} · by {coach?.full_name ?? 'Coach'}
            </div>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>
            {o.overridden_at ? new Date(o.overridden_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
          </div>
        </div>
      )
    })
  )}
</div>
```

- [ ] **Step 4: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -15
```

Expected: 0 errors. If you get errors about the foreign-key hint names (`bookings_athlete_id_fkey`, `bookings_overridden_by_fkey`), check the actual constraint names in Supabase Studio (Tables → bookings → constraints) and replace the names in the select.

- [ ] **Step 5: Run all tests**

```bash
cd "Circle Glofox" && npm run test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd "Circle Glofox" && git add src/app/dashboard/payments/page.tsx && git commit -m "feat(checkin): show recent override activity on payments page"
```

---

## Verification

End-to-end checks after all tasks are complete and migration 009 has been run in Supabase:

- [ ] On whiteboard, an athlete with **no membership row** → red dot visible, tooltip "No active membership"
- [ ] On whiteboard, an athlete with `payment_status='unpaid'` → red dot visible, tooltip shows last paid date if available
- [ ] On whiteboard, an athlete with active paid membership → no dot, normal check-in works
- [ ] Tap check-in on unpaid athlete → modal opens with title "Payment overdue"
- [ ] Pick "Pays today at desk" → submit → button becomes green checked, row in bookings has `overridden_by` / `overridden_reason='Pays today at desk'` / `overridden_at` populated
- [ ] Pick "Other" → submit without typing → submit button stays disabled
- [ ] Pick "Other" → type a reason → submit → succeeds
- [ ] Owner visits `/dashboard/payments` → sees "Recent overrides (30 days)" card with the override above
- [ ] `npm run test` — 6 new tests pass (membership-status)
- [ ] `npm run type-check` — 0 errors
