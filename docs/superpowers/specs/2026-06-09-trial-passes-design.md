# Trial Passes / Intro Offers — Design

**Date:** 2026-06-09
**Feature:** A trial is a plan-catalog type with a duration. Assigning a trial plan creates a time-limited membership that auto-expires; a free trial grants access immediately, a priced intro follows the normal pay-then-access flow.
**Roadmap:** v2 Tier 4 #32 (trial passes / intro offers). Builds on #27 (plan catalog) + the `end_date` entitlement model.

---

## Problem

Gyms run intro offers / free trials as the top of their funnel, but there's no first-class way to model one: an owner would manually create a membership with a hand-set future `end_date` and no trial label, no reusable definition, no access semantics for a "free" trial. This makes a trial a reusable plan type.

## Scope decisions (locked during brainstorming)

1. **Trial = a plan-catalog type** (`membership_plans.is_trial` + `trial_days`). Assigning it server-computes the membership's `end_date` and snapshots `is_trial`.
2. **Manual conversion.** The trial just expires (existing `end_date` logic); it surfaces in Retention as "expiring," prompting the owner to add a real plan. No auto-convert, no cron.
3. **Soft warning on repeat trials.** Non-blocking client warning if the athlete already had a trial; the owner decides.
4. **Free trial grants access; priced intro is pay-then-access.** A trial priced 0/null → `payment_status = 'paid'`; a priced intro → `'unpaid'` (normal flow).
5. **Trials are excluded from KPI member metrics** (MRR + active count) — a free-trial lead isn't a committed member.

## Approach (chosen: A)

Add trial fields to the plan catalog; `saveMembership` looks up the chosen plan and, when it's a trial, computes `end_date = start + trial_days`, sets `is_trial`, and picks `payment_status` by price. Badges + retention surfacing + auto-expiry reuse existing machinery.

Rejected: **B** a separate `trials` table/entity (duplicates the membership lifecycle — entitlement, end_date, expiry); **C** no catalog support (manual future `end_date` = just #29 with a label, no reusable trial definition).

---

## 1. Data — migration `036_trial_plans.sql`

```sql
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS is_trial   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_days integer CHECK (trial_days IS NULL OR trial_days > 0);

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS is_trial   boolean NOT NULL DEFAULT false;
```
No RLS change (owner-managed plans; service/owner-gated membership writes). + ROLLBACKS entry. **Manual deploy step (user only): run `036_trial_plans.sql` in Supabase.**

## 2. Plan validation — `payments/_lib/plan-validation.ts` (extend)

`validatePlan(name, monthlyPriceAed, providerPlanRef, isTrial?, trialDays?)`:
- existing rules unchanged.
- if `isTrial` is true: `trialDays` must be an integer ≥ 1 (else `'A trial plan needs a trial length in days.'`).
- if `isTrial` is false/undefined: `trialDays` ignored (stored null).
Pure, unit-tested. Keep the existing 3-arg calls working (new params optional, default non-trial).

## 3. Plan actions (extend create/edit)

`createMembershipPlan` + `editMembershipPlan` read `isTrial` (checkbox → boolean) + `trialDays` (int|null) from input, validate, and write `is_trial` + `trial_days`. (`toggle`/`delete` unchanged.)

## 4. Trial assignment — `saveMembership` (server-authoritative)

When `planId` is present, load the plan (box-scoped: `id, monthly_price_aed, is_trial, trial_days`). If `is_trial`:
- `end_date = addDays(start_date, plan.trial_days)` — a pure helper `addDays(iso, n)` in `src/lib/date-utils.ts` returning a `'YYYY-MM-DD'` UTC date (`new Date(Date.parse(iso+'T00:00:00Z') + n*86400000).toISOString().slice(0,10)`).
- `is_trial = true` on the insert.
- `payment_status = (plan.monthly_price_aed == null || plan.monthly_price_aed === 0) ? 'paid' : 'unpaid'`.

Non-trial memberships are unchanged (`end_date` null, `is_trial` false, `payment_status` 'unpaid'). The form's submitted `monthlyPrice`/`planName` remain the snapshot; the trial-specific fields are derived server-side from the authoritative plan (the form can't forge a trial length).

## 5. Soft warning (repeat trials) — client-only

The payments page builds `athletesWithTrials: string[]` (distinct `athlete_id` from memberships where `is_trial = true`) and passes it + the plans' `is_trial` flag to `AddMembershipForm`. When the picked plan `is_trial` **and** the chosen athlete is in that set, the form renders a non-blocking inline warning ("This athlete has had a trial before."). Submit is still allowed.

## 6. UI

- **Plan catalog** (`AddMembershipPlanForm`, `MembershipPlanRow`): a **Trial** checkbox + a **Trial days** number input (enabled when checked). The catalog list shows a "Trial · N days" tag on trial plans. `AddMembershipForm`'s plan `<select>` options mark trials (e.g. "7-Day Trial · trial").
- **Member page + payments**: a **"Trial · ends {end_date}"** badge when `is_trial` (distinct from the "Cancels on" badge). The `Plan` type passed to the form/row gains `is_trial`/`trial_days`.

## 7. KPI — `kpi/_lib/metrics.ts`

`mrrAt`/`activeAt` exclude `is_trial` memberships (a trial lead isn't a committed member). Add `is_trial?: boolean` to the KPI `MembershipRow`; extend `activeOn` to `&& !r.is_trial`. The KPI page memberships select adds `is_trial`. (Retention needs no change — a trial's `end_date` already surfaces it as "expiring.")

## 8. Testing

- **`plan-validation`** (extend): trial with no/zero `trialDays` → error; trial with positive `trialDays` → null; non-trial ignores `trialDays`.
- **`addDays`** (pure): `addDays('2026-06-01', 7) === '2026-06-08'`; month/year rollover.
- **`saveMembership` integration** (extend): a trial plan → insert has `end_date = start + trial_days`, `is_trial: true`, and `payment_status` `'paid'` when free / `'unpaid'` when priced; a non-trial plan → unchanged.
- **KPI** (extend): a trial membership is excluded from `mrrAt`/`activeAt`.

## 9. Out of scope (YAGNI)

Auto-conversion to a paid plan · hard block on repeat trials · trial-specific booking caps ("max 3 classes") · member-facing trial signup/storefront · prorating a trial · trial-specific reminder emails.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/036_trial_plans.sql` + `ROLLBACKS.md` | create / modify | trial columns |
| `payments/_lib/plan-validation.ts` + `src/__tests__/plan-validation.test.ts` | modify | trial validation |
| `src/lib/date-utils.ts` `addDays` + `src/__tests__/add-days.test.ts` | create | pure date helper |
| `payments/_actions/create-membership-plan.ts`, `edit-membership-plan.ts` | modify | read/write trial fields |
| `payments/_actions/save-membership.ts` | modify | trial → end_date/is_trial/payment_status |
| `src/__tests__/save-membership.integration.test.ts` | modify | trial assignment |
| `kpi/_lib/metrics.ts` + `kpi/page.tsx` + `src/__tests__/kpi-metrics.test.ts` | modify | exclude trials |
| `payments/_components/add-membership-plan-form.tsx`, `membership-plan-row.tsx` | modify | trial inputs + tag |
| `payments/_components/add-membership-form.tsx` | modify | trial select marker + soft warning |
| `payments/page.tsx` | modify | load trial fields + athletesWithTrials |
| `members/[memberId]/page.tsx` | modify | trial badge |

**One migration (036).** Reuses the plan catalog, the `end_date` entitlement, the KPI exclusion pattern, and the retention expiry surfacing.
