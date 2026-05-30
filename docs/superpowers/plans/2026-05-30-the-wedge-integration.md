# The Wedge Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a structured WOD strength prescription (lift + sets×reps@%) auto-resolve each athlete's exact working load from their stored 1RM, rendered on the whiteboard and the athlete's WOD page.

**Architecture:** Add two additive columns to `workouts` (`strength_lift`, `strength_sets jsonb`). Extract the calculator's load math into one pure, tested lib (`src/lib/percentage.ts`). The coach enters the prescription via structured fields; server components join each athlete's 1RM and call `loadForPercent` to render kg. Lift catalog expands from 9 to ~28 movements, feeding both the 1RM form and the WOD dropdown.

**Tech Stack:** Next.js 14 App Router (server components + server actions), Supabase, Zod, Vitest. Spec: `docs/superpowers/specs/2026-05-30-the-wedge-integration-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/percentage.ts` (NEW) | Pure math: `roundToBar`, `kgToLb`, `getZone`, `loadForPercent`. Single source of truth. |
| `src/__tests__/percentage.test.ts` (NEW) | Unit tests for the math lib. |
| `src/app/dashboard/lifts/_components/calculator.tsx` (MODIFY) | Import shared math; delete local copies. |
| `src/app/dashboard/lifts/_lib/lift-names.ts` (MODIFY) | Expand catalog to ~28 movements. |
| `migrations/018_strength_prescription.sql` (NEW) | Add `strength_lift`, `strength_sets` to `workouts`. |
| `src/app/dashboard/wod/_lib/validation.ts` (NEW) | `StrengthSet` type + `validateStrengthPrescription`. |
| `src/__tests__/wod-strength.test.ts` (NEW) | Unit tests for the prescription validator. |
| `src/app/dashboard/wod/_components/wod-form.tsx` (MODIFY) | Structured % block: lift dropdown + repeatable set rows. |
| `src/app/dashboard/wod/_actions/save-wod.ts` (MODIFY) | Parse + validate + persist prescription. |
| `src/app/dashboard/wod/page.tsx` (MODIFY) | Fetch viewing athlete's 1RM; render "Your loads". |
| `src/app/dashboard/whiteboard/page.tsx` (MODIFY) | Fetch WOD + booked athletes' 1RMs; render per-athlete load. |

---

## Task 1: Shared percentage math lib

**Files:**
- Create: `src/lib/percentage.ts`
- Test: `src/__tests__/percentage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/percentage.test.ts`:

```ts
import { roundToBar, kgToLb, getZone, loadForPercent } from '@/lib/percentage'

describe('roundToBar', () => {
  test('rounds to nearest 2.5 kg', () => {
    expect(roundToBar(100)).toBe(100)
    expect(roundToBar(99)).toBe(100)
    expect(roundToBar(96)).toBe(95)
  })
})

describe('kgToLb', () => {
  test('converts kg to lb to one decimal', () => {
    expect(kgToLb(100)).toBe(220.5)
  })
})

describe('getZone', () => {
  test('classifies percentage into zones at boundaries', () => {
    expect(getZone(65).label).toBe('Warm-up')
    expect(getZone(66).label).toBe('Work')
    expect(getZone(79).label).toBe('Work')
    expect(getZone(80).label).toBe('Heavy')
    expect(getZone(94).label).toBe('Heavy')
    expect(getZone(95).label).toBe('Max')
  })
})

describe('loadForPercent', () => {
  test('computes exact and bar-rounded kg from grams', () => {
    expect(loadForPercent(100000, 80)).toEqual({ exactKg: 80, barKg: 80 })
  })
  test('rounds the working load to the nearest 2.5 kg', () => {
    expect(loadForPercent(102500, 90)).toEqual({ exactKg: 92.25, barKg: 92.5 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- percentage`
Expected: FAIL — cannot find module `@/lib/percentage`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/percentage.ts`:

```ts
export type Zone = { label: string; bg: string; ink: string }

export function roundToBar(kg: number): number {
  return Math.round(kg / 2.5) * 2.5
}

export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046 * 10) / 10
}

export function getZone(pct: number): Zone {
  if (pct <= 65) return { label: 'Warm-up', bg: 'var(--c-ok-soft)',       ink: 'var(--c-ok-ink)' }
  if (pct <= 79) return { label: 'Work',    bg: 'var(--c-warn-soft)',     ink: 'var(--c-warn-ink)' }
  if (pct <= 94) return { label: 'Heavy',   bg: 'var(--c-danger-soft)',   ink: 'var(--c-danger-ink)' }
  return                { label: 'Max',     bg: 'var(--circle-lime-soft)', ink: 'var(--circle-lime-ink)' }
}

export function loadForPercent(oneRmGrams: number, pct: number): { exactKg: number; barKg: number } {
  const exactKg = ((oneRmGrams / 1000) * pct) / 100
  return { exactKg, barKg: roundToBar(exactKg) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- percentage`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/percentage.ts src/__tests__/percentage.test.ts
git commit -m "feat(wedge): shared percentage-load math lib"
```

---

## Task 2: Refactor calculator to shared lib

**Files:**
- Modify: `src/app/dashboard/lifts/_components/calculator.tsx`

- [ ] **Step 1: Replace local math with the shared lib**

In `calculator.tsx`, add this import directly under the existing `import { LIFT_NAMES } ...` line (line 4):

```ts
import { roundToBar, kgToLb, getZone, type Zone } from '@/lib/percentage'
```

Then **delete** the now-duplicated local definitions (lines 8–23): the `roundTo2_5` function, the `kgToLb` function, the `type Zone` declaration, and the `getZone` function. Keep the `PERCENTAGES` const.

Replace the one call site that used the old name — change `const roundedKg = roundTo2_5(exactKg)` to:

```ts
    const roundedKg = roundToBar(exactKg)
```

(`kgToLb` and `getZone` are called by the same names, so those call sites are unchanged.)

- [ ] **Step 2: Type-check + full test suite**

Run: `npm run type-check && npm run test`
Expected: 0 type errors; all tests pass (behavior is identical — same math, shared source).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (no unused imports left behind).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/lifts/_components/calculator.tsx
git commit -m "refactor(wedge): calculator uses shared percentage lib"
```

---

## Task 3: Expand the lift catalog

**Files:**
- Modify: `src/app/dashboard/lifts/_lib/lift-names.ts`

- [ ] **Step 1: Replace the catalog with the expanded list**

Replace the entire contents of `lift-names.ts` with:

```ts
export const LIFT_NAMES = [
  // Squat
  { value: 'back_squat',        label: 'Back Squat' },
  { value: 'front_squat',       label: 'Front Squat' },
  { value: 'overhead_squat',    label: 'Overhead Squat' },
  // Deadlift family
  { value: 'deadlift',          label: 'Deadlift' },
  { value: 'sumo_deadlift',     label: 'Sumo Deadlift' },
  { value: 'romanian_deadlift', label: 'Romanian Deadlift' },
  // Press
  { value: 'strict_press',      label: 'Strict Press (Overhead)' },
  { value: 'push_press',        label: 'Push Press' },
  { value: 'push_jerk',         label: 'Push Jerk' },
  { value: 'split_jerk',        label: 'Split Jerk' },
  { value: 'bench_press',       label: 'Bench Press' },
  // Clean family
  { value: 'clean',             label: 'Clean (Squat)' },
  { value: 'power_clean',       label: 'Power Clean' },
  { value: 'hang_clean',        label: 'Hang Clean' },
  { value: 'clean_and_jerk',    label: 'Clean & Jerk' },
  // Snatch family
  { value: 'snatch',            label: 'Snatch (Squat)' },
  { value: 'power_snatch',      label: 'Power Snatch' },
  { value: 'hang_snatch',       label: 'Hang Snatch' },
  // Accessory / gymnastics-weighted
  { value: 'thruster',          label: 'Thruster' },
  { value: 'front_rack_lunge',  label: 'Front Rack Lunge' },
  { value: 'back_rack_lunge',   label: 'Back Rack Lunge' },
  { value: 'weighted_pullup',   label: 'Weighted Pull-up' },
  { value: 'weighted_dip',      label: 'Weighted Dip' },
  { value: 'bent_over_row',     label: 'Bent-Over Row' },
  { value: 'pendlay_row',       label: 'Pendlay Row' },
  { value: 'good_morning',      label: 'Good Morning' },
  { value: 'hip_thrust',        label: 'Hip Thrust' },
  { value: 'snatch_grip_dl',    label: 'Snatch-Grip Deadlift' },
]
```

Note: the original 9 values (`back_squat`, `front_squat`, `deadlift`, `clean`, `clean_and_jerk`, `snatch`, `overhead_press`, `bench_press`, `thruster`) are preserved EXCEPT `overhead_press` — it is renamed in label only to `strict_press`. **Keep `overhead_press` too** so existing logged 1RMs don't orphan. Add it at the end:

```ts
  { value: 'overhead_press',    label: 'Overhead Press (legacy)' },
```

Append that line inside the array before the closing `]`. (Any athlete who already logged `overhead_press` keeps a matching catalog entry; new entries use `strict_press`.)

- [ ] **Step 2: Type-check + lint + tests**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all green. `LIFT_NAMES` is consumed by `lift-form.tsx` and `calculator.tsx` via `.map`/`.find`, so the expansion flows automatically with no signature change.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/lifts/_lib/lift-names.ts
git commit -m "feat(wedge): expand lift catalog to standard movements"
```

---

## Task 4: Migration — strength prescription columns

**Files:**
- Create: `migrations/018_strength_prescription.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/018_strength_prescription.sql`:

```sql
-- migrations/018_strength_prescription.sql
-- Run in Supabase SQL Editor.
-- Adds the structured percentage prescription that powers "the Wedge".
-- Additive and idempotent: existing WODs keep working (both columns nullable).

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS strength_lift text,
  ADD COLUMN IF NOT EXISTS strength_sets jsonb;

-- strength_lift: canonical lift value (e.g. 'back_squat') or NULL when the WOD
--   has no percentage prescription.
-- strength_sets: jsonb array of lines, each { "sets": int, "reps": int, "percentage": int }.
--   Example: [{"sets":5,"reps":3,"percentage":80}]
```

- [ ] **Step 2: Verify the SQL is well-formed**

Run: `grep -n "strength_lift\|strength_sets" migrations/018_strength_prescription.sql`
Expected: both columns appear in the `ADD COLUMN` block.

(Apply it in the Supabase SQL Editor before manual demo testing — see Task 9 verification.)

- [ ] **Step 3: Commit**

```bash
git add migrations/018_strength_prescription.sql
git commit -m "feat(wedge): migration 018 — strength prescription columns"
```

---

## Task 5: Prescription validation lib

**Files:**
- Create: `src/app/dashboard/wod/_lib/validation.ts`
- Test: `src/__tests__/wod-strength.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/wod-strength.test.ts`:

```ts
import { validateStrengthPrescription } from '@/app/dashboard/wod/_lib/validation'

describe('validateStrengthPrescription', () => {
  const validSets = [{ sets: 5, reps: 3, percentage: 80 }]

  test('returns null when no lift is selected (no prescription)', () => {
    expect(validateStrengthPrescription('', [])).toBeNull()
  })

  test('returns null for a valid prescription', () => {
    expect(validateStrengthPrescription('back_squat', validSets)).toBeNull()
  })

  test('rejects a non-canonical lift', () => {
    expect(validateStrengthPrescription('not_a_lift', validSets)).not.toBeNull()
  })

  test('rejects a lift with no sets', () => {
    expect(validateStrengthPrescription('back_squat', [])).not.toBeNull()
  })

  test('rejects zero or negative reps/sets', () => {
    expect(validateStrengthPrescription('back_squat', [{ sets: 0, reps: 3, percentage: 80 }])).not.toBeNull()
    expect(validateStrengthPrescription('back_squat', [{ sets: 5, reps: -1, percentage: 80 }])).not.toBeNull()
  })

  test('rejects an out-of-range percentage', () => {
    expect(validateStrengthPrescription('back_squat', [{ sets: 5, reps: 3, percentage: 0 }])).not.toBeNull()
    expect(validateStrengthPrescription('back_squat', [{ sets: 5, reps: 3, percentage: 250 }])).not.toBeNull()
  })

  test('rejects malformed (non-array) sets', () => {
    expect(validateStrengthPrescription('back_squat', null)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- wod-strength`
Expected: FAIL — cannot find module `validation`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/dashboard/wod/_lib/validation.ts`:

```ts
import { z } from 'zod'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'

export type StrengthSet = { sets: number; reps: number; percentage: number }

const LIFT_VALUES = LIFT_NAMES.map((l) => l.value) as [string, ...string[]]

const setSchema = z.object({
  sets: z.number().int().positive(),
  reps: z.number().int().positive(),
  percentage: z.number().positive().max(200),
})

const prescriptionSchema = z.object({
  lift: z.enum(LIFT_VALUES),
  sets: z.array(setSchema).min(1),
})

// Empty lift => no prescription, which is valid. Otherwise lift + sets must be valid.
export function validateStrengthPrescription(lift: string, sets: unknown): string | null {
  if (!lift) return null
  const result = prescriptionSchema.safeParse({ lift, sets })
  if (!result.success) {
    return 'Pick a lift from the list and add at least one set with positive sets, reps, and %.'
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- wod-strength`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/wod/_lib/validation.ts src/__tests__/wod-strength.test.ts
git commit -m "feat(wedge): strength prescription validation"
```

---

## Task 6: WOD form — structured % block

**Files:**
- Modify: `src/app/dashboard/wod/_components/wod-form.tsx`

- [ ] **Step 1: Extend imports and the `Wod` type**

At the top of `wod-form.tsx`, change `import { useFormState, useFormStatus } from 'react-dom'` block to also import `useState`:

```ts
import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveWod } from '../_actions/save-wod'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '../_lib/validation'
```

Extend the `Wod` type to carry the prescription:

```ts
type Wod = {
  title: string
  description: string
  scoring_type: string
  strength_title?: string | null
  strength_description?: string | null
  strength_lift?: string | null
  strength_sets?: StrengthSet[] | null
} | null
```

- [ ] **Step 2: Add prescription state inside `WodForm`**

Immediately after `const [state, formAction] = useFormState(saveWod, { error: null })`, add:

```ts
  const [lift, setLift] = useState(existing?.strength_lift ?? '')
  const [sets, setSets] = useState<StrengthSet[]>(existing?.strength_sets ?? [])

  function updateSet(i: number, key: keyof StrengthSet, value: number) {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)))
  }
  function addSet() {
    setSets((prev) => [...prev, { sets: 5, reps: 3, percentage: 80 }])
  }
  function removeSet(i: number) {
    setSets((prev) => prev.filter((_, idx) => idx !== i))
  }
```

- [ ] **Step 3: Render the % block + hidden serialized field**

Inside the Strength section `<div>` (the block with the "Strength (optional)" label, after the "Program" textarea's closing `</div>` and before the section's closing `</div>` at line ~91), insert the percentage builder:

```tsx
        {/* The Wedge — structured % prescription */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--c-border)', paddingTop: 12 }}>
          <label className="mono" style={labelStyle}>% Loading (optional · powers per-athlete loads)</label>
          <select
            name="strengthLift"
            value={lift}
            onChange={(e) => setLift(e.target.value)}
            style={inputStyle}
          >
            <option value="">No % prescription</option>
            {LIFT_NAMES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          {lift && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sets.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" min={1} value={s.sets}
                    onChange={(e) => updateSet(i, 'sets', Number(e.target.value))}
                    style={{ ...inputStyle, width: 64 }} aria-label="sets" />
                  <span className="mono" style={{ color: 'var(--c-ink-muted)', fontSize: 13 }}>×</span>
                  <input type="number" min={1} value={s.reps}
                    onChange={(e) => updateSet(i, 'reps', Number(e.target.value))}
                    style={{ ...inputStyle, width: 64 }} aria-label="reps" />
                  <span className="mono" style={{ color: 'var(--c-ink-muted)', fontSize: 13 }}>@</span>
                  <input type="number" min={1} max={200} value={s.percentage}
                    onChange={(e) => updateSet(i, 'percentage', Number(e.target.value))}
                    style={{ ...inputStyle, width: 72 }} aria-label="percentage" />
                  <span className="mono" style={{ color: 'var(--c-ink-muted)', fontSize: 13 }}>%</span>
                  <button type="button" onClick={() => removeSet(i)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                    aria-label="remove set">×</button>
                </div>
              ))}
              <button type="button" onClick={addSet}
                style={{ alignSelf: 'flex-start', background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--c-ink-2)' }}>
                + Add set
              </button>
            </div>
          )}
          <input type="hidden" name="strengthSets" value={JSON.stringify(sets)} />
        </div>
```

- [ ] **Step 4: Type-check + lint + tests**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/wod/_components/wod-form.tsx
git commit -m "feat(wedge): structured % block in WOD form"
```

---

## Task 7: save-wod persists the prescription

**Files:**
- Modify: `src/app/dashboard/wod/_actions/save-wod.ts`

- [ ] **Step 1: Parse, validate, and persist**

In `save-wod.ts`, add the import under the existing imports:

```ts
import { validateStrengthPrescription, type StrengthSet } from '../_lib/validation'
```

After the existing `strengthDescription` line, add:

```ts
  const strengthLift = (formData.get('strengthLift') as string)?.trim() || ''
  const strengthSetsRaw = (formData.get('strengthSets') as string) || '[]'
  let strengthSets: unknown
  try { strengthSets = JSON.parse(strengthSetsRaw) } catch { strengthSets = null }

  const prescriptionError = validateStrengthPrescription(strengthLift, strengthSets)
  if (prescriptionError) return { error: prescriptionError }
```

In the `.upsert({ ... })` object, add two fields after `strength_description: strengthDescription,`:

```ts
      strength_lift: strengthLift || null,
      strength_sets: strengthLift ? (strengthSets as StrengthSet[]) : null,
```

- [ ] **Step 2: Type-check + lint + tests**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all green (the existing WOD save tests, if any, still pass; new fields are optional).

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/wod/_actions/save-wod.ts
git commit -m "feat(wedge): persist strength prescription on WOD save"
```

---

## Task 8: Athlete WOD view renders personal loads

**Files:**
- Modify: `src/app/dashboard/wod/page.tsx`

- [ ] **Step 1: Add imports and fetch the viewing athlete's 1RM**

At the top of `page.tsx`, add:

```ts
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { loadForPercent } from '@/lib/percentage'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
```

Update the WOD select (currently `.select('id, title, description, scoring_type, strength_title, strength_description')`) to also pull the prescription:

```ts
    .select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')
```

After the `myScore` line, fetch the athlete's 1RM for the prescribed lift:

```ts
  const { data: myLift } = wod?.strength_lift
    ? await supabase
        .from('athlete_lifts')
        .select('one_rm_grams')
        .eq('athlete_id', user.id)
        .eq('lift_name', wod.strength_lift)
        .maybeSingle()
    : { data: null }
```

- [ ] **Step 2: Add the `YourLoads` server component to the file**

At the bottom of `page.tsx` (next to the existing helper functions), add:

```tsx
function YourLoads({ liftValue, sets, oneRmGrams }: { liftValue: string; sets: StrengthSet[]; oneRmGrams: number | null }) {
  const liftLabel = LIFT_NAMES.find((l) => l.value === liftValue)?.label ?? liftValue
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--circle-lime)',
      borderRadius: 14, padding: '18px 22px', marginBottom: 12, boxShadow: 'var(--c-shadow-sm)',
    }}>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--circle-lime-ink)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Your loads · {liftLabel}
      </div>
      {oneRmGrams === null ? (
        <div style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>
          {sets.map((s) => `${s.sets}×${s.reps} @ ${s.percentage}%`).join('  ·  ')}
          {' — '}
          <a href="/dashboard/lifts" style={{ color: 'var(--circle-lime-ink)', textDecoration: 'underline' }}>
            Log your {liftLabel} 1RM
          </a> to see kg.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sets.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="mono" style={{ fontSize: 13, color: 'var(--c-ink-2)', minWidth: 96 }}>
                {s.sets}×{s.reps} @ {s.percentage}%
              </span>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-ink)' }}>
                {loadForPercent(oneRmGrams, s.percentage).barKg}
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Render it in the page**

Directly after the Strength card block (the `{wod?.strength_title && ( ... )}` block) and before the WOD card, insert:

```tsx
            {/* Your personal loads (the Wedge) */}
            {wod?.strength_lift && (
              <YourLoads
                liftValue={wod.strength_lift}
                sets={(wod.strength_sets ?? []) as StrengthSet[]}
                oneRmGrams={myLift?.one_rm_grams ?? null}
              />
            )}
```

Also extend the `existing` prop passed to `<WodForm ... />` so the coach can edit a saved prescription — add to the object literal:

```tsx
                  strength_lift: wod.strength_lift,
                  strength_sets: wod.strength_sets,
```

- [ ] **Step 4: Type-check + lint + tests**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/wod/page.tsx
git commit -m "feat(wedge): render athlete's personal loads on WOD page"
```

---

## Task 9: Whiteboard renders per-athlete loads

**Files:**
- Modify: `src/app/dashboard/whiteboard/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `whiteboard/page.tsx`, add:

```ts
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { loadForPercent } from '@/lib/percentage'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
```

- [ ] **Step 2: Fetch today's WOD prescription and booked athletes' 1RMs**

After `const todayIso = todayLocalDate(timezone)` (around line 106) and before the `return (`, add (it must come after `todayIso` is defined — `athleteIds` is already defined earlier at ~line 80):

```ts
  // The Wedge — today's strength prescription + each booked athlete's 1RM for that lift
  const { data: wod } = await supabase
    .from('workouts')
    .select('strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .eq('date', todayIso)
    .maybeSingle()

  const strengthSets = (wod?.strength_sets ?? []) as StrengthSet[]
  const topPct = strengthSets.length ? Math.max(...strengthSets.map((s) => s.percentage)) : null
  const liftLabel = wod?.strength_lift
    ? (LIFT_NAMES.find((l) => l.value === wod.strength_lift)?.label ?? wod.strength_lift)
    : null

  const { data: liftRows } = wod?.strength_lift && athleteIds.length > 0
    ? await supabase
        .from('athlete_lifts')
        .select('athlete_id, one_rm_grams')
        .eq('box_id', profile.box_id)
        .eq('lift_name', wod.strength_lift)
        .in('athlete_id', athleteIds)
    : { data: [] as Array<{ athlete_id: string; one_rm_grams: number }> }

  const oneRmByAthlete = new Map((liftRows ?? []).map((r) => [r.athlete_id, r.one_rm_grams]))
```

Note: `todayIso` is already defined earlier in the file.

- [ ] **Step 3: Add a board-level strength banner**

Immediately inside the Body `<div style={{ flex: 1, padding: '32px 36px' }}>`, before the empty-state check, add:

```tsx
        {liftLabel && topPct !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
            padding: '14px 20px', borderRadius: 12,
            background: 'var(--c-surface)', border: '1px solid var(--circle-lime)',
          }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Strength
            </span>
            <span style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 18, color: 'var(--c-ink)' }}>
              {liftLabel}
            </span>
            <span className="mono" style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>
              {strengthSets.map((s) => `${s.sets}×${s.reps} @ ${s.percentage}%`).join('  ·  ')}
            </span>
          </div>
        )}
```

- [ ] **Step 4: Render each athlete's working load next to their name**

In the `bookings?.map((booking) => { ... })` block, the existing consts `athleteProfile`, `memberships`, `status`, `lastPaid` stay. Add the two new consts (`oneRm`, `load`) immediately after `lastPaid`, then replace the existing `return ( <CheckInButton ... /> )` with the wrapped version below:

```tsx
                    const oneRm = oneRmByAthlete.get(booking.athlete_id) ?? null
                    const load = wod?.strength_lift && topPct !== null
                      ? (oneRm !== null ? `${loadForPercent(oneRm, topPct).barKg} kg` : '— log 1RM')
                      : null
                    return (
                      <div key={booking.athlete_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <CheckInButton
                            instanceId={instance.id}
                            athleteId={booking.athlete_id}
                            athleteName={athleteProfile?.full_name ?? 'Unknown'}
                            checkedIn={booking.checked_in}
                            membershipStatus={status}
                            lastPaidDate={lastPaid}
                          />
                        </div>
                        {load && (
                          <span className="mono" style={{
                            fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap',
                            color: oneRm !== null ? 'var(--circle-lime-ink)' : 'var(--c-ink-faint)',
                          }}>{load}</span>
                        )}
                      </div>
                    )
```

(Remove the old standalone `key={booking.athlete_id}` from `CheckInButton` since the wrapping `<div>` now carries the key.)

- [ ] **Step 5: Type-check + lint + tests**

Run: `npm run type-check && npm run lint && npm run test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/whiteboard/page.tsx
git commit -m "feat(wedge): per-athlete loads on the whiteboard"
```

---

## Final verification (manual demo)

Apply `migrations/018_strength_prescription.sql` in the Supabase SQL Editor first, then:

- [ ] **Build:** `npm run build` → succeeds with no type/route errors.
- [ ] As an athlete, log a `back_squat` 1RM (e.g. 100 kg) at `/dashboard/lifts`.
- [ ] As a coach, post today's WOD with a % prescription: lift = Back Squat, set = `5 × 3 @ 80%`. Save.
- [ ] Open `/dashboard/whiteboard` → the booked athlete's row shows `80 kg`; the board banner shows `Back Squat · 5×3 @ 80%`.
- [ ] As that athlete, open `/dashboard/wod` → "Your loads" card shows `5×3 @ 80% → 80 kg`.
- [ ] Book a second athlete with **no** `back_squat` 1RM → their whiteboard row shows `— log 1RM`; their WOD page shows the "Log your Back Squat 1RM" link.
- [ ] Edit the WOD, change to `No % prescription`, save → whiteboard banner and per-athlete loads disappear; free-text strength still renders.

---

## Notes for the implementer

- **Weight is grams in the DB**, kg in the UI. `loadForPercent` takes grams and returns kg. Never store kg.
- **RLS:** the whiteboard runs in the coach/owner session; `box_isolation_select on athlete_lifts` already permits reading booked athletes' 1RMs. No policy change.
- **Scoped out (do not build):** coach prep view (Tier 2 #13), metcon-embedded `@%`, per-box custom lift catalogs, free-text parser. One lift per WOD strength block.
