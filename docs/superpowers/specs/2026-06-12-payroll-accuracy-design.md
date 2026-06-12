# Payroll accuracy pack — substitutions, class-type rates, adjustments (#59 part 1) — Design

**Date:** 2026-06-12
**Roadmap:** Tier 7 #59 `[Wedge]` Coach payroll + timecards native — this ships the accuracy half (user-approved); **clock-in/out timecards stay open as the #59 remainder**.
**Builds on #55** (mig 054 `coach_pay_rates` + `pt_sessions`, `/dashboard/reports/payroll`, pure `buildPayroll`). Fixes #55's documented limit: substitutions untracked (template coach paid).

## Migration `063_payroll_accuracy.sql` (idempotent, + ROLLBACKS.md entry; owner-only RLS mirroring `coach_pay_rates`)

```sql
-- Per-class-type rate override (e.g. Yoga pays differently than CrossFit).
CREATE TABLE IF NOT EXISTS coach_class_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES class_templates(id) ON DELETE CASCADE,
  rate_aed    numeric(10,2) NOT NULL CHECK (rate_aed >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, coach_id, template_id)
);
-- + ENABLE RLS + coach_class_rates_owner_all (FOR ALL, auth_role()='owner' AND box pin)

-- Manual monthly bonus/deduction lines.
CREATE TABLE IF NOT EXISTS pay_adjustments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month      text NOT NULL,                       -- 'YYYY-MM', matches the report picker
  amount_aed numeric(10,2) NOT NULL,              -- negative = deduction
  note       text NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- + ENABLE RLS + pay_adjustments_owner_all (FOR ALL, owner + box pin)
-- + INDEX (box_id, month)
```

## A — substitution-accurate pay

- **Counting**: payroll page instance fetch becomes `select('starts_at, coach_id, template_id, class_templates(coach_id)')`; the lib resolves each instance's payee as **`coach_id ?? template_coach_id`** (instances copy the template coach at generation — `generate-instances.ts:78` — so the fallback only covers legacy/odd rows). Unassigned warning keeps counting instances with neither.
- **Swap UI**: `setInstanceCoach(instanceId, coachId | null)` — `requireProgrammingAction('Only coaches can reassign classes.')`; instance box-pinned via RLS update (class_instances programming write policy exists post-058); when non-null, coach must be box staff (`ALL_STAFF_ROLES`... validation: target profile in box with a staff role). A compact coach `<select>` on each prep-page class block (rendered for programming-tier viewers only; receptionists see the name as today). Prep page already fetches the day's instances; it gains the box coach list + each instance's `coach_id`.

## B — per-class-type rate overrides

**Earnings rule (explicit):**
- `per_class` coach: for each taught instance, pay the override for that instance's template if one exists, else `base_rate_aed`. (No override anywhere → bit-identical to today.)
- `monthly` coach: salary as today **plus** the override rate for each taught instance of an overridden template (specialty-class add-on). Non-overridden classes remain covered by salary.
- Coach with no base setup but with overrides: overridden classes pay; `hasRate` stays driven by the base row (the "no rate set" warning logic unchanged).

**Owner UI** on the payroll page: under each coach row, an expandable "Class-type rates" editor — existing overrides listed (template name · AED rate · remove) + add form (template select over the box's templates + rate input). Actions `saveClassRate(coachId, templateId, rateAed)` (upsert, owner, validate rate ≥ 0) and `deleteClassRate(id)` (owner, box-pinned).

## D — adjustments

- Report gains an **Adjustments** column (sum of the month's lines per coach; negative shows as −AED) included in `payAed` totals and the CSV.
- Below the table: "Adjustments — {month}" owner section listing lines (coach · amount · note · remove) + add form (coach select, amount [≠ 0, two decimals, negative allowed], note [required, ≤ 200 chars]). Actions `addPayAdjustment(coachId, month, amountAed, note)` / `deletePayAdjustment(id)` — owner, box-pinned; month must match `^\d{4}-\d{2}$`.

## Pure lib changes — `src/lib/reports/payroll.ts` (backward-compatible)

- `PayrollInstance` gains **optional** `template_id?: string | null` and `template_coach_id?: string | null` (existing fixtures compile).
- New row types: `ClassRateRow = { coach_id, template_id, rate_aed }`, `AdjustmentRow = { coach_id, amount_aed }` (page pre-filters adjustments to the picked month).
- `buildPayroll(..., nowIso, classRates: ClassRateRow[] = [], adjustments: AdjustmentRow[] = [])` — appended optional params; existing call sites/tests untouched.
- `PayrollRow` gains `adjustmentsAed: number`; `payAed` includes overrides + adjustments per the rules above.
- New validators: `validateClassRate(rateAed)` and `validateAdjustment(amountAed, note, month)` (pure, tested).

## Surfaces touched

| Surface | Change |
|---|---|
| `/dashboard/reports/payroll` | instance fetch columns; class-rate + adjustment fetches; Adjustments column; per-coach override editor; month adjustments section; CSV columns |
| `/dashboard/prep` | coach picker per class block (programming-tier) |
| `src/lib/reports/payroll.ts` | resolution, override + adjustment math, validators |

## Testing (~20: ~12 lib + ~8 action; existing suites untouched)

- Lib: payee resolution (instance coach, template fallback, neither → unassigned), per_class override replaces / mixed templates, monthly additive override, no-override bit-identity, adjustments sum incl. negative, `adjustmentsAed` in row, validators (rate <0; amount 0 / note empty / note >200 / bad month).
- Actions (mock queues): `setInstanceCoach` (non-programming rejected; non-staff target rejected; happy box-pinned update), `saveClassRate` (non-owner; invalid rate; happy upsert), `addPayAdjustment` (validation error; happy insert with created_by), `deletePayAdjustment`/`deleteClassRate` (happy box-pinned delete).

## Verification

House gate → apply mig 063 to prod (docker psql; probes: 2 tables, 2 policies, 0 rows) → roadmap #59 stays ⬜ with a bold partial note in house style (*accuracy pack ✅ 2026-06-12 — mig 063, subs/type-rates/adjustments; clock-in/out timecards remain*) → push. Manual smoke: swap a coach on prep → payroll attributes the class; add a Yoga override + a bonus line → totals and CSV reflect both.

## Deferred

Clock-in/out timecards (the #59 remainder — own brainstorm when wanted); hourly base type; rate-change audit events (#68 hook is 3 lines when wanted); multi-month adjustment views.
