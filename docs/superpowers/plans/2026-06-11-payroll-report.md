# Payroll Report (#55) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner-only monthly payroll report: per-coach pay = base (per-class rate × classes taught, or monthly salary) + PT add-on (rate × attributed 1:1 sessions), with rates edited inline and PT sessions attributed at redeem time.

**Architecture:** Migration 054 adds owner-only `coach_pay_rates` + `pt_sessions`. The existing PT redeem action gains a required coach and logs one `pt_sessions` row per redemption. A pure lib (`src/lib/reports/payroll.ts`) computes the report; the page at `/dashboard/reports/payroll` follows the established reports pattern (owner guard, hub card, CSV) with a `?month=YYYY-MM` picker. Spec: `docs/superpowers/specs/2026-06-11-payroll-report-design.md`.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS client for owner ops; service role only where already used), Vitest.

**Conventions:** run a test and READ its result before any chained commit. Inline styles with `var(--c-*)` tokens; match each file's idiom. Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Existing reports siblings to imitate: `src/app/dashboard/reports/classes/page.tsx`, `src/lib/reports/class-performance.ts`.

---

### Task 1: Migration 054 + rollback entry

**Files:**
- Create: `migrations/054_payroll.sql`
- Modify: `migrations/ROLLBACKS.md` (header range 008–053 → 008–054; new entry at top, above `### 053_phone_e164`)

- [ ] **Step 1: Write the migration**

```sql
-- migrations/054_payroll.sql
-- Payroll report (#55): per-coach pay setup + PT-session attribution log.
-- Pay data is OWNER-ONLY (coaches must not read each other's rates).
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS coach_pay_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  base_type     text CHECK (base_type IN ('per_class','monthly')),
  base_rate_aed numeric(10,2) CHECK (base_rate_aed IS NULL OR base_rate_aed >= 0),
  pt_rate_aed   numeric(10,2) CHECK (pt_rate_aed IS NULL OR pt_rate_aed >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, coach_id)
);

ALTER TABLE coach_pay_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_pay_rates_owner_all ON coach_pay_rates;
CREATE POLICY coach_pay_rates_owner_all ON coach_pay_rates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

-- One row per delivered 1:1 session, written at redeem time (service role).
CREATE TABLE IF NOT EXISTS pt_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES profiles(id),
  athlete_id  uuid NOT NULL REFERENCES profiles(id),
  credit_id   uuid REFERENCES package_credits(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by uuid REFERENCES profiles(id)
);

ALTER TABLE pt_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pt_sessions_owner_all ON pt_sessions;
CREATE POLICY pt_sessions_owner_all ON pt_sessions
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE INDEX IF NOT EXISTS idx_pt_sessions_box_coach ON pt_sessions (box_id, coach_id, redeemed_at);
```

- [ ] **Step 2: ROLLBACKS.md** — change the header line to `Reverse procedures for migrations \`008\`–\`054\`…` and insert above the 053 entry:

```markdown
### 054_payroll
```sql
DROP TABLE IF EXISTS pt_sessions;        -- ⚠️ destroys the PT attribution log
DROP TABLE IF EXISTS coach_pay_rates;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/054_payroll.sql migrations/ROLLBACKS.md
git commit -m "feat(payroll): migration 054 — coach_pay_rates + pt_sessions (owner-only RLS)"
```

---

### Task 2: Pure lib — `validatePayRate` + `buildPayroll` (TDD)

**Files:**
- Create: `src/lib/reports/payroll.ts`
- Test: `src/lib/reports/payroll.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/reports/payroll.test.ts
import { test, expect } from 'vitest'
import { validatePayRate, buildPayroll, type PayRateRow, type PayrollInstance, type PtSessionRow } from './payroll'

const TZ = 'Asia/Dubai'
const NOW = '2026-06-20T12:00:00Z'

function coach(id: string, name: string) { return { id, full_name: name } }
function rate(coachId: string, r: Partial<PayRateRow> = {}): PayRateRow {
  return { coach_id: coachId, base_type: null, base_rate_aed: null, pt_rate_aed: null, ...r }
}
function inst(coachId: string | null, startsAt: string): PayrollInstance {
  return { starts_at: startsAt, coach_id: coachId }
}
function pt(coachId: string, redeemedAt: string): PtSessionRow {
  return { coach_id: coachId, redeemed_at: redeemedAt }
}

test('validatePayRate accepts a clean per_class setup', () => {
  expect(validatePayRate('per_class', 100, 150)).toBeNull()
})
test('validatePayRate accepts all-null (clearing a rate)', () => {
  expect(validatePayRate(null, null, null)).toBeNull()
})
test('validatePayRate rejects base_type without base_rate', () => {
  expect(validatePayRate('monthly', null, null)).toBe('Set a base rate for the selected pay type.')
})
test('validatePayRate rejects base_rate without base_type', () => {
  expect(validatePayRate(null, 100, null)).toBe('Choose a pay type for the base rate.')
})
test('validatePayRate rejects negative rates', () => {
  expect(validatePayRate('per_class', -1, null)).toBe('Rates must be 0 or more.')
  expect(validatePayRate(null, null, -5)).toBe('Rates must be 0 or more.')
})
test('validatePayRate rejects an unknown base_type', () => {
  expect(validatePayRate('hourly', 100, null)).toBe('Invalid pay type.')
})

test('per_class base pays rate × taught classes', () => {
  const r = buildPayroll([coach('c1', 'Ahmed')], [rate('c1', { base_type: 'per_class', base_rate_aed: 100 })],
    [inst('c1', '2026-06-03T05:00:00Z'), inst('c1', '2026-06-10T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0]).toMatchObject({ coachName: 'Ahmed', classesTaught: 2, payAed: 200 })
})

test('monthly base ignores taught count for pay', () => {
  const r = buildPayroll([coach('c1', 'Sara')], [rate('c1', { base_type: 'monthly', base_rate_aed: 5000 })],
    [inst('c1', '2026-06-03T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0]).toMatchObject({ classesTaught: 1, payAed: 5000 })
})

test('PT add-on stacks on both base kinds', () => {
  const coaches = [coach('c1', 'Ahmed'), coach('c2', 'Sara')]
  const rates = [
    rate('c1', { base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: 150 }),
    rate('c2', { base_type: 'monthly', base_rate_aed: 5000, pt_rate_aed: 200 }),
  ]
  const r = buildPayroll(coaches, rates, [inst('c1', '2026-06-03T05:00:00Z')],
    [pt('c1', '2026-06-04T09:00:00Z'), pt('c2', '2026-06-05T09:00:00Z'), pt('c2', '2026-06-06T09:00:00Z')],
    '2026-06', TZ, NOW)
  expect(r.rows.find((x) => x.coachName === 'Ahmed')).toMatchObject({ ptCount: 1, payAed: 100 + 150 })
  expect(r.rows.find((x) => x.coachName === 'Sara')).toMatchObject({ ptCount: 2, payAed: 5000 + 400 })
})

test('PT-only coach pays rate × sessions; no-rate coach pays 0 with hasRate false', () => {
  const r = buildPayroll([coach('c1', 'A'), coach('c2', 'B')], [rate('c1', { pt_rate_aed: 150 })],
    [], [pt('c1', '2026-06-04T09:00:00Z')], '2026-06', TZ, NOW)
  expect(r.rows.find((x) => x.coachId === 'c1')).toMatchObject({ payAed: 150, hasRate: true })
  expect(r.rows.find((x) => x.coachId === 'c2')).toMatchObject({ payAed: 0, hasRate: false })
})

test('month boundary respects the box timezone', () => {
  // 2026-05-31T21:00:00Z is 2026-06-01 01:00 in Asia/Dubai (+04) → counts in June.
  const r = buildPayroll([coach('c1', 'A')], [rate('c1', { base_type: 'per_class', base_rate_aed: 10 })],
    [inst('c1', '2026-05-31T21:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0].classesTaught).toBe(1)
})

test('future instances in the month are excluded (pay-to-date)', () => {
  const r = buildPayroll([coach('c1', 'A')], [rate('c1', { base_type: 'per_class', base_rate_aed: 10 })],
    [inst('c1', '2026-06-25T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0].classesTaught).toBe(0)
})

test('unassigned classes are counted, not paid', () => {
  const r = buildPayroll([coach('c1', 'A')], [], [inst(null, '2026-06-03T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.unassignedClasses).toBe(1)
  expect(r.totals.payAed).toBe(0)
})

test('totals sum rows; rows sort by pay desc', () => {
  const coaches = [coach('c1', 'A'), coach('c2', 'B')]
  const rates = [rate('c1', { base_type: 'per_class', base_rate_aed: 10 }), rate('c2', { base_type: 'monthly', base_rate_aed: 900 })]
  const r = buildPayroll(coaches, rates, [inst('c1', '2026-06-03T05:00:00Z')], [], '2026-06', TZ, NOW)
  expect(r.rows[0].coachName).toBe('B')
  expect(r.totals).toMatchObject({ classesTaught: 1, ptCount: 0, payAed: 910 })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/reports/payroll.test.ts` → FAIL (unresolved import).

- [ ] **Step 3: Implement**

```ts
// src/lib/reports/payroll.ts
export type PayRateRow = {
  coach_id: string
  base_type: string | null      // 'per_class' | 'monthly'
  base_rate_aed: number | null
  pt_rate_aed: number | null
}
export type PayrollInstance = { starts_at: string; coach_id: string | null }
export type PtSessionRow = { coach_id: string; redeemed_at: string }
export type PayrollRow = {
  coachId: string
  coachName: string
  baseType: string | null
  baseRate: number | null
  ptRate: number | null
  classesTaught: number
  ptCount: number
  payAed: number
  hasRate: boolean
}

const BASE_TYPES = ['per_class', 'monthly']

/** Validates an owner-entered pay setup. Returns a human message or null. */
export function validatePayRate(baseType: string | null, baseRate: number | null, ptRate: number | null): string | null {
  if (baseType !== null && !BASE_TYPES.includes(baseType)) return 'Invalid pay type.'
  if ((baseRate !== null && baseRate < 0) || (ptRate !== null && ptRate < 0)) return 'Rates must be 0 or more.'
  if (baseType !== null && baseRate === null) return 'Set a base rate for the selected pay type.'
  if (baseType === null && baseRate !== null) return 'Choose a pay type for the base rate.'
  return null
}

/** 'YYYY-MM' of an ISO timestamp in the given timezone. */
function monthKeyOf(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}`
}

/** Monthly payroll: base (per_class × taught | monthly) + PT rate × attributed sessions. */
export function buildPayroll(
  coaches: { id: string; full_name: string | null }[],
  rates: PayRateRow[],
  instances: PayrollInstance[],
  ptSessions: PtSessionRow[],
  monthKey: string,            // 'YYYY-MM'
  timeZone: string,
  nowIso: string,
): { rows: PayrollRow[]; totals: { classesTaught: number; ptCount: number; payAed: number }; unassignedClasses: number } {
  const rateByCoach = new Map(rates.map((r) => [r.coach_id, r]))
  const now = new Date(nowIso).getTime()

  const held = instances.filter((i) => new Date(i.starts_at).getTime() <= now && monthKeyOf(i.starts_at, timeZone) === monthKey)
  const taughtByCoach = new Map<string, number>()
  let unassignedClasses = 0
  for (const i of held) {
    if (!i.coach_id) { unassignedClasses += 1; continue }
    taughtByCoach.set(i.coach_id, (taughtByCoach.get(i.coach_id) ?? 0) + 1)
  }

  const ptByCoach = new Map<string, number>()
  for (const s of ptSessions) {
    if (monthKeyOf(s.redeemed_at, timeZone) !== monthKey) continue
    ptByCoach.set(s.coach_id, (ptByCoach.get(s.coach_id) ?? 0) + 1)
  }

  const rows: PayrollRow[] = coaches.map((c) => {
    const r = rateByCoach.get(c.id)
    const classesTaught = taughtByCoach.get(c.id) ?? 0
    const ptCount = ptByCoach.get(c.id) ?? 0
    const basePay = r?.base_type === 'per_class' ? (r.base_rate_aed ?? 0) * classesTaught
      : r?.base_type === 'monthly' ? (r.base_rate_aed ?? 0)
      : 0
    const ptPay = (r?.pt_rate_aed ?? 0) * ptCount
    return {
      coachId: c.id,
      coachName: c.full_name ?? 'Coach',
      baseType: r?.base_type ?? null,
      baseRate: r?.base_rate_aed ?? null,
      ptRate: r?.pt_rate_aed ?? null,
      classesTaught,
      ptCount,
      payAed: Math.round((basePay + ptPay) * 100) / 100,
      hasRate: !!r && (r.base_type !== null || r.pt_rate_aed !== null),
    }
  }).sort((a, b) => b.payAed - a.payAed || a.coachName.localeCompare(b.coachName))

  const totals = rows.reduce((t, x) => ({
    classesTaught: t.classesTaught + x.classesTaught,
    ptCount: t.ptCount + x.ptCount,
    payAed: Math.round((t.payAed + x.payAed) * 100) / 100,
  }), { classesTaught: 0, ptCount: 0, payAed: 0 })

  return { rows, totals, unassignedClasses }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/reports/payroll.test.ts` → 14 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/payroll.ts src/lib/reports/payroll.test.ts
git commit -m "feat(payroll): buildPayroll + validatePayRate pure lib"
```

---

### Task 3: `savePayRate` action (TDD)

**Files:**
- Create: `src/app/dashboard/reports/payroll/_actions/save-pay-rate.ts`
- Test: `src/__tests__/save-pay-rate.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/save-pay-rate.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { savePayRate } from '@/app/dashboard/reports/payroll/_actions/save-pay-rate'

beforeEach(() => vi.clearAllMocks())

test('rejects a coach caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'c1' },
    results: { profiles: { data: { role: 'coach', box_id: 'b1' }, error: null } },
  }))
  const res = await savePayRate('c2', 'per_class', 100, null)
  expect(res.error).toBe('Only owners can set pay rates.')
})

test('rejects invalid setups before touching the db', async () => {
  const mock = makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  })
  serverCreate.mockResolvedValue(mock)
  const res = await savePayRate('c2', 'monthly', null, null)
  expect(res.error).toBe('Set a base rate for the selected pay type.')
  expect(mock.builder('coach_pay_rates')).toBeUndefined()
})

test('owner upserts a rate keyed on box+coach', async () => {
  const mock = makeSupabaseMock({
    user: { id: 'o1' },
    results: {
      profiles: { data: { role: 'owner', box_id: 'b1' }, error: null },
      coach_pay_rates: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(mock)
  const res = await savePayRate('c2', 'monthly', 5000, 150)
  expect(res.error).toBeNull()
  const up = mock.builder('coach_pay_rates').upsert.mock.calls[0]
  expect(up[0]).toMatchObject({ box_id: 'b1', coach_id: 'c2', base_type: 'monthly', base_rate_aed: 5000, pt_rate_aed: 150 })
  expect(up[1]).toMatchObject({ onConflict: 'box_id,coach_id' })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/save-pay-rate.integration.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/app/dashboard/reports/payroll/_actions/save-pay-rate.ts
'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validatePayRate } from '@/lib/reports/payroll'

export async function savePayRate(
  coachId: string,
  baseType: string | null,
  baseRate: number | null,
  ptRate: number | null,
): Promise<{ error: string | null }> {
  if (!coachId) return { error: 'Missing coach.' }

  const auth = await requireOwnerAction('Only owners can set pay rates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const invalid = validatePayRate(baseType, baseRate, ptRate)
  if (invalid) return { error: invalid }

  // Owner-only RLS on coach_pay_rates — the RLS client is the right tool here.
  const { error } = await supabase.from('coach_pay_rates').upsert({
    box_id: profile.box_id,
    coach_id: coachId,
    base_type: baseType,
    base_rate_aed: baseRate,
    pt_rate_aed: ptRate,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'box_id,coach_id' })
  if (error) return { error: 'Could not save the rate. Please try again.' }

  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
```

NOTE: the guard runs BEFORE validation here (unlike validate-first actions) because the test asserts the coach-denial string with a profile mocked — and validation needs no input parsing. Keep this order; the test file pins it.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/__tests__/save-pay-rate.integration.test.ts` → 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/reports/payroll/_actions/save-pay-rate.ts src/__tests__/save-pay-rate.integration.test.ts
git commit -m "feat(payroll): savePayRate owner action (validated upsert on box+coach)"
```

---

### Task 4: PT attribution — extend redeem-session + coach picker (TDD)

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/_actions/redeem-session.ts`
- Modify: `src/__tests__/redeem-session.integration.test.ts`
- Modify: `src/app/dashboard/members/[memberId]/_components/sell-package.tsx` (coach picker)
- Modify: `src/app/dashboard/members/[memberId]/page.tsx` (fetch coaches, pass prop)

- [ ] **Step 1: Extend the integration test.** READ `src/__tests__/redeem-session.integration.test.ts` first. Update every existing `redeemSession('batch-1')` call to `redeemSession('batch-1', 'coach-1')`, add `pt_sessions: { data: null, error: null }` and `profiles` already present per test. The happy-path test must additionally configure the service mock's `profiles` result to return the coach row and assert the log insert. Add these two tests:

```ts
test('rejects a coach not in the owner box — no consume', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: { profiles: { data: null, error: null } }, // coach lookup misses
  })
  serviceCreate.mockReturnValue(svc)
  const res = await redeemSession('batch-1', 'intruder')
  expect(res.error).toBe('Coach not found in your gym.')
  expect(svc.rpc).not.toHaveBeenCalled()
})

test('logs a pt_session row after successful consumption', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'owner1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  }))
  const svc = makeSupabaseMock({
    results: {
      profiles: { data: { id: 'coach-1', role: 'coach' }, error: null },
      package_credits: { data: { id: 'batch-1', athlete_id: 'a1', kind: 'pt_session', credits_remaining: 3 }, error: null },
      pt_sessions: { data: null, error: null },
    },
    rpc: { data: 2, error: null },
  })
  serviceCreate.mockReturnValue(svc)
  const res = await redeemSession('batch-1', 'coach-1')
  expect(res.error).toBeNull()
  const ins = svc.builder('pt_sessions').insert.mock.calls[0][0]
  expect(ins).toMatchObject({ box_id: 'b1', coach_id: 'coach-1', athlete_id: 'a1', credit_id: 'batch-1', redeemed_by: 'owner1' })
})
```

Also update the existing missing-coach guard expectations: a call with an EMPTY coachId must return `'Pick the coach who delivered the session.'` (add one small test for it).

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/redeem-session.integration.test.ts` → FAIL (signature/behavior mismatch).

- [ ] **Step 3: Extend the action.** Modify `redeem-session.ts` — new signature and two added blocks (READ the current file; it uses requireOwnerAction → batch lookup → `consume_credit` rpc → revalidate):

```ts
export async function redeemSession(creditId: string, coachId: string): Promise<{ error: string | null }> {
  const validationError = validateRedeemInput(creditId)
  if (validationError) return { error: validationError }
  if (!coachId) return { error: 'Pick the coach who delivered the session.' }

  const auth = await requireOwnerAction('Only owners can redeem sessions.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  const service = createServiceClient()

  // The attributed coach must be a coach in the owner's box.
  const { data: coachRow } = await service
    .from('profiles')
    .select('id, role')
    .eq('id', coachId)
    .eq('box_id', profile.box_id)
    .eq('role', 'coach')
    .maybeSingle()
  if (!coachRow) return { error: 'Coach not found in your gym.' }

  // …existing batch lookup + credits_remaining guard + consume_credit rpc UNCHANGED…

  // Attribution log (#55): one row per delivered session, only after a successful consume.
  await service.from('pt_sessions').insert({
    box_id: profile.box_id,
    coach_id: coachId,
    athlete_id: batch.athlete_id,
    credit_id: creditId,
    redeemed_by: user.id,
  })

  revalidatePath(`/dashboard/members/${batch.athlete_id}`)
  return { error: null }
}
```

(Place the insert between the successful rpc check and the revalidate. Destructure `user` from the auth context — it wasn't destructured before.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/__tests__/redeem-session.integration.test.ts` → all pass.

- [ ] **Step 5: Coach picker UI.** In `sell-package.tsx` (READ it first): add a `coaches: { id: string; full_name: string | null }[]` prop; add `const [ptCoachId, setPtCoachId] = useState(coaches[0]?.id ?? '')`; render, ABOVE the credits list (only when a PT-block credit exists in `credits`, i.e. `credits.some((c) => c.kind === 'pt_session')`), a labeled `<select>` of coaches styled like the existing package `<select>` in the same file; `onRedeem` passes `ptCoachId` → `redeemSession(creditId, ptCoachId)`. If `coaches.length === 0`, render the redeem button disabled with title "Add a coach to attribute PT sessions". In `page.tsx`: add a coaches fetch to the existing big owner `Promise.all` (`isOwner ? supabase.from('profiles').select('id, full_name').eq('box_id', viewer.box_id).eq('role', 'coach').order('full_name') : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] })`) and pass `coaches={coachRows ?? []}` to `<SellPackage …>`.

- [ ] **Step 6: Verify** — `npm run type-check` → 0 errors; `npx vitest run` → all pass.

- [ ] **Step 7: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/redeem-session.ts" src/__tests__/redeem-session.integration.test.ts "src/app/dashboard/members/[memberId]/_components/sell-package.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(payroll): PT redemption attributes the delivering coach (pt_sessions log)"
```

---

### Task 5: Payroll page + inline rate editor + hub card

**Files:**
- Create: `src/app/dashboard/reports/payroll/page.tsx`
- Create: `src/app/dashboard/reports/payroll/_components/pay-rate-editor.tsx`
- Modify: `src/app/dashboard/reports/page.tsx` (add the hub card)

- [ ] **Step 1: PayRateEditor (client).** Compact inline editor used per table row:

```tsx
// src/app/dashboard/reports/payroll/_components/pay-rate-editor.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { savePayRate } from '../_actions/save-pay-rate'

const field: React.CSSProperties = { height: 30, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 12.5, color: 'var(--c-ink)', padding: '0 8px', boxSizing: 'border-box' }

export function PayRateEditor({ coachId, baseType, baseRate, ptRate }: {
  coachId: string
  baseType: string | null
  baseRate: number | null
  ptRate: number | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [bt, setBt] = useState(baseType ?? '')
  const [br, setBr] = useState(baseRate?.toString() ?? '')
  const [pr, setPr] = useState(ptRate?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSave() {
    setError(null)
    start(async () => {
      const res = await savePayRate(
        coachId,
        bt === '' ? null : bt,
        br.trim() === '' ? null : Number(br),
        pr.trim() === '' ? null : Number(pr),
      )
      if (res.error) setError(res.error)
      else { setEditing(false); router.refresh() }
    })
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, cursor: 'pointer', color: 'var(--c-ink-muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
        Edit rates
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select value={bt} onChange={(e) => setBt(e.target.value)} style={field} aria-label="Base pay type">
          <option value="">No base</option>
          <option value="per_class">Per class</option>
          <option value="monthly">Monthly</option>
        </select>
        <input type="number" min={0} step="0.01" placeholder="Base AED" value={br} onChange={(e) => setBr(e.target.value)} style={{ ...field, width: 90 }} aria-label="Base rate (AED)" />
        <input type="number" min={0} step="0.01" placeholder="PT AED" value={pr} onChange={(e) => setPr(e.target.value)} style={{ ...field, width: 80 }} aria-label="PT rate (AED)" />
        <button onClick={onSave} disabled={pending} style={{ height: 30, padding: '0 12px', borderRadius: 6, border: 'none', background: '#111', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>{pending ? '…' : 'Save'}</button>
        <button onClick={() => { setEditing(false); setError(null) }} disabled={pending} style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--c-ink-2)' }}>Cancel</button>
      </div>
      {error && <p style={{ fontSize: 11.5, color: 'var(--c-danger)', margin: 0 }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: The page.** READ `src/app/dashboard/reports/classes/page.tsx` first and mirror its shell/table styles exactly. Structure:

```tsx
// src/app/dashboard/reports/payroll/page.tsx  (shape — match the sibling's exact style tokens)
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { requireOwnerPage } from '@/lib/auth/page-guards'
import { buildPayroll, type PayRateRow, type PayrollInstance, type PtSessionRow } from '@/lib/reports/payroll'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { PayRateEditor } from './_components/pay-rate-editor'

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)))
}
function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default async function PayrollReportPage(ctx: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, profile, boxName, box } = await requireOwnerPage()
  const sp = await ctx.searchParams
  const nowIso = new Date().toISOString()
  const tz = box.timezone ?? 'Asia/Dubai'
  const currentKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') && (sp.month as string) <= currentKey ? (sp.month as string) : currentKey

  // Generous fetch window (month ± buffer); the lib applies the exact tz month filter.
  const [y, m] = monthKey.split('-').map(Number)
  const fetchStart = new Date(Date.UTC(y, m - 1, 1) - 2 * 86400000).toISOString()
  const fetchEnd = new Date(Date.UTC(y, m, 1) + 2 * 86400000).toISOString()

  const [{ data: coachRows }, { data: rateRows }, { data: instRows }, { data: ptRows }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'coach').order('full_name'),
    supabase.from('coach_pay_rates').select('coach_id, base_type, base_rate_aed, pt_rate_aed').eq('box_id', profile.box_id),
    supabase.from('class_instances').select('starts_at, class_templates(coach_id)').eq('box_id', profile.box_id).neq('status', 'cancelled').gte('starts_at', fetchStart).lte('starts_at', fetchEnd),
    supabase.from('pt_sessions').select('coach_id, redeemed_at').eq('box_id', profile.box_id).gte('redeemed_at', fetchStart).lte('redeemed_at', fetchEnd),
  ])

  const instances: PayrollInstance[] = (instRows ?? []).map((r) => {
    const t = Array.isArray(r.class_templates) ? r.class_templates[0] : r.class_templates
    return { starts_at: r.starts_at as string, coach_id: (t as { coach_id: string | null } | null)?.coach_id ?? null }
  })
  const report = buildPayroll(
    (coachRows ?? []) as { id: string; full_name: string | null }[],
    (rateRows ?? []) as PayRateRow[],
    instances,
    (ptRows ?? []) as PtSessionRow[],
    monthKey, tz, nowIso,
  )
  // …render: shell copied from reports/classes; month header `‹ {monthLabel} ›` where ‹ links to ?month=shiftMonth(monthKey,-1), › only when monthKey < currentKey; table rows + PayRateEditor per row; totals row; DownloadCsvButton (headers Coach/Base/Classes/PT rate/PT sessions/Pay AED); unassigned line when report.unassignedClasses > 0; footnote: "PT sessions counted from 11 Jun 2026 (attribution start). Class substitutions are not tracked — classes pay the rostered coach."
}
```

The render section must be written in full by the implementer following `reports/classes/page.tsx` table markup (`BASE_LABEL: Record<string,string> = { per_class: 'Per class', monthly: 'Monthly' }`, base cell shows e.g. "Per class · 100 AED" or "—"; pay cell `className="mono"`). Empty state when no coaches: "No coaches yet — add one from the People page."

- [ ] **Step 3: Hub card.** In `src/app/dashboard/reports/page.tsx`, append to the `REPORTS` array:

```tsx
  { href: '/dashboard/reports/payroll', title: 'Payroll', desc: 'Per-coach pay: class rates, monthly salaries, and PT sessions.' },
```

- [ ] **Step 4: Verify** — `npm run type-check` → 0; `npm run lint` → clean; `npx vitest run` → all pass; `npm run build` → compiles (route `/dashboard/reports/payroll` listed).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/reports/payroll src/app/dashboard/reports/page.tsx
git commit -m "feat(payroll): monthly payroll report page with inline rate editing (#55)"
```

---

### Task 6: Final gate + ship

- [ ] **Step 1:** `npm run type-check` → 0. `npm run lint` → clean. `npx vitest run` → expect **~784 passed** (764 + 14 lib + 3 savePayRate + ~3 redeem additions). READ each.
- [ ] **Step 2:** `npm run build` → compiles.
- [ ] **Step 3:** Apply migration 054 to prod (docker psql pattern from the deploy pass IF the DB password still works; otherwise hand the user the one paste for the SQL editor). Re-run the 054 state probe: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='coach_pay_rates');`
- [ ] **Step 4:** Update `GymGlofox.md` Tier 6 row #55 to ✅ with date + one-line summary; update pending-manual-ops memory if 054 wasn't applied.
- [ ] **Step 5:** `git push origin main`; report (note: PT counting starts from go-live; substitutions untracked; redeem now requires a coach pick).
