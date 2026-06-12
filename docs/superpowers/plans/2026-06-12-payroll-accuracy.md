# Payroll Accuracy Pack (#59 part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substitution-accurate class pay, per-class-type rate overrides, and manual monthly adjustments on the #55 payroll report — per `docs/superpowers/specs/2026-06-12-payroll-accuracy-design.md`. Clock-in/out timecards remain the #59 remainder.

**Architecture:** Mig 063 adds two owner-only tables (`coach_class_rates`, `pay_adjustments`). `buildPayroll` gains payee resolution (`instance.coach_id ?? template_coach_id`), override math (replaces for per-class, additive for monthly), and adjustment sums — via **appended optional params** so existing call sites/tests compile untouched. A programming-tier `setInstanceCoach` + prep-page picker records substitutions where coaches plan their day.

**Tech Stack:** Next.js 16 server actions, Supabase owner RLS, pure-lib TDD, Ivory & Lime primitives.

**House rules:** commits direct to `main`, `--no-verify -q`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `&&`-chain piped gates with commits. Suite is 964 green before this plan.

---

## File map

| File | Action |
|---|---|
| `migrations/063_payroll_accuracy.sql` + `migrations/ROLLBACKS.md` | Create / modify |
| `src/lib/reports/payroll.ts` | Modify (types, resolution, overrides, adjustments, validators) |
| `src/lib/reports/payroll.test.ts` | Modify (append new `describe` blocks; existing tests unchanged) |
| `src/app/dashboard/reports/payroll/_actions/set-instance-coach.ts` | Create |
| `src/app/dashboard/reports/payroll/_actions/class-rates.ts` | Create (save + delete) |
| `src/app/dashboard/reports/payroll/_actions/pay-adjustments.ts` | Create (add + delete) |
| `src/__tests__/payroll-accuracy.integration.test.ts` | Create (10 action tests) |
| `src/app/dashboard/reports/payroll/_components/class-rates-editor.tsx` | Create |
| `src/app/dashboard/reports/payroll/_components/adjustments-section.tsx` | Create |
| `src/app/dashboard/reports/payroll/page.tsx` | Modify (fetches, columns, sections, footnote) |
| `src/app/dashboard/prep/_components/instance-coach-picker.tsx` | Create |
| `src/app/dashboard/prep/page.tsx` | Modify (fetch + header picker) |
| `GymGlofox.md` | Modify (#59 partial note) |

---

### Task 1: Migration 063 + rollback entry

**Files:**
- Create: `migrations/063_payroll_accuracy.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/063_payroll_accuracy.sql
-- #59 part 1 (payroll accuracy): per-class-type rate overrides + manual monthly
-- adjustments. Pay data is OWNER-ONLY (mirrors coach_pay_rates). Idempotent.

CREATE TABLE IF NOT EXISTS coach_class_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES class_templates(id) ON DELETE CASCADE,
  rate_aed    numeric(10,2) NOT NULL CHECK (rate_aed >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, coach_id, template_id)
);

ALTER TABLE coach_class_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_class_rates_owner_all ON coach_class_rates;
CREATE POLICY coach_class_rates_owner_all ON coach_class_rates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

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

ALTER TABLE pay_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pay_adjustments_owner_all ON pay_adjustments;
CREATE POLICY pay_adjustments_owner_all ON pay_adjustments
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE INDEX IF NOT EXISTS idx_pay_adjustments_box_month ON pay_adjustments (box_id, month);
```

- [ ] **Step 2: Rollback entry**

`migrations/ROLLBACKS.md`: header range → `008`–`063`; add ABOVE `### 062_audit_log`:

```markdown
### 063_payroll_accuracy
```sql
DROP TABLE IF EXISTS pay_adjustments;    -- ⚠️ manual bonus/deduction lines
DROP TABLE IF EXISTS coach_class_rates;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/063_payroll_accuracy.sql migrations/ROLLBACKS.md
git commit --no-verify -q -m "feat(payroll): mig 063 — class-type rates + pay adjustments (#59 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Lib — resolution, overrides, adjustments, validators (TDD)

**Files:**
- Modify: `src/lib/reports/payroll.ts`
- Test: `src/lib/reports/payroll.test.ts` (append new describe blocks at the end; existing tests untouched)

- [ ] **Step 1: Append the failing tests**

Read `src/lib/reports/payroll.test.ts` first to match its fixture style, then append at the end of the file:

```ts
describe('payroll accuracy (#59): payee resolution', () => {
  const coaches = [{ id: 'c1', full_name: 'Sara' }, { id: 'c2', full_name: 'Omar' }]
  const rates = [{ coach_id: 'c1', base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: null },
                 { coach_id: 'c2', base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: null }]

  test('instance coach wins over the template coach (substitution)', () => {
    const out = buildPayroll(coaches, rates, [
      { starts_at: '2026-06-05T07:00:00Z', coach_id: 'c2', template_id: 't1', template_coach_id: 'c1' },
    ], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z')
    expect(out.rows.find((r) => r.coachId === 'c2')!.classesTaught).toBe(1)
    expect(out.rows.find((r) => r.coachId === 'c1')!.classesTaught).toBe(0)
  })

  test('falls back to the template coach when the instance has none', () => {
    const out = buildPayroll(coaches, rates, [
      { starts_at: '2026-06-05T07:00:00Z', coach_id: null, template_id: 't1', template_coach_id: 'c1' },
    ], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z')
    expect(out.rows.find((r) => r.coachId === 'c1')!.classesTaught).toBe(1)
    expect(out.unassignedClasses).toBe(0)
  })

  test('neither coach → unassigned', () => {
    const out = buildPayroll(coaches, rates, [
      { starts_at: '2026-06-05T07:00:00Z', coach_id: null, template_id: 't1', template_coach_id: null },
    ], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z')
    expect(out.unassignedClasses).toBe(1)
  })
})

describe('payroll accuracy (#59): class-type rate overrides', () => {
  const coaches = [{ id: 'c1', full_name: 'Sara' }]
  const inst = (tid: string) => ({ starts_at: '2026-06-05T07:00:00Z', coach_id: 'c1', template_id: tid, template_coach_id: null })

  test('per_class: override replaces the default for that template only', () => {
    const out = buildPayroll(coaches,
      [{ coach_id: 'c1', base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: null }],
      [inst('yoga'), inst('crossfit')], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z',
      [{ coach_id: 'c1', template_id: 'yoga', rate_aed: 150 }])
    expect(out.rows[0].payAed).toBe(250) // 150 (yoga override) + 100 (default)
  })

  test('monthly: overrides pay on top of salary; plain classes stay covered', () => {
    const out = buildPayroll(coaches,
      [{ coach_id: 'c1', base_type: 'monthly', base_rate_aed: 5000, pt_rate_aed: null }],
      [inst('yoga'), inst('crossfit')], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z',
      [{ coach_id: 'c1', template_id: 'yoga', rate_aed: 150 }])
    expect(out.rows[0].payAed).toBe(5150) // salary + yoga add-on; crossfit covered by salary
  })

  test('no overrides → identical to base behavior', () => {
    const out = buildPayroll(coaches,
      [{ coach_id: 'c1', base_type: 'per_class', base_rate_aed: 100, pt_rate_aed: null }],
      [inst('yoga'), inst('crossfit')], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z')
    expect(out.rows[0].payAed).toBe(200)
  })
})

describe('payroll accuracy (#59): adjustments', () => {
  test('sums per coach, negatives included, lands in adjustmentsAed and payAed', () => {
    const out = buildPayroll(
      [{ id: 'c1', full_name: 'Sara' }],
      [{ coach_id: 'c1', base_type: 'monthly', base_rate_aed: 5000, pt_rate_aed: null }],
      [], [], '2026-06', 'Asia/Dubai', '2026-06-30T00:00:00Z',
      [], [{ coach_id: 'c1', amount_aed: 500 }, { coach_id: 'c1', amount_aed: -200 }])
    expect(out.rows[0].adjustmentsAed).toBe(300)
    expect(out.rows[0].payAed).toBe(5300)
  })
})

describe('payroll accuracy (#59): validators', () => {
  test('validateClassRate', () => {
    expect(validateClassRate(-1)).toBe('Rate must be 0 or more.')
    expect(validateClassRate(null)).toBe('Rate must be 0 or more.')
    expect(validateClassRate(120)).toBeNull()
  })

  test('validateAdjustment', () => {
    expect(validateAdjustment(0, 'x', '2026-06')).toBe('Amount must be non-zero.')
    expect(validateAdjustment(100, '  ', '2026-06')).toBe('A note is required.')
    expect(validateAdjustment(100, 'x'.repeat(201), '2026-06')).toBe('Note must be 200 characters or fewer.')
    expect(validateAdjustment(100, 'bonus', '2026-13')).toBe('Invalid month.')
    expect(validateAdjustment(-150, 'late penalty', '2026-06')).toBeNull()
  })
})
```

Add `validateClassRate, validateAdjustment` to the file's existing import from `./payroll`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/reports/payroll.test.ts`
Expected: new describes FAIL (missing exports / wrong math); existing tests still pass.

- [ ] **Step 3: Implement the lib changes**

In `src/lib/reports/payroll.ts`:

Types — replace `PayrollInstance` and add the new rows + extend `PayrollRow`:

```ts
export type PayrollInstance = {
  starts_at: string
  coach_id: string | null
  template_id?: string | null
  template_coach_id?: string | null
}
export type ClassRateRow = { coach_id: string; template_id: string; rate_aed: number }
export type AdjustmentRow = { coach_id: string; amount_aed: number }
```

`PayrollRow` gains `adjustmentsAed: number`.

Validators (after `validatePayRate`):

```ts
/** Validates a per-class-type override rate. */
export function validateClassRate(rateAed: number | null): string | null {
  if (rateAed === null || Number.isNaN(rateAed) || rateAed < 0) return 'Rate must be 0 or more.'
  return null
}

/** Validates a manual monthly adjustment line. */
export function validateAdjustment(amountAed: number, note: string, month: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 'Invalid month.'
  if (!Number.isFinite(amountAed) || amountAed === 0) return 'Amount must be non-zero.'
  if (!note.trim()) return 'A note is required.'
  if (note.trim().length > 200) return 'Note must be 200 characters or fewer.'
  return null
}
```

`buildPayroll` — append the optional params and rework the body:

```ts
export function buildPayroll(
  coaches: { id: string; full_name: string | null }[],
  rates: PayRateRow[],
  instances: PayrollInstance[],
  ptSessions: PtSessionRow[],
  monthKey: string,            // 'YYYY-MM'
  timeZone: string,
  nowIso: string,
  classRates: ClassRateRow[] = [],
  adjustments: AdjustmentRow[] = [],
): { rows: PayrollRow[]; totals: { classesTaught: number; ptCount: number; payAed: number }; unassignedClasses: number } {
  const rateByCoach = new Map(rates.map((r) => [r.coach_id, r]))
  const overrideRate = new Map(classRates.map((cr) => [`${cr.coach_id}:${cr.template_id}`, cr.rate_aed]))
  const now = new Date(nowIso).getTime()

  const held = instances.filter((i) => new Date(i.starts_at).getTime() <= now && monthKeyOf(i.starts_at, timeZone) === monthKey)
  // Substitution-accurate payee: the instance's own coach, falling back to the template's.
  const taughtTemplatesByCoach = new Map<string, (string | null)[]>()
  let unassignedClasses = 0
  for (const i of held) {
    const payee = i.coach_id ?? i.template_coach_id ?? null
    if (!payee) { unassignedClasses += 1; continue }
    const list = taughtTemplatesByCoach.get(payee) ?? []
    list.push(i.template_id ?? null)
    taughtTemplatesByCoach.set(payee, list)
  }

  const ptByCoach = new Map<string, number>()
  for (const s of ptSessions) {
    if (monthKeyOf(s.redeemed_at, timeZone) !== monthKey) continue
    ptByCoach.set(s.coach_id, (ptByCoach.get(s.coach_id) ?? 0) + 1)
  }

  const adjByCoach = new Map<string, number>()
  for (const a of adjustments) {
    adjByCoach.set(a.coach_id, Math.round(((adjByCoach.get(a.coach_id) ?? 0) + a.amount_aed) * 100) / 100)
  }

  const rows: PayrollRow[] = coaches.map((c) => {
    const r = rateByCoach.get(c.id)
    const taught = taughtTemplatesByCoach.get(c.id) ?? []
    const classesTaught = taught.length
    const ptCount = ptByCoach.get(c.id) ?? 0
    const ovFor = (tid: string | null) => (tid !== null ? overrideRate.get(`${c.id}:${tid}`) : undefined)

    let basePay = 0
    if (r?.base_type === 'per_class') {
      for (const tid of taught) basePay += ovFor(tid) ?? (r.base_rate_aed ?? 0)
    } else if (r?.base_type === 'monthly') {
      basePay = r.base_rate_aed ?? 0
      for (const tid of taught) {
        const ov = ovFor(tid)
        if (ov !== undefined) basePay += ov
      }
    } else {
      // No base set: overridden classes still pay (display stays '—' via hasRate).
      for (const tid of taught) {
        const ov = ovFor(tid)
        if (ov !== undefined) basePay += ov
      }
    }

    const ptPay = (r?.pt_rate_aed ?? 0) * ptCount
    const adjustmentsAed = adjByCoach.get(c.id) ?? 0
    return {
      coachId: c.id,
      coachName: c.full_name ?? 'Coach',
      baseType: r?.base_type ?? null,
      baseRate: r?.base_rate_aed ?? null,
      ptRate: r?.pt_rate_aed ?? null,
      classesTaught,
      ptCount,
      adjustmentsAed,
      payAed: Math.round((basePay + ptPay + adjustmentsAed) * 100) / 100,
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

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/reports/payroll.test.ts`
Expected: all pass (existing + ~10 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/payroll.ts src/lib/reports/payroll.test.ts
git commit --no-verify -q -m "feat(payroll): payee resolution, type-rate overrides, adjustments in buildPayroll (#59 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Actions (TDD)

**Files:**
- Create: `src/app/dashboard/reports/payroll/_actions/set-instance-coach.ts`
- Create: `src/app/dashboard/reports/payroll/_actions/class-rates.ts`
- Create: `src/app/dashboard/reports/payroll/_actions/pay-adjustments.ts`
- Test: `src/__tests__/payroll-accuracy.integration.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/payroll-accuracy.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setInstanceCoach } from '@/app/dashboard/reports/payroll/_actions/set-instance-coach'
import { saveClassRate, deleteClassRate } from '@/app/dashboard/reports/payroll/_actions/class-rates'
import { addPayAdjustment, deletePayAdjustment } from '@/app/dashboard/reports/payroll/_actions/pay-adjustments'

beforeEach(() => vi.clearAllMocks())

function as(role: string, extra: Record<string, unknown> = {}) {
  return makeSupabaseMock({ user: { id: 'u1' }, results: {
    profiles: { data: { box_id: 'b1', role, full_name: 'U' }, error: null },
    ...extra,
  } as never })
}

test('setInstanceCoach rejects non-programming callers', async () => {
  serverCreate.mockResolvedValue(as('receptionist'))
  const res = await setInstanceCoach('ci1', 'c1')
  expect(res.error).toBe('Only coaches can reassign classes.')
})

test('setInstanceCoach rejects a non-staff coach', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'u1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'U' }, error: null }, // guard
      { data: { role: 'athlete' }, error: null },                             // target
    ],
  } }))
  const res = await setInstanceCoach('ci1', 'c1')
  expect(res.error).toBe('Coach not found.')
})

test('setInstanceCoach updates the instance box-pinned (null allowed)', async () => {
  const mock = as('coach', { class_instances: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await setInstanceCoach('ci1', null)
  expect(res.error).toBeNull()
  expect(mock.builder('class_instances').update).toHaveBeenCalledWith({ coach_id: null })
  expect(mock.builder('class_instances').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('saveClassRate rejects non-owners', async () => {
  serverCreate.mockResolvedValue(as('coach'))
  const res = await saveClassRate('c1', 't1', 120)
  expect(res.error).toBe('Only owners can set pay rates.')
})

test('saveClassRate rejects a negative rate', async () => {
  serverCreate.mockResolvedValue(as('owner'))
  const res = await saveClassRate('c1', 't1', -5)
  expect(res.error).toBe('Rate must be 0 or more.')
})

test('saveClassRate upserts box-pinned after template check', async () => {
  const mock = as('owner', {
    class_templates: { data: { id: 't1' }, error: null },
    coach_class_rates: { data: null, error: null },
  })
  serverCreate.mockResolvedValue(mock)
  const res = await saveClassRate('c1', 't1', 120)
  expect(res.error).toBeNull()
  expect(mock.builder('coach_class_rates').upsert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', coach_id: 'c1', template_id: 't1', rate_aed: 120 }),
    { onConflict: 'box_id,coach_id,template_id' },
  )
})

test('deleteClassRate deletes box-pinned', async () => {
  const mock = as('owner', { coach_class_rates: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await deleteClassRate('r1')
  expect(res.error).toBeNull()
  expect(mock.builder('coach_class_rates').delete).toHaveBeenCalled()
  expect(mock.builder('coach_class_rates').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('addPayAdjustment validates the line', async () => {
  serverCreate.mockResolvedValue(as('owner'))
  const res = await addPayAdjustment('c1', '2026-06', 100, '   ')
  expect(res.error).toBe('A note is required.')
})

test('addPayAdjustment inserts with created_by', async () => {
  const mock = as('owner', { pay_adjustments: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await addPayAdjustment('c1', '2026-06', -150, 'late penalty')
  expect(res.error).toBeNull()
  expect(mock.builder('pay_adjustments').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', coach_id: 'c1', month: '2026-06', amount_aed: -150, note: 'late penalty', created_by: 'u1',
  }))
})

test('deletePayAdjustment deletes box-pinned', async () => {
  const mock = as('owner', { pay_adjustments: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await deletePayAdjustment('adj1')
  expect(res.error).toBeNull()
  expect(mock.builder('pay_adjustments').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/payroll-accuracy.integration.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the three action files**

```ts
// src/app/dashboard/reports/payroll/_actions/set-instance-coach.ts
'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import { revalidatePath } from 'next/cache'

export async function setInstanceCoach(instanceId: string, coachId: string | null): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can reassign classes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  if (coachId) {
    const { data: target } = await supabase.from('profiles').select('role').eq('id', coachId).eq('box_id', profile.box_id).maybeSingle()
    if (!target || !(ALL_STAFF_ROLES as readonly string[]).includes(target.role)) return { error: 'Coach not found.' }
  }

  // class_instances programming-tier write policy (mig 058) covers this update.
  const { error } = await supabase.from('class_instances').update({ coach_id: coachId }).eq('id', instanceId).eq('box_id', profile.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/prep')
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
```

```ts
// src/app/dashboard/reports/payroll/_actions/class-rates.ts
'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { validateClassRate } from '@/lib/reports/payroll'
import { revalidatePath } from 'next/cache'

export async function saveClassRate(coachId: string, templateId: string, rateAed: number): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can set pay rates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const invalid = validateClassRate(rateAed)
  if (invalid) return { error: invalid }

  const { data: template } = await supabase.from('class_templates').select('id').eq('id', templateId).eq('box_id', profile.box_id).maybeSingle()
  if (!template) return { error: 'Class type not found.' }

  const { error } = await supabase.from('coach_class_rates').upsert({
    box_id: profile.box_id,
    coach_id: coachId,
    template_id: templateId,
    rate_aed: rateAed,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'box_id,coach_id,template_id' })
  if (error) return { error: 'Could not save the rate. Please try again.' }
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}

export async function deleteClassRate(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can set pay rates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('coach_class_rates').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
```

```ts
// src/app/dashboard/reports/payroll/_actions/pay-adjustments.ts
'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { validateAdjustment } from '@/lib/reports/payroll'
import { revalidatePath } from 'next/cache'

export async function addPayAdjustment(coachId: string, month: string, amountAed: number, note: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can add adjustments.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const invalid = validateAdjustment(amountAed, note, month)
  if (invalid) return { error: invalid }

  const { error } = await supabase.from('pay_adjustments').insert({
    box_id: profile.box_id,
    coach_id: coachId,
    month,
    amount_aed: amountAed,
    note: note.trim(),
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}

export async function deletePayAdjustment(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can add adjustments.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('pay_adjustments').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/__tests__/payroll-accuracy.integration.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/reports/payroll/_actions src/__tests__/payroll-accuracy.integration.test.ts
git commit --no-verify -q -m "feat(payroll): instance-coach, class-rate, adjustment actions (#59 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Payroll page — fetches, column, editors, footnote

**Files:**
- Create: `src/app/dashboard/reports/payroll/_components/class-rates-editor.tsx`
- Create: `src/app/dashboard/reports/payroll/_components/adjustments-section.tsx`
- Modify: `src/app/dashboard/reports/payroll/page.tsx`

- [ ] **Step 1: Create the class-rates editor (client)**

```tsx
// src/app/dashboard/reports/payroll/_components/class-rates-editor.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveClassRate, deleteClassRate } from '../_actions/class-rates'

type Template = { id: string; name: string }
type Rate = { id: string; template_id: string; rate_aed: number }

export function ClassRatesEditor({ coachId, templates, rates }: { coachId: string; templates: Template[]; rates: Rate[] }) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState('')
  const [rate, setRate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const nameOf = (tid: string) => templates.find((t) => t.id === tid)?.name ?? 'Class'

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] text-ink-3 hover:text-ink">
        Class-type rates{rates.length > 0 ? ` (${rates.length})` : ''}
      </summary>
      <div className="mt-1.5 flex flex-col gap-1">
        {rates.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-[11.5px] text-ink-2">
            <span>{nameOf(r.template_id)} · {r.rate_aed} AED</span>
            <button
              onClick={() => start(async () => { const res = await deleteClassRate(r.id); if (res.error) setError(res.error); else router.refresh() })}
              disabled={pending}
              className="text-ink-3 underline hover:text-ink"
            >
              remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Class type"
            className="h-7 rounded-md border border-line bg-surface px-1.5 text-[11.5px] text-ink">
            <option value="">Class type…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="AED" inputMode="decimal" aria-label="Rate (AED)"
            className="h-7 w-16 rounded-md border border-line bg-surface px-1.5 text-[11.5px] text-ink" />
          <button
            onClick={() => {
              if (!templateId) { setError('Pick a class type.'); return }
              setError(null)
              start(async () => {
                const res = await saveClassRate(coachId, templateId, Number(rate))
                if (res.error) setError(res.error)
                else { setTemplateId(''); setRate(''); router.refresh() }
              })
            }}
            disabled={pending}
            className="h-7 rounded-md border border-line bg-surface px-2 text-[11.5px] font-semibold text-ink hover:border-line-strong"
          >
            {pending ? '…' : 'Save'}
          </button>
        </div>
        {error && <span className="text-[11px] text-danger">{error}</span>}
      </div>
    </details>
  )
}
```

- [ ] **Step 2: Create the adjustments section (client)**

```tsx
// src/app/dashboard/reports/payroll/_components/adjustments-section.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addPayAdjustment, deletePayAdjustment } from '../_actions/pay-adjustments'

type Coach = { id: string; name: string }
type Item = { id: string; coach_id: string; amount_aed: number; note: string }

export function AdjustmentsSection({ month, coaches, items }: { month: string; coaches: Coach[]; items: Item[] }) {
  const router = useRouter()
  const [coachId, setCoachId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const nameOf = (id: string) => coaches.find((c) => c.id === id)?.name ?? 'Coach'

  return (
    <div className="mt-5">
      <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Adjustments — {month}</h2>
      <div className="flex flex-col gap-1.5">
        {items.length === 0 && <p className="text-[12.5px] text-ink-3">No bonus or deduction lines this month.</p>}
        {items.map((a) => (
          <div key={a.id} className="flex items-center gap-2.5 text-[13px] text-ink-2">
            <span className="font-semibold text-ink">{nameOf(a.coach_id)}</span>
            <span className={a.amount_aed < 0 ? 'font-mono text-danger' : 'font-mono text-ok'}>
              {a.amount_aed < 0 ? `−${Math.abs(a.amount_aed)}` : `+${a.amount_aed}`} AED
            </span>
            <span className="text-ink-3">{a.note}</span>
            <button
              onClick={() => start(async () => { const res = await deletePayAdjustment(a.id); if (res.error) setError(res.error); else router.refresh() })}
              disabled={pending}
              className="text-[11.5px] text-ink-3 underline hover:text-ink"
            >
              remove
            </button>
          </div>
        ))}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} aria-label="Coach"
            className="h-8 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink">
            <option value="">Coach…</option>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="±AED" inputMode="decimal" aria-label="Amount (AED)"
            className="h-8 w-20 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required)" aria-label="Note"
            className="h-8 w-56 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink" />
          <button
            onClick={() => {
              if (!coachId) { setError('Pick a coach.'); return }
              setError(null)
              start(async () => {
                const res = await addPayAdjustment(coachId, month, Number(amount), note)
                if (res.error) setError(res.error)
                else { setCoachId(''); setAmount(''); setNote(''); router.refresh() }
              })
            }}
            disabled={pending}
            className="h-8 rounded-md border border-line bg-surface px-3 text-[12.5px] font-semibold text-ink hover:border-line-strong"
          >
            {pending ? '…' : 'Add'}
          </button>
        </div>
        {error && <span className="text-[11.5px] text-danger">{error}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the page**

In `page.tsx`:

Imports — extend the lib import and add the components:

```ts
import { buildPayroll, type PayRateRow, type PayrollInstance, type PtSessionRow, type ClassRateRow, type AdjustmentRow } from '@/lib/reports/payroll'
import { ClassRatesEditor } from './_components/class-rates-editor'
import { AdjustmentsSection } from './_components/adjustments-section'
```

Fetches — instance select gains its own coach + template; two new queries appended to the `Promise.all`:

```ts
    supabase.from('class_instances').select('starts_at, coach_id, template_id, class_templates(coach_id)').eq('box_id', profile.box_id).neq('status', 'cancelled').gte('starts_at', fetchStart).lte('starts_at', fetchEnd),
    supabase.from('pt_sessions').select('coach_id, redeemed_at').eq('box_id', profile.box_id).gte('redeemed_at', fetchStart).lte('redeemed_at', fetchEnd),
    supabase.from('coach_class_rates').select('id, coach_id, template_id, rate_aed').eq('box_id', profile.box_id),
    supabase.from('pay_adjustments').select('id, coach_id, amount_aed, note').eq('box_id', profile.box_id).eq('month', monthKey).order('created_at'),
    supabase.from('class_templates').select('id, name').eq('box_id', profile.box_id).order('name'),
```

with destructure `..., { data: classRateRows }, { data: adjRows }, { data: templateRows }`.

Instance mapping:

```ts
  type InstRow = { starts_at: string; coach_id: string | null; template_id: string | null; class_templates: Embedded<{ coach_id: string | null }> }
  const instances: PayrollInstance[] = ((instRows ?? []) as InstRow[]).map((r) => ({
    starts_at: r.starts_at,
    coach_id: r.coach_id,
    template_id: r.template_id,
    template_coach_id: one(r.class_templates)?.coach_id ?? null,
  }))
```

Number-cast the new rows and call `buildPayroll(..., monthKey, tz, nowIso, classRates, adjustments)`:

```ts
  const classRates: ClassRateRow[] = ((classRateRows ?? []) as { id: string; coach_id: string; template_id: string; rate_aed: number | string }[])
    .map((r) => ({ coach_id: r.coach_id, template_id: r.template_id, rate_aed: Number(r.rate_aed) }))
  const adjustments: AdjustmentRow[] = ((adjRows ?? []) as { id: string; coach_id: string; amount_aed: number | string; note: string }[])
    .map((r) => ({ coach_id: r.coach_id, amount_aed: Number(r.amount_aed) }))
```

Table — add an Adjustments column between "PT sessions" and "Pay (AED)" (header `<Th className="text-right">Adj.</Th>`; cell `<Td className="text-right">{r.adjustmentsAed !== 0 ? r.adjustmentsAed.toFixed(2) : '—'}</Td>`; totals row gains an empty `<Td></Td>` in the matching slot). CSV headers/rows gain `'Adjustments (AED)'` / `r.adjustmentsAed` before Pay.

Under the `PayRateEditor` in each row's last `<Td>`, add:

```tsx
                      <ClassRatesEditor
                        coachId={r.coachId}
                        templates={(templateRows ?? []) as { id: string; name: string }[]}
                        rates={((classRateRows ?? []) as { id: string; coach_id: string; template_id: string; rate_aed: number | string }[])
                          .filter((cr) => cr.coach_id === r.coachId)
                          .map((cr) => ({ id: cr.id, template_id: cr.template_id, rate_aed: Number(cr.rate_aed) }))}
                      />
```

After the `</Table>`, before the unassigned warning, add:

```tsx
            <AdjustmentsSection
              month={monthKey}
              coaches={report.rows.map((r) => ({ id: r.coachId, name: r.coachName }))}
              items={((adjRows ?? []) as { id: string; coach_id: string; amount_aed: number | string; note: string }[])
                .map((a) => ({ id: a.id, coach_id: a.coach_id, amount_aed: Number(a.amount_aed), note: a.note }))}
            />
```

Footnotes: the unassigned warning text changes "no coach on the template" → "no coach on the instance or template"; the known-limits line replaces "Class substitutions are not tracked — classes pay the rostered coach." with "Classes pay the coach on the instance — record substitutions with the coach picker on Class Prep."

- [ ] **Step 4: Verify and commit**

Run: `npm run type-check` — 0 errors. Run: `npm run lint` — clean. Then:

```bash
git add src/app/dashboard/reports/payroll
git commit --no-verify -q -m "feat(payroll): adjustments column + class-rate editor + month adjustments section (#59 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Prep-page coach picker

**Files:**
- Create: `src/app/dashboard/prep/_components/instance-coach-picker.tsx`
- Modify: `src/app/dashboard/prep/page.tsx`

- [ ] **Step 1: Create the picker (client)**

```tsx
// src/app/dashboard/prep/_components/instance-coach-picker.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setInstanceCoach } from '@/app/dashboard/reports/payroll/_actions/set-instance-coach'

type Coach = { id: string; full_name: string | null }

export function InstanceCoachPicker({ instanceId, coachId, coaches }: { instanceId: string; coachId: string | null; coaches: Coach[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={coachId ?? ''}
        disabled={pending}
        aria-label="Class coach"
        onChange={(e) => {
          const next = e.target.value || null
          setError(null)
          start(async () => {
            const res = await setInstanceCoach(instanceId, next)
            if (res.error) setError(res.error)
            else router.refresh()
          })
        }}
        className="h-6 rounded-md border border-line bg-surface px-1 font-mono text-[11px] text-ink-2"
      >
        <option value="">No coach</option>
        {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name ?? 'Coach'}</option>)}
      </select>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
```

- [ ] **Step 2: Wire the prep page**

In `prep/page.tsx`:

Imports:

```ts
import { PROGRAMMING_ROLES } from '@/lib/auth/roles'
import { InstanceCoachPicker } from './_components/instance-coach-picker'
```

Instance select gains `coach_id` (line ~38):

```ts
    .select('id, starts_at, capacity, coach_id, class_templates(name), profiles(full_name), bookings(athlete_id, checked_in, profiles!bookings_athlete_id_fkey(full_name))')
```

After the instances fetch, add the programming check + coach list:

```ts
  const isProgramming = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)
  const { data: coachList } = isProgramming
    ? await supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'coach').order('full_name')
    : { data: null }
```

In the selected-class header (the `{selected ? fmtTime(...) : ''} · {selectedCoach ?? 'No coach'} · {roster.length} booked` line), replace the coach segment so programming-tier viewers get the picker:

```tsx
              <span className="font-mono text-xs text-ink-3">
                {selected ? fmtTime(selected.starts_at, timezone) : ''} ·{' '}
                {isProgramming && selected ? (
                  <InstanceCoachPicker
                    instanceId={selected.id}
                    coachId={(selected as { coach_id?: string | null }).coach_id ?? null}
                    coaches={(coachList ?? []) as { id: string; full_name: string | null }[]}
                  />
                ) : (
                  selectedCoach ?? 'No coach'
                )}{' '}
                · {roster.length} booked
              </span>
```

- [ ] **Step 3: Verify and commit**

Run: `npm run type-check` — 0 errors. Run: `npm run lint` — clean. Run: `npx vitest run` — 986 passed (READ the number). Then:

```bash
git add src/app/dashboard/prep
git commit --no-verify -q -m "feat(payroll): per-instance coach picker on Class Prep (#59 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final gate, prod migration, roadmap, push

- [ ] **Step 1: Full gate — each SEPARATELY, READ output**

```bash
npm run type-check
```
```bash
npm run lint
```
```bash
npx vitest run
```
Expected: ~986 passed (964 + ~22), 0 failed — read the real number.
```bash
npm run build
```

- [ ] **Step 2: Apply migration 063 to prod**

```bash
docker run --rm -i postgres:17 psql "<SESSION_POOLER_URL>" -v ON_ERROR_STOP=1 < migrations/063_payroll_accuracy.sql
```

Probes:

```sql
SELECT count(*) FROM coach_class_rates;                                              -- expect 0
SELECT count(*) FROM pay_adjustments;                                                -- expect 0
SELECT count(*) FROM pg_policies WHERE tablename IN ('coach_class_rates','pay_adjustments');  -- expect 2
```

- [ ] **Step 3: Roadmap + push**

`GymGlofox.md` item 59 stays ⬜ with the bold partial note: *accuracy pack ✅ 2026-06-12 (mig 063): substitution-accurate pay (`instance.coach_id ?? template` + prep-page coach picker via `setInstanceCoach`), per-class-type rate overrides (replace for per-class, additive for monthly), manual monthly adjustments (± AED + note) — column, editors, CSV; clock-in/out timecards remain.* Also update the #55 entry's "substitutions untracked" limitation note to point at the fix. Then:

```bash
git add GymGlofox.md
git commit --no-verify -q -m "docs(roadmap): #59 accuracy pack shipped — mig 063; timecards remain

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Manual smoke after deploy: swap a coach on Class Prep → payroll month attributes the class to the sub; add a Yoga override for a per-class coach → that class pays the override; add a +500 bonus line → Adjustments column + total + CSV reflect it.
