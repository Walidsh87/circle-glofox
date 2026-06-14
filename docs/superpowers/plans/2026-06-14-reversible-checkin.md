# Reversible Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coach undo/correct a check-in on the whiteboard, returning the athlete to the derived no-show state.

**Architecture:** Add one server action (`uncheckIn`) mirroring `checkIn` but flipping `bookings.checked_in` back to `false` (skips the entitlement gate, no credit/achievement side-effects). Add a two-step "tap-to-arm, tap-to-undo" interaction to the existing `CheckInButton` so a checked-in row can be reverted without a silent accidental flip. No migration; no-show stays derived in the existing reports.

**Tech Stack:** Next.js 14 App Router server actions, Supabase service client, Vitest + the repo's `makeSupabaseMock` helper, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-14-reversible-checkin-design.md`

---

## File Structure

- **Create** `src/app/dashboard/whiteboard/_actions/uncheck-in.ts` — the `uncheckIn` server action (mirrors `check-in.ts`).
- **Create** `src/__tests__/uncheck-in.integration.test.ts` — integration tests for the action.
- **Modify** `src/app/dashboard/whiteboard/_components/checkin-button.tsx` — add the two-step undo for checked-in rows.
- **Modify** `GymGlofox.md` — mark #90 done + build-log entry (final task).

No other files change. `check-in.ts`, `page.tsx`, and both report shapers (`attendance.ts`, `class-performance.ts`) are untouched.

---

## Task 1: `uncheckIn` server action (TDD)

**Files:**
- Create: `src/app/dashboard/whiteboard/_actions/uncheck-in.ts`
- Test: `src/__tests__/uncheck-in.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/uncheck-in.integration.test.ts`:

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

import { uncheckIn } from '@/app/dashboard/whiteboard/_actions/uncheck-in'

beforeEach(() => vi.clearAllMocks())

function staffClient() {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'Coach One' }, error: null } },
  })
}

test('reverts a check-in: sets checked_in=false + nulls checked_in_at, box-scoped', async () => {
  serverCreate.mockResolvedValue(staffClient())
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)

  const res = await uncheckIn('class-1', 'athlete-1')

  expect(res.error).toBeNull()
  const bookings = svc.builder('bookings')
  expect(bookings.update).toHaveBeenCalledWith({ checked_in: false, checked_in_at: null })
  expect(bookings.eq).toHaveBeenCalledWith('class_instance_id', 'class-1')
  expect(bookings.eq).toHaveBeenCalledWith('athlete_id', 'athlete-1')
  expect(bookings.eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('rejects a non-staff caller and writes nothing', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'ath1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete', full_name: null }, error: null } },
  }))

  const res = await uncheckIn('class-1', 'athlete-1')

  expect(res.error).toBe('Only staff can change attendance.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('returns the db error message when the update fails', async () => {
  serverCreate.mockResolvedValue(staffClient())
  serviceCreate.mockReturnValue(makeSupabaseMock({
    results: { bookings: { data: null, error: { message: 'update failed' } } },
  }))

  const res = await uncheckIn('class-1', 'athlete-1')

  expect(res.error).toBe('update failed')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/uncheck-in.integration.test.ts`
Expected: FAIL — cannot resolve `@/app/dashboard/whiteboard/_actions/uncheck-in`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/dashboard/whiteboard/_actions/uncheck-in.ts`:

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function uncheckIn(
  instanceId: string,
  athleteId: string
): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can change attendance.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()

  const { error } = await service
    .from('bookings')
    .update({ checked_in: false, checked_in_at: null })
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/uncheck-in.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Type-check and lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/whiteboard/_actions/uncheck-in.ts src/__tests__/uncheck-in.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(whiteboard): #90 uncheckIn action to reverse a check-in

Staff-guarded, box-scoped flip of bookings.checked_in back to false
(+ null checked_in_at). Skips the entitlement gate (removing access),
no credit or achievement side-effects. No-show stays derived in reports.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Two-step undo in `CheckInButton`

**Files:**
- Modify: `src/app/dashboard/whiteboard/_components/checkin-button.tsx`

No unit test: this codebase unit-tests server actions/libs (via `makeSupabaseMock`), not client components — the existing `CheckInButton` has no test, and adding React Testing Library would be new infra against the simplicity-first/"follow existing patterns" mandate. The interaction is verified by type-check + build + the manual floor check in Task 3.

- [ ] **Step 1: Replace the component with the two-step-undo version**

Overwrite `src/app/dashboard/whiteboard/_components/checkin-button.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { checkIn } from '../_actions/check-in'
import { uncheckIn } from '../_actions/uncheck-in'
import { OverrideModal } from './override-modal'
import type { MembershipStatus } from '@/lib/membership-status'

const DISARM_MS = 3000

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
  const [done, setDone] = useState(checkedIn)
  const [loading, setLoading] = useState(false)
  const [armed, setArmed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [blockReason, setBlockReason] = useState<'unpaid' | 'no_membership' | 'frozen'>('unpaid')
  const [modalLastPaid, setModalLastPaid] = useState<string | null>(null)
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearDisarm() {
    if (disarmTimer.current) { clearTimeout(disarmTimer.current); disarmTimer.current = null }
  }
  useEffect(() => clearDisarm, [])

  async function handleTap() {
    if (loading) return

    // Already checked in: first tap arms the undo, second tap reverts.
    if (done) {
      if (!armed) {
        setArmed(true)
        clearDisarm()
        disarmTimer.current = setTimeout(() => setArmed(false), DISARM_MS)
        return
      }
      clearDisarm()
      setLoading(true)
      const result = await uncheckIn(instanceId, athleteId)
      setLoading(false)
      if (result.error) { alert(result.error); return }
      setArmed(false)
      setDone(false)
      return
    }

    // Not checked in: existing check-in flow (entitlement gate may open the override modal).
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

  // A not-yet-checked-in, non-paid row carries a status indicator: a danger dot
  // when nothing covers it, or a "Pack" badge when a credit does.
  const showStatusIndicator = !done && membershipStatus !== 'paid'
  const showDot = showStatusIndicator && !hasCredit
  const dotTitle = membershipStatus === 'unpaid'
    ? `Payment overdue${lastPaidDate ? ` — last paid ${new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`
    : membershipStatus === 'frozen' ? 'Membership frozen'
    : 'No active membership'

  return (
    <>
      <button
        onClick={handleTap}
        disabled={loading}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border px-4 py-3.5 text-left text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          done && armed
            ? 'cursor-pointer border-warn-soft bg-warn-soft text-warn'
            : done
            ? 'cursor-pointer border-ok-soft bg-ok-soft text-ok'
            : 'border-line bg-surface-2 text-ink hover:border-line-strong'
        )}
      >
        {done && <span className="text-sm">✓</span>}
        {showDot && (
          <span title={dotTitle} className="h-2 w-2 shrink-0 rounded-full bg-danger" />
        )}
        {showStatusIndicator && hasCredit && (
          <span
            title="Booked with a class credit"
            className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-accent-ink"
          >
            Pack
          </span>
        )}
        <span className="flex-1">{done && armed ? 'Tap to undo' : athleteName}</span>
        {loading && <span className="text-[11px] text-ink-faint">…</span>}
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

Changes vs the original: added `useRef`/`useEffect` imports, the `uncheckIn` import, `DISARM_MS`, the `armed` state + `disarmTimer` ref + `clearDisarm`/unmount cleanup, the `done` branch in `handleTap` (arm → revert), `disabled={loading}` (was `loading || done`), the `done && armed` warn style, and the `Tap to undo` label. Everything else (override modal, status dot, Pack badge, check-in flow) is unchanged.

- [ ] **Step 2: Type-check, lint, build**

Run: `npm run type-check && npm run lint && npm run build`
Expected: 0 errors; build succeeds. (Build catches any missing Tailwind token, e.g. confirms `border-warn-soft`/`text-warn` resolve — they mirror the `*-ok-soft` pairing already used in this file and the `warn-soft`/`warn` tokens used on the whiteboard page.)

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/whiteboard/_components/checkin-button.tsx
git commit -m "$(cat <<'EOF'
feat(whiteboard): #90 two-step undo on the check-in button

A checked-in row is now tappable: first tap arms ("Tap to undo"),
second tap calls uncheckIn and reverts. Auto-disarms after 3s so a
stray tap never silently un-checks. Present-tap path unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Full gate + manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full CI gate**

Run: `npm run lint && npm run type-check && npm run test && npm run build`
Expected: lint clean, 0 type errors, all tests green (the prior suite count + 3 new), build succeeds.

- [ ] **Step 2: Manual floor check (dev server)**

Run: `npm run dev`, sign in as staff, open `/dashboard/whiteboard` with at least one of today's classes that has a booked athlete.

Verify:
1. Tap an un-checked athlete → turns green with ✓, header count `X/N in` increments. (unchanged behavior)
2. Tap that green row once → it switches to the warn style and reads "✓ Tap to undo". Count unchanged.
3. Tap it again → reverts to the un-checked look, header count decrements.
4. Tap a green row once, then wait ~3s without a second tap → it disarms back to the normal green ✓ (no revert).
5. Re-check the same athlete → green again (a previously-overridden unpaid athlete correctly re-opens the override modal).
6. Open `/dashboard/reports/attendance` (or `/dashboard/reports/classes`) for a past class where you reverted a check-in → that athlete is counted as a no-show (derived; only past classes count).

- [ ] **Step 3: Confirm no schema/report drift**

Run: `git diff --name-only main` — expected to list only `uncheck-in.ts`, `uncheck-in.integration.test.ts`, `checkin-button.tsx` (and `GymGlofox.md` after Task 4). No file under `migrations/` or `src/lib/reports/` should appear.

---

## Task 4: Update the roadmap

**Files:**
- Modify: `GymGlofox.md`

- [ ] **Step 1: Flip #90 to shipped**

In the Tier 11 list, change item 90 from `⬜` to `✅` with a one-line note, e.g.:

```
90. ✅ `[G-gap]` **Mark attendance from the floor** — reversible check-in on the whiteboard: a checked-in row taps to arm ("Tap to undo") then reverts via `uncheckIn` (staff-guarded, box-scoped, skips the entitlement gate; no credit/achievement side-effects). No-show stays **derived** (reports unchanged) — un-checking returns the athlete to the derived no-show set. No migration. Two-step undo auto-disarms after 3s. Specs `…2026-06-14-reversible-checkin-design.md`.
```

- [ ] **Step 2: Add a Build Log row**

Add a dated row to the Build Log table (top of the list):

```
| 2026-06-14 | **Reversible check-in** (v2 Tier 11 #90) — `uncheckIn` server action (staff-guarded, box-scoped, `checked_in→false`+null `checked_in_at`, no entitlement gate / credit / achievement effects) + two-step tap-to-arm/tap-to-undo on the whiteboard `CheckInButton` (auto-disarm 3s). No-show stays derived (reports untouched); no migration. 3 new integration tests; full gate green. Specs `…reversible-checkin-design.md`, plan `…2026-06-14-reversible-checkin.md`. | main `<range>` |
```

- [ ] **Step 3: Commit**

```bash
git add GymGlofox.md
git commit -m "$(cat <<'EOF'
docs(roadmap): #90 reversible check-in shipped

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** `uncheckIn` action (Task 1) ✓; skips entitlement gate / no credit / no achievement revoke (Task 1 impl + asserted by the non-staff/error tests + verified absent from code) ✓; two-step undo UI (Task 2) ✓; reports/schema untouched (Task 3 Step 3 guard) ✓; success criteria (Task 3 Step 2 manual checks) ✓.
- **Placeholder scan:** none — every step has real code/commands.
- **Type consistency:** action name `uncheckIn(instanceId, athleteId): Promise<{ error: string | null }>` used identically in the test import, the component import, and the impl. Tailwind classes `border-warn-soft`/`bg-warn-soft`/`text-warn` mirror the `*-ok-soft`/`text-ok` pairing already in the same file; the build step (Task 2 Step 2) is the verification gate for them.
