# Membership Lifecycle (Freezes + Scheduled Cancellation) — Design

**Date:** 2026-06-09
**Feature:** Let owners freeze/pause a membership (with optional auto-resume) and schedule an end-of-period cancellation. A freeze fully pauses the billing relationship; a scheduled cancellation keeps access until a future date.
**Roadmap:** v2 Tier 4 #28 (freezes/pauses) + #29 (scheduled cancellations) — the first Tier 4 sub-feature.

---

## Problem

`memberships` today is binary: active (`end_date IS NULL`) or ended. Owners can't pause a membership for travel/injury, and can't schedule a cancellation for the end of a paid period — they'd have to cancel immediately (losing the member's remaining paid time) or remember to do it manually later. This adds both lifecycle operations on top of the existing membership model.

## Scope decisions (locked during brainstorming)

1. **Freeze = two date columns** on `memberships` (`frozen_from`, `frozen_until`). One active freeze window per membership; `frozen_until NULL` = indefinite until manually resumed. "Frozen" is date-computed → **auto-resume needs no cron**. No freeze history (YAGNI).
2. **Full pause:** while frozen a member is blocked from membership check-in/booking, excluded from MRR + active count, and gets no billing-due reminders.
3. **Pre-paid credits stay usable while frozen** — a freeze pauses the recurring membership, not class credits the member already bought (the existing credit-bypass in check-in/book covers this).
4. **Scheduled cancellation reuses `end_date`** — `getMembershipStatus` already treats a future `end_date` as active-until-then, so #29 is a future `end_date` + UI + undo, no schema.

## Approach (chosen: A)

A single pure predicate `isFrozenOn(membership, date)` in `membership-status.ts` is the one source of truth, consumed wherever entitlement or rollups are computed. `getMembershipStatus` gains a `'frozen'` status; the KPI and billing-reminder paths exclude frozen rows. Owner actions write the freeze columns / `end_date`. UI surfaces controls (member page) + status badges.

Rejected: **B** a `membership_freezes` history table (extra join everywhere entitlement is checked; audit trail not needed); **C** adding `'frozen'` to the `payment_status` enum (conflates payment with availability, corrupts paid/unpaid/overdue semantics).

---

## 1. Data — migration `033_membership_freeze.sql`

```sql
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS frozen_from  date;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS frozen_until date;
```
`frozen_until NULL` with a non-null `frozen_from` = indefinite freeze. `end_date` already exists (scheduled cancellation). No RLS change — `owner_write_memberships` + `box_isolation_select` already apply. + ROLLBACKS entry. **Manual deploy step (user only): run `033_membership_freeze.sql` in Supabase.**

## 2. Pure core — `src/lib/membership-status.ts`

```ts
export type MembershipStatus = 'paid' | 'unpaid' | 'no_membership' | 'frozen'

export type MembershipRow = {
  payment_status: 'paid' | 'unpaid'
  end_date: string | null
  frozen_from?: string | null   // optional → existing callers/tests unaffected
  frozen_until?: string | null
}

// Window is [frozen_from, frozen_until): auto-resumes ON frozen_until.
export function isFrozenOn(m: { frozen_from?: string | null; frozen_until?: string | null }, date: string): boolean {
  return !!m.frozen_from && m.frozen_from <= date && (m.frozen_until == null || date < m.frozen_until)
}

export function getMembershipStatus(memberships: MembershipRow[], today: string): MembershipStatus
```

`getMembershipStatus` new logic:
1. `active` = memberships with `end_date === null || end_date >= today` (unchanged).
2. If `active.length === 0` → `'no_membership'`.
3. `live` = active rows **not** `isFrozenOn(m, today)`.
4. If `live.length === 0` (active exist but all frozen) → `'frozen'`.
5. If any `live` row is `payment_status !== 'paid'` → `'unpaid'`; else `'paid'`.

Backward compatibility: rows without freeze fields → `isFrozenOn` false → identical behavior to today. Existing tests stay green.

## 3. Entitlement ripple

- **check-in** (`whiteboard/_actions/check-in.ts`) + **book-class** (`schedule/_actions/book-class.ts`): add `frozen_from, frozen_until` to their `memberships` selects. `getMembershipStatus` then returns `'frozen'` for a frozen member; both already gate free entitlement on `=== 'paid'`, so frozen falls through. A **credit-backed booking/check-in still works** (the existing `credit_id` bypass). New blocked reason `'frozen'` → `CheckInButton` shows "Membership frozen."
- **KPI** (`dashboard/kpi/_lib/metrics.ts`): `MembershipRow` there gains `frozen_from?/frozen_until?`; `mrrAt` + `activeAt` exclude rows `isFrozenOn(m, onDate)` (import the predicate from `@/lib/membership-status`). Frozen members drop from MRR + active count for any month they're frozen. `avgTenureMonths` (LEG) unchanged — a frozen member is still a member.
- **billing-reminders** (`api/cron/billing-reminders/route.ts`): skip memberships `isFrozenOn(m, today)` so frozen members aren't nagged. Add the columns to that query.

## 4. Actions (owner-only) — `dashboard/payments/_actions/`

All: RLS client, `auth.getUser`, `profile.role === 'owner'` gate, Zod validation, `revalidatePath('/dashboard/payments')` + the member page. Each scoped by `box_id` on the update.

- `freezeMembership(membershipId, frozenFrom, frozenUntil | null)` — set the two columns. Validate `frozenFrom` is a date and, if `frozenUntil` given, `frozenUntil > frozenFrom`.
- `resumeMembership(membershipId)` — set `frozen_from = null, frozen_until = null` (resume now).
- `scheduleCancellation(membershipId, endDate)` — set `end_date = endDate`. Validate `endDate >= today`.
- `undoScheduledCancellation(membershipId)` — set `end_date = null`.

## 5. UI

- **Member page** (`members/[memberId]/page.tsx`, owner-only): a membership-management block on the active membership — **Freeze** (date inputs: from default today, optional until) / **Resume** when frozen; **Schedule cancellation** (end date) / **Undo** when an end date is set in the future. Status badges: "Frozen until {frozen_until}" or "Frozen", and "Cancels on {end_date}". Small client components calling the actions.
- **Payments page** (`payments/page.tsx`): show "Frozen" / "Cancels {date}" badges on the membership rows; exclude `isFrozenOn(m, today)` rows from the page's `active`/`mrr` rollup (matching KPIs).
- **Whiteboard check-in**: the `'frozen'` blocked reason renders "Membership frozen" (extend `CheckInButton`'s reason handling).

## 6. Testing

- **`membership-status.test.ts`** (extend): `isFrozenOn` — before window (`date < frozen_from`) false; inside true; on `frozen_until` false (auto-resumed); indefinite (`frozen_until null`) true for any `date >= frozen_from`; no `frozen_from` false. `getMembershipStatus` — all-active-frozen → `'frozen'`; one frozen + one live paid → `'paid'`; frozen + live unpaid → `'unpaid'`; future `end_date` still active.
- **KPI metrics** (extend `kpi-metrics.test.ts`): a frozen membership is excluded from `mrrAt`/`activeAt` on a date inside its freeze window, included outside it.
- **Action integration tests** (`membership-lifecycle.integration.test.ts`): `freezeMembership` writes both columns; `resumeMembership` nulls them; `scheduleCancellation` sets `end_date`; `undoScheduledCancellation` nulls it; non-owner rejected.

## 7. Out of scope (YAGNI)

Freeze history / audit trail · max-freeze-duration policy · freeze fees · partial-month proration of a freeze · auto-email on freeze/resume · family-plan interactions · multiple simultaneous freeze windows.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/033_membership_freeze.sql` | create | `frozen_from`/`frozen_until` columns |
| `migrations/ROLLBACKS.md` | modify | `### 033_membership_freeze` |
| `src/lib/membership-status.ts` | modify | `isFrozenOn` + `'frozen'` status |
| `src/__tests__/membership-status.test.ts` | modify | freeze cases |
| `src/app/dashboard/kpi/_lib/metrics.ts` | modify | exclude frozen from MRR/active |
| `src/__tests__/kpi-metrics.test.ts` | modify | frozen-exclusion test |
| `src/app/dashboard/whiteboard/_actions/check-in.ts` | modify | select freeze cols |
| `src/app/dashboard/schedule/_actions/book-class.ts` | modify | select freeze cols |
| `src/app/dashboard/whiteboard/_components/checkin-button.tsx` | modify | `'frozen'` reason text |
| `src/app/api/cron/billing-reminders/route.ts` | modify | skip frozen |
| `src/app/dashboard/payments/_actions/freeze-membership.ts` | create | `freezeMembership` + `resumeMembership` |
| `src/app/dashboard/payments/_actions/schedule-cancellation.ts` | create | `scheduleCancellation` + `undoScheduledCancellation` |
| `src/app/dashboard/payments/_lib/lifecycle-validation.ts` | create | Zod validators for the 4 actions |
| `src/__tests__/membership-lifecycle.integration.test.ts` | create | action tests |
| `src/app/dashboard/members/[memberId]/_components/membership-lifecycle.tsx` | create | owner controls |
| `src/app/dashboard/members/[memberId]/page.tsx` | modify | render controls + badges |
| `src/app/dashboard/payments/page.tsx` | modify | badges + exclude frozen from rollup |

**One migration (033).** Reuses the entitlement core, KPI module, check-in/book flows, and owner-write RLS.
