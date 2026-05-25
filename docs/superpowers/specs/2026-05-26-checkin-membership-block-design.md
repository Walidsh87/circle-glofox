# Check-in Membership Block — Design Spec

**Date:** 2026-05-26
**Status:** Approved

---

## Context

When a coach taps "Check in" next to a booked athlete on the whiteboard tablet, nothing currently verifies the athlete's payment status. An unpaid member can attend classes silently for weeks. This is the #1 manual chase that bleeds GCC gyms off Glofox — owners want enforcement at the door, not just a report at month-end.

Check-in is **staff-driven** (coach or owner taps), not athlete-self-service. So the design is not a wall in front of the athlete; it's a status signal in the roster plus a deliberate override path for the coach.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Behavior on unpaid | Hard block + coach override (tracked) |
| What triggers a block | `payment_status != 'paid'` OR no active membership |
| Pre-tap visibility | Red dot/badge in roster next to athlete name |
| Override audit | New columns on `bookings` (`overridden_by`, `overridden_reason`, `overridden_at`) |
| Override friction | Preset reason chips + 'Other' free text |
| Owner visibility | Small "Recent overrides" card on `/dashboard/payments` |

---

## Architecture

### Approach
Single source of truth lives in `check-in.ts`. Before writing the check-in, it computes the athlete's membership status. If not `paid`, it returns `{ error: 'BLOCKED', reason }` instead of writing — the client opens an override modal. The override is a separate server action that records who/why on the booking row.

A pure helper `getMembershipStatus(memberships)` is extracted so the same logic powers (a) the pre-tap red dot in the roster and (b) the server-side block check. Same input → same answer, no drift.

### Why this approach
- Computing status in one helper avoids two implementations drifting apart
- Block enforced server-side — client cannot bypass by sending the request directly
- Override is a separate action so audit fields cannot be set by mistake on a normal check-in
- No new tables: bookings already has RLS, owner already visits payments page

---

## Database

### `migrations/009_checkin_blocks.sql`

```sql
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS overridden_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS overridden_reason text,
  ADD COLUMN IF NOT EXISTS overridden_at timestamptz;
```

No enum changes. RLS on `bookings` already covers reads/writes by box. New columns are nullable — normal check-ins leave them null.

---

## Helper: `src/lib/membership-status.ts`

Pure function — no DB calls. Caller passes already-fetched membership rows.

```ts
export type MembershipStatus = 'paid' | 'unpaid' | 'no_membership'

export type MembershipRow = {
  payment_status: 'paid' | 'unpaid'
  end_date: string | null  // ISO date or null = active
}

export function getMembershipStatus(
  memberships: MembershipRow[],
  today: string  // ISO date, e.g. '2026-05-26'
): MembershipStatus {
  const active = memberships.filter(
    (m) => m.end_date === null || m.end_date >= today
  )
  if (active.length === 0) return 'no_membership'
  if (active.some((m) => m.payment_status !== 'paid')) return 'unpaid'
  return 'paid'
}
```

Rule: **any active unpaid wins**. An athlete with two active memberships (one paid, one unpaid) is `unpaid` — the gym is still owed money.

---

## Tests (TDD)

`src/__tests__/membership-status.test.ts` — 5 tests:

| Test | Input | Expected |
|------|-------|----------|
| No memberships | `[]` | `'no_membership'` |
| One active paid | `[{paid, end_date: null}]` | `'paid'` |
| One active unpaid | `[{unpaid, end_date: null}]` | `'unpaid'` |
| One expired paid + one active unpaid | `[{paid, end_date: '2024-01-01'}, {unpaid, end_date: null}]` | `'unpaid'` |
| Two active, mixed | `[{paid, null}, {unpaid, null}]` | `'unpaid'` |

---

## Whiteboard roster (`src/app/dashboard/whiteboard/page.tsx`)

Existing booking query is extended to fetch each athlete's active memberships in a single Supabase query (use `profiles.memberships(payment_status, end_date)` join). For each athlete, call `getMembershipStatus` to compute the badge.

UI: a 6px coloured dot rendered to the left of the athlete name:
- `paid` → no dot (clean roster — only show problems)
- `unpaid` → red dot, tooltip "Payment overdue — last paid {date}"
- `no_membership` → red dot, tooltip "No active membership"

---

## Check-in action (`_actions/check-in.ts`)

Before the `bookings` update:

```
1. Get user + profile (already done)
2. Fetch athlete's memberships (payment_status, end_date, last_paid_date)
3. Compute status via getMembershipStatus(memberships, today)
4. If status !== 'paid' → return { error: 'BLOCKED', reason: status, lastPaidDate }
5. Otherwise proceed with existing update
```

Return shape changes from `{ error: string | null }` to:
```ts
{ error: string | null, blocked?: { reason: 'unpaid' | 'no_membership', lastPaidDate: string | null } }
```

The `error: 'BLOCKED'` sentinel is checked by the client; any other error is shown as a regular toast.

---

## Override action (`_actions/override-check-in.ts`)

New server action. Same input as `checkIn` plus `reason: string`.

```
1. Auth + role check (owner or coach only)
2. Validate reason is non-empty (Zod)
3. Update bookings row:
   - checked_in = true
   - checked_in_at = now()
   - overridden_by = user.id
   - overridden_reason = reason
   - overridden_at = now()
4. revalidatePath('/dashboard/whiteboard')
```

Returns `{ error: string | null }`.

---

## Client components

### `_components/checkin-button.tsx` (MODIFY)
When `checkIn` returns `blocked`, opens `<OverrideModal>` with the reason and last-paid date pre-filled. Otherwise existing behaviour.

### `_components/override-modal.tsx` (CREATE)
Modal layout:
- Header: ⚠️ "Payment overdue" or "No active membership"
- Athlete name + last paid date (if any)
- Reason chips (single-select):
  - `Card on file failed`
  - `Pays today at desk`
  - `New member — setup pending`
  - `Other`
- If `Other` selected → textarea appears
- Buttons: `Cancel` (close) · `Override & check in` (calls `overrideCheckIn`)
- Submit disabled until a chip or non-empty Other text is selected

Uses `useFormState` / `useFormStatus` consistent with sign-waiver form.

---

## Owner widget — Payments page (`/dashboard/payments`)

New card titled **Recent overrides (30 days)** placed above the existing membership list:

- Query: bookings where `overridden_at >= now() - 30 days` AND `box_id = profile.box_id`, joined with athlete `full_name`, coach `full_name`
- Render up to 10 rows: athlete · reason · coach · date (DD MMM)
- Empty state: "No overrides in the last 30 days."
- No "view all" link in v1 — defer until a gym asks

---

## Verification

- New athlete with no membership → red dot on roster, blocked on tap, override modal opens
- Athlete with active unpaid membership → same
- Athlete with active paid membership → no dot, check-in succeeds normally
- Coach taps override, picks "Pays today at desk", submits → booking row has `overridden_by`/`overridden_reason`/`overridden_at` populated
- Owner visits `/dashboard/payments` → sees the override in the "Recent overrides" card
- Direct API call to `checkIn` with unpaid athlete (bypassing UI) → still returns `BLOCKED`
- `npm run test` — 5 new tests pass
- `npm run type-check` — 0 errors
