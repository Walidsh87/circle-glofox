# Scaling Variations (per-WOD tracks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let coaches attach scaling tiers (`{label, description}[]`) to a day's WOD, edited in `WodForm` and shown on the WOD page, whiteboard, and TV board.

**Architecture:** One nullable `scaling jsonb` column on `workouts` holds an ordered `ScalingTier[]`. The coach edits it in `WodForm` with a repeatable editor mirroring the strength-sets editor; `saveWod` validates + persists. The WOD page, whiteboard, and TV read and render it; `copyWodToDates` carries it. No change to the one-WOD-per-day model, scoring, or leaderboards.

**Tech Stack:** Next.js 16 server actions + components, Supabase, zod, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-08-scaling-variations-design.md`.

**Conventions reused (read once):**
- Strength-sets array editor (the exact pattern to mirror): `src/app/dashboard/wod/_components/wod-form.tsx:60-152`. `saveWod`: `src/app/dashboard/wod/_actions/save-wod.ts`. Validation style (zod): `src/app/dashboard/wod/_lib/validation.ts`.
- Tests FLAT in `src/__tests__/`. Integration harness: `src/__tests__/copy-wod-to-dates.integration.test.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `migrations/029_workout_scaling.sql` | create | `workouts.scaling jsonb` |
| `migrations/ROLLBACKS.md` | modify | `### 029_workout_scaling` |
| `src/app/dashboard/wod/_lib/validation.ts` | modify | `ScalingTier` + `validateScaling` |
| `src/__tests__/wod-scaling-validation.test.ts` | create | `validateScaling` unit tests |
| `src/app/dashboard/wod/_actions/save-wod.ts` | modify | parse/validate/persist `scaling` |
| `src/__tests__/save-wod.integration.test.ts` | create | `saveWod` persists/validates scaling |
| `src/app/dashboard/wod/_components/wod-form.tsx` | modify | scaling-tier editor |
| `src/app/dashboard/wod/page.tsx` | modify | select + `existing` + athlete render |
| `src/app/dashboard/programming/day/[date]/page.tsx` | modify | select + `existing` + `actionFields` |
| `src/app/dashboard/programming/_actions/copy-wod-to-dates.ts` | modify | `WodFields.scaling` + row |
| `src/app/dashboard/whiteboard/page.tsx` | modify | select + render |
| `src/app/tv/[token]/page.tsx` | modify | select + render |

---

## Task 1: Migration 029 + rollback

**Files:** Create `migrations/029_workout_scaling.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Write the migration**

Create `migrations/029_workout_scaling.sql`:

```sql
-- migrations/029_workout_scaling.sql
-- Scaling tiers (Rx/Scaled/Beginner…) for a day's WOD (#17, scaling-variations scope).
-- JSONB array of { label, description }. NULL/[] = no tiers. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS scaling jsonb;
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, change the header range `008`–`028` to `008`–`029`. Add this entry immediately above the `### 028_tv_token` heading:

```markdown
### 029_workout_scaling
```sql
ALTER TABLE workouts DROP COLUMN IF EXISTS scaling;
```

```

- [ ] **Step 3: Commit**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add migrations/029_workout_scaling.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(wod): migration 029 — workouts.scaling jsonb for scaling tiers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `ScalingTier` type + `validateScaling`

**Files:** Modify `src/app/dashboard/wod/_lib/validation.ts`; Test `src/__tests__/wod-scaling-validation.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/wod-scaling-validation.test.ts`:

```ts
import { validateScaling } from '@/app/dashboard/wod/_lib/validation'

describe('validateScaling', () => {
  test('null and empty array are valid (no tiers)', () => {
    expect(validateScaling(null)).toBeNull()
    expect(validateScaling([])).toBeNull()
  })
  test('valid tiers pass', () => {
    expect(validateScaling([{ label: 'Rx', description: '42.5/30kg' }, { label: 'Scaled', description: '30/20kg' }])).toBeNull()
  })
  test('a tier missing a description is rejected', () => {
    expect(validateScaling([{ label: 'Rx', description: '' }])).toMatch(/scaling tier/i)
  })
  test('a whitespace-only label is rejected', () => {
    expect(validateScaling([{ label: '   ', description: 'x' }])).toMatch(/scaling tier/i)
  })
  test('more than 6 tiers is rejected', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ label: `T${i}`, description: 'x' }))
    expect(validateScaling(many)).toMatch(/scaling tier/i)
  })
  test('a non-array is rejected', () => {
    expect(validateScaling('nope')).toMatch(/scaling tier/i)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- wod-scaling-validation`
Expected: FAIL — `validateScaling` not exported.

- [ ] **Step 3: Implement**

In `src/app/dashboard/wod/_lib/validation.ts`, add at the end (the file already imports `z`):

```ts
export type ScalingTier = { label: string; description: string }

const scalingTierSchema = z.object({
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
})

// null/undefined or [] => no tiers, valid. Otherwise up to 6 tiers, each with a
// non-empty label + description.
export function validateScaling(raw: unknown): string | null {
  if (raw == null) return null
  const result = z.array(scalingTierSchema).max(6).safeParse(raw)
  if (!result.success) return 'Each scaling tier needs a label and a description (max 6 tiers).'
  return null
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- wod-scaling-validation`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/wod/_lib/validation.ts src/__tests__/wod-scaling-validation.test.ts
git commit -m "$(cat <<'EOF'
feat(wod): ScalingTier type + pure validateScaling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `saveWod` persistence + WodForm editor

**Files:** Modify `src/app/dashboard/wod/_actions/save-wod.ts`, `src/app/dashboard/wod/_components/wod-form.tsx`; Test `src/__tests__/save-wod.integration.test.ts`.

- [ ] **Step 1: Write the failing integration tests**

Create `src/__tests__/save-wod.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveWod } from '@/app/dashboard/wod/_actions/save-wod'

function fd(o: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}
const base = { date: '2026-07-01', title: 'Fran', description: '21-15-9', scoringType: 'time' }

beforeEach(() => vi.clearAllMocks())

test('persists scaling tiers on the workout', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'c1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, workouts: { data: null, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const scaling = JSON.stringify([{ label: 'Rx', description: '42.5/30kg' }, { label: 'Scaled', description: '30/20kg' }])
  const res = await saveWod({ error: null }, fd({ ...base, scaling }))
  expect(res.error).toBeNull()
  const row = rls.builder('workouts').upsert.mock.calls[0][0]
  expect(row.scaling).toEqual([{ label: 'Rx', description: '42.5/30kg' }, { label: 'Scaled', description: '30/20kg' }])
})

test('rejects a scaling tier missing a description (no write)', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const scaling = JSON.stringify([{ label: 'Rx', description: '' }])
  const res = await saveWod({ error: null }, fd({ ...base, scaling }))
  expect(res.error).toMatch(/scaling tier/i)
  expect(rls.builder('workouts')).toBeUndefined()
})

test('a WOD with no scaling saves with scaling null/[]', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'c1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, workouts: { data: null, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveWod({ error: null }, fd(base))
  expect(res.error).toBeNull()
  expect(rls.builder('workouts').upsert.mock.calls[0][0].scaling).toEqual([])
})

test('rejects a non-staff athlete', async () => {
  const rls = makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await saveWod({ error: null }, fd(base))
  expect(res.error).toMatch(/owners and coaches/i)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- save-wod.integration`
Expected: FAIL — `saveWod` doesn't yet parse/persist `scaling`.

- [ ] **Step 3: Update `saveWod`**

In `src/app/dashboard/wod/_actions/save-wod.ts`:

(a) Extend the import:
```ts
import { validateStrengthPrescription, validateScaling, type StrengthSet, type ScalingTier } from '../_lib/validation'
```

(b) After the strength validation (the `if (prescriptionError) return ...` block) and BEFORE `const supabase = await createClient()`, add:
```ts
  const scalingRaw = (formData.get('scaling') as string) || '[]'
  let scaling: unknown
  try { scaling = JSON.parse(scalingRaw) } catch { scaling = null }
  const scalingError = validateScaling(scaling)
  if (scalingError) return { error: scalingError }
```

(c) Add `scaling` to the `workouts` upsert object (after `strength_sets: ...,`):
```ts
      scaling: (scaling ?? []) as ScalingTier[],
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- save-wod.integration`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Add the scaling editor to `WodForm`**

In `src/app/dashboard/wod/_components/wod-form.tsx`:

(a) Extend the type import:
```ts
import type { StrengthSet, ScalingTier } from '../_lib/validation'
```

(b) Add `scaling` to the `Wod` type (inside the object before the closing `} | null`):
```ts
  strength_sets?: StrengthSet[] | null
  scaling?: ScalingTier[] | null
```

(c) Add state + handlers next to the strength ones (after `removeSet`):
```ts
  const [scaling, setScaling] = useState<ScalingTier[]>(existing?.scaling ?? [])
  function updateTier(i: number, key: keyof ScalingTier, value: string) {
    setScaling((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)))
  }
  function addTier() {
    const SUGGESTED = ['Rx', 'Scaled', 'Beginner']
    setScaling((prev) => [...prev, { label: SUGGESTED[prev.length] ?? '', description: '' }])
  }
  function removeTier(i: number) {
    setScaling((prev) => prev.filter((_, idx) => idx !== i))
  }
```

(d) Add a scaling section immediately AFTER the closing `</div>` of the WOD section (the `</div>` that closes the card opened with the "WOD" label — i.e. right before the `{state.error && (` block):
```tsx
      {/* Scaling section */}
      <div style={{
        padding: '14px 16px', borderRadius: 10,
        background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Scaling options (optional)
        </span>
        {scaling.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: i > 0 ? '1px solid var(--c-border)' : 'none', paddingTop: i > 0 ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="text" value={t.label} onChange={(e) => updateTier(i, 'label', e.target.value)} placeholder="Rx" style={{ ...inputStyle, width: 160 }} aria-label="tier label" />
              <button type="button" onClick={() => removeTier(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }} aria-label="remove tier">×</button>
            </div>
            <textarea value={t.description} onChange={(e) => updateTier(i, 'description', e.target.value)} rows={2} placeholder="42.5/30kg thrusters, pull-ups" style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--font-geist-mono)', fontSize: 13 }} aria-label="tier description" />
          </div>
        ))}
        <button type="button" onClick={addTier} style={{ alignSelf: 'flex-start', background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--c-ink-2)' }}>
          + Add scaling tier
        </button>
        <input type="hidden" name="scaling" value={JSON.stringify(scaling)} />
      </div>
```

- [ ] **Step 6: Type-check, lint, full suite, commit**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm test` → all green.

```bash
git add src/app/dashboard/wod/_actions/save-wod.ts src/__tests__/save-wod.integration.test.ts src/app/dashboard/wod/_components/wod-form.tsx
git commit -m "$(cat <<'EOF'
feat(wod): saveWod persists scaling tiers + WodForm scaling editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: WOD page + day editor + copy-to-dates (plumbing + athlete render)

**Files:** Modify `src/app/dashboard/wod/page.tsx`, `src/app/dashboard/programming/day/[date]/page.tsx`, `src/app/dashboard/programming/_actions/copy-wod-to-dates.ts`. No new tests (verified by type-check + build; the copy action's existing integration test still passes).

- [ ] **Step 1: WOD page — select, prefill, athlete render**

In `src/app/dashboard/wod/page.tsx`:

(a) Add `scaling` to the workout select (the `.select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')`):
```ts
    .select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets, scaling')
```

(b) Add `scaling` to the `existing` object passed to `<WodForm>` (after `strength_sets: wod.strength_sets,`):
```tsx
                  strength_sets: wod.strength_sets,
                  scaling: wod.scaling as import('./_lib/validation').ScalingTier[] | null,
```

(c) Render scaling for athletes — immediately after the WOD description `</pre>` and before its closing `</div>` (the `<pre>` rendering `{wod.description}`):
```tsx
                  </pre>
                  {((wod.scaling ?? []) as import('./_lib/validation').ScalingTier[]).length > 0 && (
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {((wod.scaling ?? []) as import('./_lib/validation').ScalingTier[]).map((t, i) => (
                        <div key={i}>
                          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</span>
                          <div style={{ fontFamily: 'var(--font-geist-mono)', fontSize: 13.5, color: 'rgba(250,250,250,0.8)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{t.description}</div>
                        </div>
                      ))}
                    </div>
                  )}
```

- [ ] **Step 2: Day editor — select, prefill, action fields**

In `src/app/dashboard/programming/day/[date]/page.tsx`:

(a) Import `ScalingTier`:
```ts
import type { StrengthSet, ScalingTier } from '@/app/dashboard/wod/_lib/validation'
```

(b) Add `scaling` to the `WodRow` type (optional, since templates lack it):
```ts
  strength_lift: string | null; strength_sets: StrengthSet[] | null
  scaling?: ScalingTier[] | null
```

(c) Add `scaling` to the workout `.select(...)` (the first query, NOT the templates query):
```ts
      .select('title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets, scaling')
```

(d) Add `scaling` to `existing`:
```ts
    strength_lift: source.strength_lift, strength_sets: source.strength_sets, scaling: source.scaling ?? null,
```

(e) Add `scaling` to `actionFields`:
```ts
    strengthLift: workout.strength_lift, strengthSets: workout.strength_sets, scaling: (workout as { scaling?: ScalingTier[] | null }).scaling ?? null,
```

- [ ] **Step 3: `copyWodToDates` — carry scaling**

In `src/app/dashboard/programming/_actions/copy-wod-to-dates.ts`:

(a) Import `ScalingTier` (it already imports `StrengthSet` from the wod validation):
```ts
import { validateStrengthPrescription, type StrengthSet, type ScalingTier } from '@/app/dashboard/wod/_lib/validation'
```
(Adjust to match the file's existing import path/style for `StrengthSet`.)

(b) Add `scaling` to the `WodFields` type:
```ts
  strengthSets?: StrengthSet[] | null
  scaling?: ScalingTier[] | null
```

(c) Add `scaling` to the copied `workouts` row (in the `rows`/`clean.map`, after `strength_sets: ...,`):
```ts
    scaling: fields.scaling ?? null,
```

- [ ] **Step 4: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → succeeds. `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/wod/page.tsx "src/app/dashboard/programming/day/[date]/page.tsx" src/app/dashboard/programming/_actions/copy-wod-to-dates.ts
git commit -m "$(cat <<'EOF'
feat(wod): scaling on the WOD page + day editor prefill + copy-to-dates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Whiteboard + TV render

**Files:** Modify `src/app/dashboard/whiteboard/page.tsx`, `src/app/tv/[token]/page.tsx`. No new tests (display; verified by build + type-check).

- [ ] **Step 1: Whiteboard**

In `src/app/dashboard/whiteboard/page.tsx`:

(a) Add `scaling` to the today's-WOD query (the `.from('workouts').select('strength_lift, strength_sets')`):
```ts
    .select('strength_lift, strength_sets, title, scaling')
```
(Keep any columns already selected; just append `scaling` — if the query already selects more, add `, scaling`.)

(b) Render scaling near the strength banner (inside the body `<div style={{ flex: 1, padding: '32px 36px' }}>`, after the strength banner block):
```tsx
        {((wod?.scaling ?? []) as import('@/app/dashboard/wod/_lib/validation').ScalingTier[]).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
            {((wod?.scaling ?? []) as import('@/app/dashboard/wod/_lib/validation').ScalingTier[]).map((t, i) => (
              <div key={i} style={{ flex: '1 1 240px', padding: '12px 16px', borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 14, color: 'var(--c-ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{t.description}</div>
              </div>
            ))}
          </div>
        )}
```
(The whiteboard's `wod` query currently selects only `strength_lift, strength_sets`; after adding `scaling` (and `title` is optional), `wod.scaling` is available. If `wod` is typed without `scaling`, the `as` cast above covers the access.)

- [ ] **Step 2: TV board**

In `src/app/tv/[token]/page.tsx`:

(a) Add `scaling` to the WOD select (`.select('id, title, description, scoring_type, strength_lift, strength_sets')`):
```ts
    .select('id, title, description, scoring_type, strength_lift, strength_sets, scaling')
```

(b) Render scaling inside the WOD block, after the strength line (and before the block's closing `</div>`):
```tsx
            {((wod.scaling ?? []) as { label: string; description: string }[]).length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {((wod.scaling ?? []) as { label: string; description: string }[]).map((t, i) => (
                  <div key={i} style={{ flex: '1 1 260px' }}>
                    <div className="mono" style={{ fontSize: 13, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</div>
                    <div style={{ fontSize: 18, color: 'var(--c-ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.4, marginTop: 2 }}>{t.description}</div>
                  </div>
                ))}
              </div>
            )}
```

- [ ] **Step 3: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → succeeds (whiteboard + `/tv/[token]` build). `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/whiteboard/page.tsx "src/app/tv/[token]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(wod): show scaling tiers on the whiteboard + TV board

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green
- [ ] `npm run build` → succeeds
- [ ] Dispatch a final code reviewer over the whole branch, then use `superpowers:finishing-a-development-branch`.

## Notes

- **Manual deploy step (user only):** run `migrations/029_workout_scaling.sql` in Supabase. Until then `saveWod` writing `scaling` and the read sites error on the missing column. (2nd pending migration alongside 028.)
- **No scoring/leaderboard/constraint change.** Scaling is descriptive; the `rx` flag and one-WOD-per-day model are untouched.
- Templates / batch import / AI parser do NOT set `scaling` (out of scope); loading a template yields no tiers (the coach adds them per day).
