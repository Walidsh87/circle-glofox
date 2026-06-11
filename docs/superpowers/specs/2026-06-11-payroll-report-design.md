# Payroll report (#55) — design

Per-coach pay computed from rates × counts, on the existing `/dashboard/reports` infrastructure. **Scope fence:** no timecards, no clock-in/out, no base+bonus formulas — that's Tier 7 #59. A coach's pay here is `base component + PT component`, nothing else.

## Pay model

Each coach has one owner-edited pay setup (two components, both optional):

- **Base**: either `per_class` (AED × classes taught that month) **or** `monthly` (fixed AED; classes taught shown as info only) — never both.
- **PT add-on**: `pt_rate_aed` per delivered 1:1 session, payable on top of either base (covers "salaried + PT commission" and "freelancer per-class + per-PT").

`pay = basePay + ptRate × ptSessionsDelivered`. A coach with no setup shows "—" and a set-rate prompt; their pay is 0.

## Data (migration 054)

**`coach_pay_rates`** — `id`, `box_id` FK, `coach_id` FK profiles (UNIQUE per box: `UNIQUE (box_id, coach_id)`), `base_type` text CHECK in ('per_class','monthly') NULL, `base_rate_aed` numeric CHECK ≥ 0 NULL, `pt_rate_aed` numeric CHECK ≥ 0 NULL, `updated_at`. **Owner-only RLS for ALL operations** (coaches must not see each other's pay; members see nothing).

**`pt_sessions`** — `id`, `box_id` FK, `coach_id` FK profiles NOT NULL, `athlete_id` FK profiles NOT NULL, `credit_id` FK package_credits NULL (SET NULL on delete), `redeemed_at` timestamptz default now(), `redeemed_by` FK profiles NULL. **Owner-only RLS ALL.** Index `(box_id, coach_id, redeemed_at)`.

ROLLBACKS.md entries for both; header range → 054. Prod is current through 053 — 054 becomes one new paste in the SQL editor at ship time (pending-ops memory updated).

## PT attribution (the one change outside the report)

The member-profile **"Redeem session"** flow (PT-block credit) gains a **required coach picker** (dropdown of the box's coaches). The redeem action (`redeem-session.ts`) takes the `coachId`, validates it's a coach in the caller's box, and writes one `pt_sessions` row alongside the existing credit decrement (service-role insert, after the successful `consume_credit`). If the credit consumption fails, no log row is written. Honest limitations, documented in the report UI footnote: **PT counting starts from go-live** (no backfill exists), and group-class **substitutions are untracked** (class attribution = template's coach, as in the class-performance report).

## The math (pure lib `src/lib/reports/payroll.ts`)

`buildPayroll(coaches, rates, instances, ptSessions, monthStartIso, monthEndIso, nowIso)` → rows sorted by pay desc:
`{ coachId, coachName, baseType, baseRate, ptRate, classesTaught, ptCount, payAed }` + `totals { classesTaught, ptCount, payAed }` + `unassignedClasses` (count of in-month held instances whose template has no coach).

- "Classes taught" = instances in the calendar month (box timezone boundaries) that are non-cancelled AND `starts_at ≤ nowIso` (mid-month = pay-to-date, not projected) — attribution via the template's `coach_id` (same rule as the class-performance report).
- PT count = `pt_sessions` rows with `redeemed_at` inside the month.
- `per_class` base = baseRate × classesTaught; `monthly` base = baseRate (taught is informational); null base = 0. PT pay = ptRate × ptCount (null rate = 0).

## Page (`/dashboard/reports/payroll`)

Owner-only (`requireOwnerPage`), card added to the reports hub. Month header with ‹ › navigation (`?month=YYYY-MM`, default current, no future months). Table: coach · base (type + rate, inline-editable) · classes taught · PT rate (inline-editable) · PT sessions · pay (AED); totals row; `DownloadCsvButton`. Inline rate editor per row → owner-gated `savePayRate` action (upsert on `(box_id, coach_id)`; validation: base_type in the enum or null, rates non-negative numbers or null, base_rate required iff base_type set). "Unassigned classes" info line when > 0. Footnote with the two limitations.

## Testing

- `payroll.test.ts` (colocated): per-class math, monthly ignores taught, PT on top of both bases, PT-only coach, no-rate coach → 0 with flag, month boundaries in `Asia/Dubai` (instance at month edge), future-instance exclusion, cancelled exclusion, unassigned counting, totals, sort.
- Integration: `savePayRate` (owner-gated denial string preserved-style, upsert payload, validation errors) and extended `redeem-session` (coach required + validated in-box, `pt_sessions` row written after successful consumption, NOT written on failure, owner-gated as today).
