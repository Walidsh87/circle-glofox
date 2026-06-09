# Prorations on Mid-Cycle Plan Changes — Design

**Date:** 2026-06-09
**Feature:** An owner changes a member's plan mid-cycle; the app computes the daily proration (credit unused old + charge remaining new for the rest of the current cycle), shows the net for manual settlement, and switches the membership to the new plan in place.
**Roadmap:** v2 Tier 4 #31. Builds on #27 (plan catalog) + the `getDueDate` billing-cycle model.

---

## Problem

There's no plan-change flow today — switching plans means manually ending one membership and adding another, with no proration. Owners need a fair mid-cycle adjustment: a member upgrading owes the prorated difference; a member downgrading is credited.

## Scope decisions (locked during brainstorming)

1. **Keep the same billing date.** The membership switches to the new plan **in place**; the cycle anchor (`last_paid_date`/`start_date`) is unchanged, so the next renewal date doesn't move. Standard proration, no double-charge.
2. **Net is display-only.** Compute + show "member owes X" / "credit Y" at change time; the owner settles at the desk (existing manual flow). No formal invoice/credit-note.
3. **Daily proration** over the current cycle `[anchor, dueDate)`, `dueDate = anchor + 1 month`.

## Approach (chosen: A)

A pure `computeProration` powers a live preview on the member page; confirming runs `changePlan(membershipId, newPlanId)` which updates the membership's plan fields in place. No migration.

Rejected: **B** end-old + start-new (cycle resets; proration overlaps the new first cycle); **C** auto-generate an invoice/credit-note (real billing machinery + FTA edge cases — defer).

---

## 1. Pure core — `src/lib/proration.ts`

```ts
export type Proration = {
  creditAed: number   // unused old plan, refunded
  chargeAed: number   // remaining new plan
  netAed: number      // chargeAed - creditAed (positive = member owes; negative = credit)
  unusedDays: number
  cycleDays: number
}

// Daily proration over the current cycle [anchor, dueDate). anchor = last_paid_date ?? start_date,
// dueDate = anchor + 1 calendar month (matches getDueDate). All dates 'YYYY-MM-DD'.
export function computeProration(
  oldMonthly: number,
  newMonthly: number,
  anchor: string,
  changeDate: string,
): Proration
```

Logic:
- `dueDate` = anchor + 1 month (UTC `setUTCMonth(+1)`, same as `getDueDate`).
- `cycleDays = days(dueDate) − days(anchor)`; if `cycleDays <= 0` → all-zero result.
- `unusedDays = clamp(days(dueDate) − days(changeDate), 0, cycleDays)`.
- `fraction = unusedDays / cycleDays`.
- `creditAed = round2(oldMonthly × fraction)`, `chargeAed = round2(newMonthly × fraction)`, `netAed = round2(chargeAed − creditAed)`.

Edge cases: `changeDate` at cycle start → `fraction = 1` (full reprice, net = newMonthly − oldMonthly); at/after `dueDate` → `unusedDays = 0` → net 0; equal prices → net 0. Pure, unit-tested. (`round2(x) = Math.round(x*100)/100`.)

## 2. Action — `payments/_actions/change-plan.ts`

`changePlan(membershipId: string, newPlanId: string): Promise<{ error: string | null }>`:
- RLS client, `auth.getUser`, `profile.role === 'owner'` gate.
- Load the new plan box-scoped: `membership_plans` → `name, monthly_price_aed, provider_plan_ref, is_trial`. Not found → error. **`is_trial` true → reject** ("Change to a trial plan isn't supported.").
- **Update the membership in place** (scoped by `id` + `box_id`): `{ plan_id: newPlanId, plan_name: <plan.name>, monthly_price_aed: <plan.monthly_price_aed>, provider_plan_ref: <plan.provider_plan_ref> }`. **Leave `last_paid_date`, `start_date`, `payment_status`, `end_date` untouched** (cycle preserved; the prorated delta is settled manually).
- `revalidatePath('/dashboard/payments')` + `revalidatePath('/dashboard/members/[memberId]', 'page')`.

No proration math server-side — the net is informational and computed client-side for the preview.

## 3. UI — `members/[memberId]/_components/change-plan.tsx` (owner-only)

A "Change plan" control rendered near the membership card (owner only, when there's an active non-trial membership). Props: `membershipId`, `currentMonthly: number | null`, `anchor: string` (= `last_paid_date ?? start_date`), `today: string`, `plans: { id; name; monthly_price_aed: number | null }[]` (active, non-trial).

Behavior: a plan `<select>`; on pick, compute `computeProration(currentMonthly ?? 0, newMonthly ?? 0, anchor, today)` and show a live preview — "Switching to **{name}**: member **owes {net} AED**" (net > 0) / "**credit {−net} AED**" (net < 0) / "no change" (net 0), with a small `credit {creditAed} · charge {chargeAed}` breakdown. A **Confirm change** button calls `changePlan(membershipId, planId)` (via `useTransition`; `alert` on error).

## 4. Member page wiring — `members/[memberId]/page.tsx`

- The membership select already has `monthly_price_aed, start_date, last_paid_date`. Add `plan_id` (to exclude the current plan from the switch list, optional) — or just show all active non-trial plans.
- For owners, load the plan catalog: `membership_plans` → `id, name, monthly_price_aed` where `box_id = viewer.box_id AND active AND NOT is_trial` (order by name). (The page already does an owner-only `Promise.all` for `activePackages`/`memberCredits` — add the plans load there.)
- Render `<ChangePlan ... />` (owner + active non-trial membership) near the membership-lifecycle block, passing `anchor = activeMembership.last_paid_date ?? activeMembership.start_date` and `today`.

## 5. Testing

- **`proration.test.ts`** (pure): upgrade mid-cycle → positive net; downgrade → negative net; equal prices → 0; change at cycle start → `net = newMonthly − oldMonthly`; change at/after due date → 0; a known fraction (e.g. anchor `2026-06-01`, change `2026-06-16`, 300→500 over a 30-day cycle → assert credit/charge/net); `cycleDays <= 0` guard.
- **`change-plan.integration.test.ts`**: `changePlan` updates the membership with the new plan's fields, scoped by `id` + `box_id`, and does **not** set `last_paid_date`/`start_date`/`payment_status`; a non-owner is rejected; a trial-target plan is rejected.

## 6. Out of scope (YAGNI)

Formal invoice/credit-note generation · cycle reset · Stripe proration sync · plan-change history/audit log · prorating trials · auto-flipping `payment_status` on a change · multi-currency.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `src/lib/proration.ts` + `src/__tests__/proration.test.ts` | create | `computeProration` (pure) |
| `payments/_actions/change-plan.ts` | create | in-place plan switch (owner) |
| `src/__tests__/change-plan.integration.test.ts` | create | action tests |
| `members/[memberId]/_components/change-plan.tsx` | create | preview + confirm UI |
| `members/[memberId]/page.tsx` | modify | load plans + render ChangePlan |

**No migration.** Reuses `memberships` plan/cycle fields + the `membership_plans` catalog + the `getDueDate` cycle model.
