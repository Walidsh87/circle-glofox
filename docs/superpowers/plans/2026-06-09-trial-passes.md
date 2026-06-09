# Trial Passes / Intro Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A trial is a plan-catalog type with a duration; assigning it creates a time-limited membership (`end_date = start + trial_days`, `is_trial` snapshot), free→`paid`/priced→`unpaid`, auto-expiring via existing `end_date` logic.

**Architecture:** Trial columns on `membership_plans` + `memberships`; `saveMembership` looks up the chosen plan and derives the trial fields server-side. Badges + retention surfacing + KPI exclusion reuse existing machinery.

**Tech Stack:** Next.js 16 server actions, Supabase, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-09-trial-passes-design.md`. Builds on #27 (plan catalog) + the `end_date` entitlement.

**Conventions reused (read once):**
- Plan catalog (#27): `payments/_lib/plan-validation.ts` (`validatePlan`), `_actions/{create,edit}-membership-plan.ts`, `_components/{add-membership-plan-form,membership-plan-row,add-membership-form}.tsx`, `saveMembership`. KPI exclusion pattern: `kpi/_lib/metrics.ts` `activeOn` (already excludes frozen via `isFrozenOn`).
- Tests flat in `src/__tests__/`; single-client mock `helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `migrations/036_trial_plans.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `src/lib/date-utils.ts` + `src/__tests__/add-days.test.ts` | create |
| `payments/_lib/plan-validation.ts` + `src/__tests__/plan-validation.test.ts` | modify |
| `payments/_actions/create-membership-plan.ts`, `edit-membership-plan.ts` | modify |
| `payments/_actions/save-membership.ts` + `src/__tests__/save-membership.integration.test.ts` | modify |
| `kpi/_lib/metrics.ts` + `kpi/page.tsx` + `src/__tests__/kpi-metrics.test.ts` | modify |
| `payments/_components/add-membership-plan-form.tsx`, `membership-plan-row.tsx`, `add-membership-form.tsx` | modify |
| `payments/page.tsx`, `members/[memberId]/page.tsx` | modify |

---

## Task 1: Migration 036

**Files:** Create `migrations/036_trial_plans.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Migration**

Create `migrations/036_trial_plans.sql`:

```sql
-- migrations/036_trial_plans.sql
-- Trial passes / intro offers (#32): a trial is a plan-catalog type with a duration.
-- Assigning a trial plan creates a time-limited membership (end_date computed). Idempotent.
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS is_trial   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_days integer CHECK (trial_days IS NULL OR trial_days > 0);

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS is_trial   boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: ROLLBACKS entry**

Change header range `008`–`035` → `008`–`036`. Add above `### 035_membership_plans`:

```markdown
### 036_trial_plans
```sql
ALTER TABLE memberships DROP COLUMN IF EXISTS is_trial;
ALTER TABLE membership_plans DROP COLUMN IF EXISTS is_trial, DROP COLUMN IF EXISTS trial_days;
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/036_trial_plans.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(trials): migration 036 — trial columns on membership_plans + memberships

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure helpers — `addDays` + trial validation

**Files:** Create `src/lib/date-utils.ts`, `src/__tests__/add-days.test.ts`; Modify `payments/_lib/plan-validation.ts`, `src/__tests__/plan-validation.test.ts`.

- [ ] **Step 1: Failing tests**

Create `src/__tests__/add-days.test.ts`:

```ts
import { addDays } from '@/lib/date-utils'

test('adds days within a month', () => expect(addDays('2026-06-01', 7)).toBe('2026-06-08'))
test('rolls over a month', () => expect(addDays('2026-06-28', 7)).toBe('2026-07-05'))
test('rolls over a year', () => expect(addDays('2026-12-30', 5)).toBe('2027-01-04'))
test('zero days is identity', () => expect(addDays('2026-06-01', 0)).toBe('2026-06-01'))
```

Append to `src/__tests__/plan-validation.test.ts`:

```ts
test('trial plan with positive days → null', () => expect(validatePlan('Trial', 0, null, true, 7)).toBeNull())
test('trial plan with no days → error', () => expect(validatePlan('Trial', 0, null, true, null)).toMatch(/trial length/i))
test('trial plan with zero days → error', () => expect(validatePlan('Trial', 0, null, true, 0)).toMatch(/trial length/i))
test('non-trial ignores trial days', () => expect(validatePlan('Std', 300, null, false, null)).toBeNull())
```

- [ ] **Step 2: Run → fail** (`npm test -- add-days plan-validation`).

- [ ] **Step 3: Implement**

Create `src/lib/date-utils.ts`:

```ts
// Add n days to an ISO 'YYYY-MM-DD' date, returning a 'YYYY-MM-DD' UTC date.
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
}
```

In `payments/_lib/plan-validation.ts`, extend the signature + add the trial rule:

```ts
export function validatePlan(
  name: string,
  monthlyPriceAed: number | null,
  providerPlanRef: string | null,
  isTrial: boolean = false,
  trialDays: number | null = null,
): string | null {
  if (!name?.trim()) return 'Plan name is required.'
  if (name.trim().length > 80) return 'Plan name is too long (max 80 characters).'
  if (monthlyPriceAed !== null && (!Number.isFinite(monthlyPriceAed) || monthlyPriceAed < 0)) {
    return 'Price must be zero or a positive amount.'
  }
  if (providerPlanRef !== null && providerPlanRef.length > 120) {
    return 'Stripe Price ID is too long.'
  }
  if (isTrial && (!Number.isInteger(trialDays) || (trialDays as number) < 1)) {
    return 'A trial plan needs a trial length in days.'
  }
  return null
}
```

- [ ] **Step 4: Run → pass** (`npm test -- add-days plan-validation`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/date-utils.ts src/__tests__/add-days.test.ts src/app/dashboard/payments/_lib/plan-validation.ts src/__tests__/plan-validation.test.ts
git commit -m "$(cat <<'EOF'
feat(trials): addDays helper + validatePlan trial-length rule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Plan actions write trial fields

**Files:** Modify `create-membership-plan.ts`, `edit-membership-plan.ts`.

- [ ] **Step 1: `createMembershipPlan`**

After reading `providerPlanRef`, read the trial fields and pass them through:
```ts
  const isTrial = formData.get('isTrial') === 'on'
  const trialRaw = (formData.get('trialDays') as string)?.trim()
  const trialDays = isTrial && trialRaw ? parseInt(trialRaw) : null
```
Change the validate call to `validatePlan(name, monthlyPrice, providerPlanRef, isTrial, trialDays)` and the insert to include:
```ts
    is_trial: isTrial,
    trial_days: trialDays,
```

- [ ] **Step 2: `editMembershipPlan`**

Extend the signature + validation + update:
```ts
export async function editMembershipPlan(
  planId: string,
  name: string,
  monthlyPriceAed: number | null,
  providerPlanRef: string | null,
  isTrial: boolean = false,
  trialDays: number | null = null,
): Promise<{ error: string | null }> {
  const err = validatePlan(name, monthlyPriceAed, providerPlanRef, isTrial, trialDays)
  if (err) return { error: err }
  // ... owner gate unchanged ...
  const { error } = await supabase
    .from('membership_plans')
    .update({ name: name.trim(), monthly_price_aed: monthlyPriceAed, provider_plan_ref: providerPlanRef, is_trial: isTrial, trial_days: isTrial ? trialDays : null })
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  // ...
}
```

- [ ] **Step 3: Verify** — `npm test -- membership-plans` (existing action tests still pass; they call edit with 4 args → isTrial defaults false). Type-check + lint.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/payments/_actions/create-membership-plan.ts src/app/dashboard/payments/_actions/edit-membership-plan.ts
git commit -m "$(cat <<'EOF'
feat(trials): plan create/edit read + write is_trial + trial_days

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `saveMembership` trial assignment

**Files:** Modify `save-membership.ts`, `src/__tests__/save-membership.integration.test.ts`.

- [ ] **Step 1: Derive trial fields server-side**

In `save-membership.ts`, add the import:
```ts
import { addDays } from '@/lib/date-utils'
```
After the owner gate (before the insert), look up the plan when `planId` is present and derive the trial fields:
```ts
  let endDate: string | null = null
  let isTrial = false
  let trialPaymentStatus: 'paid' | 'unpaid' | null = null
  if (planId) {
    const { data: plan } = await supabase
      .from('membership_plans')
      .select('monthly_price_aed, is_trial, trial_days')
      .eq('id', planId)
      .eq('box_id', profile.box_id)
      .single()
    if (plan?.is_trial && plan.trial_days) {
      isTrial = true
      endDate = addDays(startDate, plan.trial_days)
      trialPaymentStatus = (plan.monthly_price_aed == null || Number(plan.monthly_price_aed) === 0) ? 'paid' : 'unpaid'
    }
  }
```
Update the insert:
```ts
  const { error } = await supabase.from('memberships').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    plan_name: planName,
    monthly_price_aed: monthlyPrice,
    start_date: startDate,
    payment_status: trialPaymentStatus ?? 'unpaid',
    is_trial: isTrial,
    ...(endDate ? { end_date: endDate } : {}),
    ...(stripePriceId ? { provider_plan_ref: stripePriceId } : {}),
    ...(planId ? { plan_id: planId } : {}),
  })
```

- [ ] **Step 2: Extend the integration test**

In `src/__tests__/save-membership.integration.test.ts`, the existing test's mock has no `membership_plans` result → the new plan lookup `.single()` returns `{ data: null }` → not a trial → unchanged behaviour (still asserts `plan_id`/`plan_name`). Add two trial tests:

```ts
test('a free trial plan sets end_date, is_trial, and paid', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'o1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'owner' }, error: null },
      memberships: { data: null, error: null },
      membership_plans: { data: { monthly_price_aed: 0, is_trial: true, trial_days: 7 }, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveMembership({ error: null }, form({ athleteId: 'a1', planName: '7-Day Trial', monthlyPrice: '0', startDate: '2026-06-01', planId: 'trial-1' }))
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').insert).toHaveBeenCalledWith(expect.objectContaining({
    is_trial: true, end_date: '2026-06-08', payment_status: 'paid', plan_id: 'trial-1',
  }))
})

test('a priced intro trial stays unpaid', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'o1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'owner' }, error: null },
      memberships: { data: null, error: null },
      membership_plans: { data: { monthly_price_aed: 50, is_trial: true, trial_days: 14 }, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveMembership({ error: null }, form({ athleteId: 'a1', planName: 'Intro', monthlyPrice: '50', startDate: '2026-06-01', planId: 'trial-2' }))
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').insert).toHaveBeenCalledWith(expect.objectContaining({
    is_trial: true, end_date: '2026-06-15', payment_status: 'unpaid',
  }))
})
```

NOTE: the existing "stores plan_id" test now also issues the plan lookup; its mock returns `{ data: null }` for `membership_plans` (default), so `is_trial` stays false and the insert is asserted via `objectContaining` (the added `is_trial: false`/no `end_date` don't break it).

- [ ] **Step 3: Verify** — `npm test -- save-membership` → PASS. Type-check + lint.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/payments/_actions/save-membership.ts src/__tests__/save-membership.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(trials): saveMembership derives trial end_date/is_trial/payment_status from the plan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Exclude trials from KPI member metrics

**Files:** Modify `kpi/_lib/metrics.ts`, `kpi/page.tsx`, `src/__tests__/kpi-metrics.test.ts`.

- [ ] **Step 1: Failing test** — append to `kpi-metrics.test.ts`:

```ts
describe('trial exclusion', () => {
  const trial = [{ athlete_id: 't', monthly_price_aed: 0, start_date: '2026-01-01', end_date: '2026-12-31', is_trial: true }]
  test('a trial membership is excluded from MRR/active', () => {
    expect(mrrAt(trial, '2026-06-01')).toBe(0)
    expect(activeAt(trial, '2026-06-01')).toBe(0)
  })
})
```

- [ ] **Step 2: Implement** — in `metrics.ts`, add `is_trial?` to the type and gate `activeOn`:

```ts
export type MembershipRow = { athlete_id: string; monthly_price_aed: number | null; start_date: string; end_date: string | null; frozen_from?: string | null; frozen_until?: string | null; is_trial?: boolean | null }
```
```ts
function activeOn(r: MembershipRow, onDate: string): boolean {
  return r.start_date <= onDate && (r.end_date === null || r.end_date > onDate) && !isFrozenOn(r, onDate) && !r.is_trial
}
```

- [ ] **Step 3: KPI page select** — in `kpi/page.tsx`, add `is_trial` to the memberships select:
```ts
    supabase.from('memberships').select('athlete_id, monthly_price_aed, start_date, end_date, frozen_from, frozen_until, is_trial').eq('box_id', profile.box_id),
```

- [ ] **Step 4: Run → pass** (`npm test -- kpi-metrics`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/kpi/_lib/metrics.ts src/app/dashboard/kpi/page.tsx src/__tests__/kpi-metrics.test.ts
git commit -m "$(cat <<'EOF'
feat(trials): exclude trial memberships from KPI MRR + active count

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: UI — catalog trial inputs, soft warning, badges

**Files:** Modify `add-membership-plan-form.tsx`, `membership-plan-row.tsx`, `add-membership-form.tsx`, `payments/page.tsx`, `members/[memberId]/page.tsx`. No new tests (UI; type-check + lint + build).

- [ ] **Step 1: `AddMembershipPlanForm` — trial checkbox + days**

Add `useState` for the trial toggle and inputs before `<SubmitButton />`:
```tsx
// at top of the component body:
  const [isTrial, setIsTrial] = useState(false)
```
```tsx
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--c-ink-2)' }}>
        <input type="checkbox" name="isTrial" checked={isTrial} onChange={(e) => setIsTrial(e.target.checked)} /> Trial
      </label>
      {isTrial && <input name="trialDays" type="number" min={1} placeholder="Trial days" style={{ ...inputStyle, width: 110 }} />}
```
(Add `import { useState } from 'react'` if not already imported — the file imports `useEffect, useRef`; change to `useEffect, useRef, useState`.) On reset, the uncontrolled checkbox resets; also reset the controlled `isTrial` in the existing success effect: `setIsTrial(false)`.

- [ ] **Step 2: `MembershipPlanRow` — trial tag + edit fields**

Extend the `Plan` type with `is_trial: boolean; trial_days: number | null`. In the display row, after the plan name, show a tag when `plan.is_trial`:
```tsx
        {plan.is_trial && <span className="mono" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>TRIAL · {plan.trial_days}d</span>}
```
In edit mode, add a trial checkbox + days input (state `isTrial`, `trialDays` seeded from the plan), and pass them to `editMembershipPlan(plan.id, name, price.trim() ? parseFloat(price) : null, planRef.trim() || null, isTrial, trialDays.trim() ? parseInt(trialDays) : null)`.

- [ ] **Step 3: `AddMembershipForm` — trial marker + soft warning**

Extend `Plan` type with `is_trial: boolean; trial_days: number | null`; add a prop `athletesWithTrials: string[]`. Track the chosen athlete:
```tsx
  const [athleteId, setAthleteId] = useState('')
```
Make the athlete `<select>` controlled (`value={athleteId} onChange`). In the plan option label, mark trials: `{p.name}{p.is_trial ? ` · trial ${p.trial_days}d` : p.monthly_price_aed != null ? ` · ${p.monthly_price_aed} AED` : ''}`. Compute and render the warning:
```tsx
  const pickedPlan = plans.find((p) => p.id === planId)
  const showTrialWarning = !!pickedPlan?.is_trial && athletesWithTrials.includes(athleteId)
```
```tsx
      {showTrialWarning && <p className="col-span-2 sm:col-span-4 text-sm" style={{ color: 'var(--c-warn-ink)' }}>⚠️ This athlete has had a trial before.</p>}
```
Reset `athleteId` in the success effect.

- [ ] **Step 4: `payments/page.tsx` — load trial fields + athletesWithTrials**

(a) the `membership_plans` select adds `is_trial, trial_days`:
```ts
      .select('id, name, monthly_price_aed, provider_plan_ref, active, is_trial, trial_days')
```
(b) the `memberships` select adds `is_trial` (for the trial badge + the warning set).
(c) compute the trial-athlete set + pass to the form:
```ts
  const athletesWithTrials = [...new Set((memberships ?? []).filter((m) => m.is_trial).map((m) => m.athlete_id as string))]
```
Wait — the memberships select must include `athlete_id` for this. If it doesn't, add it. Then:
```tsx
            <AddMembershipForm athletes={athletes ?? []} stripeConnected={stripeConnected} plans={(plans ?? []).filter((p) => p.active)} athletesWithTrials={athletesWithTrials} />
```
(d) in the membership-row map, add a trial badge alongside the frozen / cancels badges:
```tsx
                        {m.is_trial && <span className="mono" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>Trial{m.end_date ? ` · ends ${m.end_date}` : ''}</span>}
```

- [ ] **Step 5: `members/[memberId]/page.tsx` — trial badge**

Add `is_trial` to the `member` profiles… no — `is_trial` is on memberships. Add `is_trial` to the memberships select for the page, then render a badge on the membership card:
```tsx
                      {activeMembership.is_trial && <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>Trial{activeMembership.end_date ? ` · ends ${activeMembership.end_date}` : ''}</span>}
```
(Place it near the existing plan/status display on the membership card.)

- [ ] **Step 6: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → payments + member pages build. `npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/payments/_components/add-membership-plan-form.tsx src/app/dashboard/payments/_components/membership-plan-row.tsx src/app/dashboard/payments/_components/add-membership-form.tsx src/app/dashboard/payments/page.tsx "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(trials): plan trial inputs + repeat-trial warning + trial badges

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. add-days, plan-validation, save-membership, kpi-metrics, membership-plans)
- [ ] `npm run build` → succeeds
- [ ] Final review (trial fields derived server-side from the authoritative plan; free→paid/priced→unpaid; trials excluded from KPIs; warning non-blocking), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/036_trial_plans.sql` in Supabase (9th pending, alongside 028–035).
- **Auto-expiry:** a trial's `end_date` makes it inactive via the existing `end_date >= today` check — no cron. It surfaces in Retention as "expiring," prompting conversion.
- **Boundary:** recurring/trial plans only; credit-based intro packs remain the Packages catalog.
