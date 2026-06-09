# Membership Plan Catalog — Design

**Date:** 2026-06-09
**Feature:** Owners define a reusable catalog of recurring membership plans (name + monthly price + optional Stripe Price ID); adding a membership picks a plan that prefills the form, replacing today's re-typed free-text `plan_name`.
**Roadmap:** v2 Tier 4 #27 (membership type catalog — recurring plans).

---

## Problem

Today an owner re-types a free-text plan name and re-enters the price for every membership (`AddMembershipForm` → `saveMembership`). That's error-prone ("Unlimited" vs "unltd"), loses the Stripe Price ID mapping, and gives no structured plan model for later work (#31 prorations, #32 trials). Credit-based products (drop-in / class pack / PT block) are **already** the Packages catalog — so this is specifically the **recurring-membership** catalog.

## Scope decisions (locked during brainstorming)

1. **Minimal plan fields:** name, `monthly_price_aed`, optional `provider_plan_ref` (Stripe Price ID), `active`. No type/category or billing interval (everything is monthly — YAGNI).
2. **Prefill, still editable + snapshot.** Picking a plan copies name/price/Stripe-ref into the form (editable); the membership stores those as a snapshot **plus** a `plan_id` reference. Editing a plan later never changes existing members' price.
3. **Owner-only.** Plan management + the add-membership flow are already owner-gated; no athlete storefront (unlike Packages).
4. **Boundary:** recurring plans only; credit-based products stay in the Packages catalog.

## Approach (chosen: A)

A `membership_plans` catalog table (mirroring the Packages catalog's CRUD + delete-guard), a nullable `memberships.plan_id` reference (RESTRICT on delete), owner CRUD on the payments page, and an `AddMembershipForm` plan `<select>` that prefills the existing fields.

Rejected: **B** derive "plans" from `DISTINCT plan_name` (no real catalog — no price/Stripe reuse, no edit/deactivate); **C** replace `plan_name` with a live `plan_id` (editing a plan would retroactively re-price every existing member — breaks billing integrity).

---

## 1. Data — migration `035_membership_plans.sql`

```sql
CREATE TABLE IF NOT EXISTS membership_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id             uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name               text NOT NULL,
  monthly_price_aed  numeric(10,2) CHECK (monthly_price_aed IS NULL OR monthly_price_aed >= 0),
  provider_plan_ref  text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;

-- Owners manage + read their gym's plans (payments/membership creation are owner-only).
DROP POLICY IF EXISTS membership_plans_owner_all ON membership_plans;
CREATE POLICY membership_plans_owner_all ON membership_plans
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE INDEX IF NOT EXISTS idx_membership_plans_box ON membership_plans (box_id, active);

-- A membership references the plan it came from (RESTRICT: a plan with memberships can't be
-- deleted → deactivate). Existing memberships keep plan_id NULL. The membership's own
-- plan_name/monthly_price_aed remain the billing snapshot.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES membership_plans(id);
```

+ ROLLBACKS entry. **Manual deploy step (user only): run `035_membership_plans.sql` in Supabase.**

## 2. Validation — `payments/_lib/plan-validation.ts` (pure, tested)

```ts
export function validatePlan(name: string, monthlyPriceAed: number | null, providerPlanRef: string | null): string | null
```
- `name`: non-empty, ≤ 80 chars.
- `monthlyPriceAed`: null OR a finite number ≥ 0.
- `providerPlanRef`: null OR ≤ 120 chars (no format enforcement — Stripe IDs vary).
Returns a human-readable error or null.

## 3. Actions (owner-only) — `payments/_actions/` (mirror the Packages catalog)

All: RLS client, `auth.getUser`, `profile.role === 'owner'` gate, `validatePlan`, box-scoped writes, `revalidatePath('/dashboard/payments')`.
- `createMembershipPlan(name, monthlyPriceAed, providerPlanRef)` — insert `{ box_id, name, monthly_price_aed, provider_plan_ref }`.
- `editMembershipPlan(planId, name, monthlyPriceAed, providerPlanRef)` — update, scoped by `id` + `box_id`.
- `toggleMembershipPlan(planId, active)` — update `{ active }`.
- `deleteMembershipPlan(planId)` — delete; `23503` → `'Cannot delete: this plan is in use. Deactivate it instead.'`

`saveMembership` (modify): read an optional `planId` from the FormData; include `plan_id` on the membership insert (the submitted `planName`/`monthlyPrice`/`stripePriceId` remain the snapshot). No other change.

## 4. UI

- **Payments page** (`payments/page.tsx`, owner): load `membership_plans`; render a **"Membership plans"** section — a create form + a list of plans (name · price · Stripe ref · active toggle · edit · delete), mirroring the Packages catalog list. Pass the **active** plans to `AddMembershipForm`.
- **`AddMembershipForm`** (`_components/add-membership-form.tsx`): add a plan `<select>` (active plans) above the existing inputs. On change, a small client handler prefills `planName`, `monthlyPrice`, and `stripePriceId` from the chosen plan and sets a hidden `planId` input. Inputs stay editable; picking nothing keeps the current free-text flow.
- New client components as needed: `_components/membership-plan-manager.tsx` (the catalog section) — or compose from small create/row components mirroring the Packages catalog components.

## 5. Testing

- **`plan-validation.test.ts`** (pure): valid → null; empty name → error; over-long name → error; negative price → error; null price OK; over-long Stripe ref → error.
- **`membership-plans.integration.test.ts`**: `createMembershipPlan` inserts box-scoped; `editMembershipPlan`/`toggleMembershipPlan` update scoped by id+box; `deleteMembershipPlan` maps `23503` to the deactivate message; a non-owner is rejected.
- **`save-membership`** (extend its test if present, else add): a submitted `planId` is written as `plan_id`.

## 6. Out of scope (YAGNI)

Plan type/category + billing interval · credit-based products (Packages) · member-facing plan storefront · auto-creating a Stripe plan from a catalog entry · retroactive re-pricing of existing members · proration (#31) · trials (#32).

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/035_membership_plans.sql` | create | `membership_plans` + `memberships.plan_id` |
| `migrations/ROLLBACKS.md` | modify | `### 035_membership_plans` |
| `payments/_lib/plan-validation.ts` | create, pure | `validatePlan` |
| `src/__tests__/plan-validation.test.ts` | create | validator tests |
| `payments/_actions/create-membership-plan.ts` (+ edit/toggle/delete) | create | owner CRUD |
| `payments/_actions/save-membership.ts` | modify | store `plan_id` |
| `src/__tests__/membership-plans.integration.test.ts` | create | action tests |
| `payments/_components/membership-plan-manager.tsx` | create | catalog section UI |
| `payments/_components/add-membership-form.tsx` | modify | plan select + prefill |
| `payments/page.tsx` | modify | load plans + render section + pass to form |

**One migration (035).** Mirrors the Packages catalog CRUD/guard; reuses the owner-gated payments surface and the membership snapshot model.
