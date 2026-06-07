# Auto-PR Detection (Lift PRs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when an athlete logs a new lift 1RM that beats their previous best, celebrate it on save, mark it on their progression chart, and broadcast it to the box-wide activity feed.

**Architecture:** A pure `detectPr()` decides PR-ness; `saveLift` reads the previous 1RM, flags the new `athlete_lifts_history` row with `is_pr`, and returns PR info for the form. The feed merges its existing scores query with a new `is_pr`-rows query via a pure `mergeTimeline()`. An RLS policy exposes only `is_pr = true` rows box-wide. Migration 025 adds the `is_pr` + `created_at` columns and the policy.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase RLS client, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-07-auto-pr-detection-design.md`.

**Conventions reused (read once):**
- Action gate/return + write shape: `src/app/dashboard/lifts/_actions/save-lift.ts` (the file being modified), `src/app/dashboard/wod/_actions/log-score.ts`.
- Tests live FLAT in `src/__tests__/`. Integration harness: `src/__tests__/copy-wod-to-dates.integration.test.ts`. Pure-fn harness: `src/__tests__/programming-calendar.test.ts`. Shared mock: `src/__tests__/helpers/supabase-mock.ts` (has `.eq/.in/.upsert/.insert/.maybeSingle/.single`, same builder per table via `.builder(table)`).
- Feed + lifts surfaces: `src/app/dashboard/feed/page.tsx`, `src/app/dashboard/lifts/page.tsx`, `src/app/dashboard/lifts/_components/lift-chart.tsx`, `lift-form.tsx`.

**Run:** all tests `npm test` · single file `npm test -- <name>` · type-check `npm run type-check` · lint `npm run lint` · build `npm run build`. Husky runs `eslint --fix --max-warnings=0` on commit — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `migrations/025_lift_pr.sql` | create | `is_pr` + `created_at` columns + box-read-PR RLS policy |
| `migrations/ROLLBACKS.md` | modify | add `### 025_lift_pr` reverse procedure |
| `src/app/dashboard/lifts/_lib/pr.ts` | create, pure | `detectPr(prev, new)` |
| `src/__tests__/lift-pr.test.ts` | create | `detectPr` unit tests |
| `src/app/dashboard/lifts/_actions/save-lift.ts` | modify | read prev, detect, flag history, return `pr` |
| `src/__tests__/save-lift.integration.test.ts` | create | detection + flag + return |
| `src/app/dashboard/lifts/_components/lift-form.tsx` | modify | celebration on PR |
| `src/app/dashboard/lifts/page.tsx` | modify | `is_pr` in history query + table 🏆 |
| `src/app/dashboard/lifts/_components/lift-chart.tsx` | modify | highlight PR points |
| `src/app/dashboard/feed/_lib/merge-feed.ts` | create, pure | `mergeTimeline(scores, prs, limit)` |
| `src/__tests__/merge-feed.test.ts` | create | `mergeTimeline` unit tests |
| `src/app/dashboard/feed/page.tsx` | modify | PR query + merge + PR rendering |

---

## Task 1: Migration 025 + rollback

**Files:**
- Create: `migrations/025_lift_pr.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Write the migration**

Create `migrations/025_lift_pr.sql`:

```sql
-- migrations/025_lift_pr.sql
-- Auto-PR detection for lifts (v2 Tier 2 #12). Flags PR rows in the lift
-- history and lets box members read ONLY those rows (for the activity feed).
-- `athlete_lifts_history` is an out-of-band table (created for #23/#25); this
-- ALTERs it. Run in Supabase SQL Editor. Idempotent.

ALTER TABLE athlete_lifts_history
  ADD COLUMN IF NOT EXISTS is_pr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Box members may read ONLY PR rows of other members; full history stays
-- private to the athlete (existing own-rows policy remains, OR'd with this).
DROP POLICY IF EXISTS box_read_lift_prs ON athlete_lifts_history;
CREATE POLICY box_read_lift_prs ON athlete_lifts_history
  FOR SELECT
  USING (box_id = auth_box_id() AND is_pr = true);

-- No backfill: existing rows keep is_pr = false, so the feed is not flooded
-- with historical lifts; only new saves get flagged.
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, change the header range `008`–`024` to `008`–`025`:

Find: `Reverse procedures for migrations `008`–`024``
Replace with: `Reverse procedures for migrations `008`–`025``

Then add this entry immediately above the `### 024_workout_templates` heading:

```markdown
### 025_lift_pr

```sql
DROP POLICY IF EXISTS box_read_lift_prs ON athlete_lifts_history;
ALTER TABLE athlete_lifts_history
  DROP COLUMN IF EXISTS is_pr,
  DROP COLUMN IF EXISTS created_at;
```

```

- [ ] **Step 3: Commit**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add migrations/025_lift_pr.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(lifts): migration 025 — is_pr flag + box-read-PR policy on lift history

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure `detectPr`

**Files:**
- Create: `src/app/dashboard/lifts/_lib/pr.ts`
- Test: `src/__tests__/lift-pr.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lift-pr.test.ts`:

```ts
import { detectPr } from '@/app/dashboard/lifts/_lib/pr'

describe('detectPr', () => {
  test('first-ever entry (null previous) is a baseline, not a PR', () => {
    expect(detectPr(null, 100000)).toEqual({ isPr: false, deltaGrams: 0 })
  })

  test('a higher value is a PR with the positive delta', () => {
    expect(detectPr(140000, 142500)).toEqual({ isPr: true, deltaGrams: 2500 })
  })

  test('an equal value is not a PR', () => {
    expect(detectPr(140000, 140000)).toEqual({ isPr: false, deltaGrams: 0 })
  })

  test('a lower value is not a PR', () => {
    expect(detectPr(140000, 135000)).toEqual({ isPr: false, deltaGrams: 0 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lift-pr`
Expected: FAIL — module `pr.ts` does not exist.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/lifts/_lib/pr.ts`:

```ts
export type PrResult = { isPr: boolean; deltaGrams: number }

// previousGrams === null means first-ever entry for this lift → baseline, not a PR.
export function detectPr(previousGrams: number | null, newGrams: number): PrResult {
  if (previousGrams === null) return { isPr: false, deltaGrams: 0 }
  if (newGrams > previousGrams) return { isPr: true, deltaGrams: newGrams - previousGrams }
  return { isPr: false, deltaGrams: 0 }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lift-pr`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/lifts/_lib/pr.ts src/__tests__/lift-pr.test.ts
git commit -m "$(cat <<'EOF'
feat(lifts): pure detectPr — new max beats previous best

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `saveLift` detection hook + form celebration

The action's return type and the form that consumes it are type-coupled, so they ship together (otherwise type-check is red between tasks).

**Files:**
- Modify: `src/app/dashboard/lifts/_actions/save-lift.ts`
- Modify: `src/app/dashboard/lifts/_components/lift-form.tsx`
- Test: `src/__tests__/save-lift.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `src/__tests__/save-lift.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveLift } from '@/app/dashboard/lifts/_actions/save-lift'

function fd(liftName: string, weightKg: string) {
  const f = new FormData()
  f.set('liftName', liftName)
  f.set('weightKg', weightKg)
  return f
}

function mockWith(prevGrams: number | null) {
  return makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { box_id: 'b1' }, error: null },
      athlete_lifts: { data: prevGrams === null ? null : { one_rm_grams: prevGrams }, error: null },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

test('flags a PR and returns the delta when the new max beats the previous', async () => {
  const rls = mockWith(140000)
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('back_squat', '142.5'))
  expect(res.error).toBeNull()
  expect(res.pr).toEqual({ liftName: 'back_squat', newKg: 142.5, prevKg: 140, deltaKg: 2.5 })
  const hist = rls.builder('athlete_lifts_history').insert.mock.calls[0][0]
  expect(hist).toEqual(expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', lift_name: 'back_squat', one_rm_grams: 142500, is_pr: true }))
})

test('no PR when the new value equals the previous', async () => {
  const rls = mockWith(140000)
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('back_squat', '140'))
  expect(res.pr).toBeNull()
  expect(rls.builder('athlete_lifts_history').insert.mock.calls[0][0].is_pr).toBe(false)
})

test('no PR when the new value is lower than the previous', async () => {
  const rls = mockWith(140000)
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('back_squat', '135'))
  expect(res.pr).toBeNull()
  expect(rls.builder('athlete_lifts_history').insert.mock.calls[0][0].is_pr).toBe(false)
})

test('first-ever entry for a lift is a baseline, not a PR', async () => {
  const rls = mockWith(null)
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('deadlift', '100'))
  expect(res.pr).toBeNull()
  expect(rls.builder('athlete_lifts_history').insert.mock.calls[0][0].is_pr).toBe(false)
})

test('validation error returns pr: null and never touches the database', async () => {
  const rls = makeSupabaseMock({ user: { id: 'a1' }, results: {} })
  serverCreate.mockResolvedValue(rls)
  const res = await saveLift({ error: null, pr: null }, fd('', '100'))
  expect(res).toEqual({ error: 'Select a lift and enter a valid weight.', pr: null })
  expect(rls.builder('athlete_lifts')).toBeUndefined()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- save-lift.integration`
Expected: FAIL — `saveLift` does not yet read the previous lift, return `pr`, or set `is_pr` (current return type has no `pr`).

- [ ] **Step 3: Implement the hook**

Replace the entire contents of `src/app/dashboard/lifts/_actions/save-lift.ts` with:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateLiftInput } from '../_lib/validation'
import { detectPr } from '../_lib/pr'

export type PrInfo = { liftName: string; newKg: number; prevKg: number; deltaKg: number }
type State = { error: string | null; pr: PrInfo | null }

export async function saveLift(prevState: State, formData: FormData): Promise<State> {
  const liftName = formData.get('liftName') as string
  const weightKg = parseFloat(formData.get('weightKg') as string)

  const validationError = validateLiftInput(liftName, weightKg)
  if (validationError) return { error: validationError, pr: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', pr: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.', pr: null }

  // PR check: compare the new max against the athlete's current 1RM for this lift.
  const { data: prev } = await supabase
    .from('athlete_lifts')
    .select('one_rm_grams')
    .eq('athlete_id', user.id)
    .eq('lift_name', liftName)
    .maybeSingle()

  const newGrams = Math.round(weightKg * 1000)
  const previousGrams = prev ? prev.one_rm_grams : null
  const { isPr, deltaGrams } = detectPr(previousGrams, newGrams)
  const recordedOn = new Date().toISOString().slice(0, 10)

  // Current 1RM upsert — unchanged behavior (overwrites, even if the new value
  // is lower than the current; that pre-existing behavior is intentionally kept).
  const { error } = await supabase.from('athlete_lifts').upsert(
    {
      box_id: profile.box_id,
      athlete_id: user.id,
      lift_name: liftName,
      one_rm_grams: newGrams,
      recorded_on: recordedOn,
    },
    { onConflict: 'athlete_id,lift_name' }
  )

  if (error) return { error: error.message, pr: null }

  await supabase.from('athlete_lifts_history').insert({
    box_id: profile.box_id,
    athlete_id: user.id,
    lift_name: liftName,
    one_rm_grams: newGrams,
    recorded_on: recordedOn,
    is_pr: isPr,
  })

  revalidatePath('/dashboard/lifts')
  revalidatePath('/dashboard/feed')
  return {
    error: null,
    pr: isPr ? { liftName, newKg: newGrams / 1000, prevKg: (previousGrams as number) / 1000, deltaKg: deltaGrams / 1000 } : null,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- save-lift.integration`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Update the form to the new return type + celebrate a PR**

Changing `saveLift`'s `State` to require `pr` makes `lift-form.tsx`'s old `{ error: null }` initial state a type error, so the form is updated here in the same task.

In `src/app/dashboard/lifts/_components/lift-form.tsx`:

(a) Update the import to also bring in `PrInfo`:
```tsx
import { saveLift, type PrInfo } from '../_actions/save-lift'
```

(b) Add a label helper after the imports, before `inputStyle` (`LIFT_NAMES` is already imported in this file):
```tsx
function prLabel(pr: PrInfo): string {
  return LIFT_NAMES.find((l) => l.value === pr.liftName)?.label ?? pr.liftName
}
```

(c) Change the `useFormState` initial state (line ~39) from `{ error: null }` to `{ error: null, pr: null }`:
```tsx
  const [state, formAction] = useFormState(saveLift, { error: null, pr: null })
```

(d) In the submit row, replace this block:
```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SubmitButton />
        {state.error && (
          <span style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</span>
        )}
      </div>
```
with:
```tsx
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SubmitButton />
        {state.error && (
          <span style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</span>
        )}
        {state.pr && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>
            🏆 {prLabel(state.pr)} PR! {state.pr.newKg}kg — +{state.pr.deltaKg}kg over your previous best
          </span>
        )}
      </div>
```

- [ ] **Step 6: Type-check and commit**

Run: `npm run type-check` → 0 errors (the action + form are now consistent).
Run: `npm test` → all green.

```bash
git add src/app/dashboard/lifts/_actions/save-lift.ts src/__tests__/save-lift.integration.test.ts src/app/dashboard/lifts/_components/lift-form.tsx
git commit -m "$(cat <<'EOF'
feat(lifts): saveLift detects PRs + form celebration on a new max

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Athlete surfaces — chart + table badge

**Files:**
- Modify: `src/app/dashboard/lifts/_components/lift-chart.tsx`
- Modify: `src/app/dashboard/lifts/page.tsx`

- [ ] **Step 1: Highlight PR points on the chart**

In `src/app/dashboard/lifts/_components/lift-chart.tsx`:

(a) Extend the `Entry` type (line 3):
```tsx
type Entry = { recorded_on: string; one_rm_grams: number; is_pr: boolean }
```

(b) Carry `is_pr` into each point (replace the `points` map, lines ~18-23):
```tsx
  const points = sorted.map((e, i) => {
    const x = PAD + (i / (sorted.length - 1)) * (W - PAD * 2)
    const kg = e.one_rm_grams / 1000
    const y = PAD + (1 - (kg - minKg) / range) * (H - PAD * 2)
    return { x, y, kg, date: e.recorded_on, isPr: e.is_pr }
  })
```

(c) Render PR points distinctly (replace the `points.map` circle block, lines ~52-57):
```tsx
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.isPr ? 4 : 3}
            fill={p.isPr ? 'var(--circle-lime-ink)' : (improved ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)')}
            stroke={p.isPr ? 'var(--c-surface)' : 'none'}
            strokeWidth={p.isPr ? 1.5 : 0}
            aria-label={`${p.date} — ${p.kg.toFixed(1)} kg${p.isPr ? ' (PR)' : ''}`}
          />
        ))}
```

- [ ] **Step 2: Add `is_pr` to the history query + a 🏆 on the current-1RM row**

In `src/app/dashboard/lifts/page.tsx`:

(a) Add `is_pr` to the history select and order by `created_at` so the latest entry is unambiguous (replace lines ~32-36):
```tsx
  const { data: liftHistory } = await supabase
    .from('athlete_lifts_history')
    .select('lift_name, one_rm_grams, recorded_on, is_pr')
    .eq('athlete_id', user.id)
    .order('created_at')
```

(b) Carry `is_pr` into `historyByLift` (replace the reduce body, lines ~38-45):
```tsx
  const historyByLift = (liftHistory ?? []).reduce<Record<string, { recorded_on: string; one_rm_grams: number; is_pr: boolean }[]>>(
    (acc, row) => {
      if (!acc[row.lift_name]) acc[row.lift_name] = []
      acc[row.lift_name].push({ recorded_on: row.recorded_on, one_rm_grams: row.one_rm_grams, is_pr: row.is_pr })
      return acc
    },
    {}
  )
```

(c) Add a 🏆 to the lift-name cell when the latest history entry is a PR (replace the lift-name `<td>`, lines ~91-93):
```tsx
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--c-ink)' }}>
                            {LIFT_NAMES.find((l) => l.value === lift.lift_name)?.label ?? lift.lift_name}
                            {historyByLift[lift.lift_name]?.at(-1)?.is_pr && (
                              <span title="Current 1RM is a personal record" style={{ marginLeft: 6 }}>🏆</span>
                            )}
                          </td>
```

- [ ] **Step 3: Type-check, lint, build**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 warnings.
Run: `npm run build` → succeeds.

- [ ] **Step 4: Run the full suite and commit**

Run: `npm test` → all green.

```bash
git add src/app/dashboard/lifts/_components/lift-chart.tsx src/app/dashboard/lifts/page.tsx
git commit -m "$(cat <<'EOF'
feat(lifts): PR markers on the progression chart and 1RM table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Activity feed — merge PRs into the timeline

**Files:**
- Create: `src/app/dashboard/feed/_lib/merge-feed.ts`
- Test: `src/__tests__/merge-feed.test.ts`
- Modify: `src/app/dashboard/feed/page.tsx`

- [ ] **Step 1: Write the failing merge tests**

Create `src/__tests__/merge-feed.test.ts`:

```ts
import { mergeTimeline, type FeedItem } from '@/app/dashboard/feed/_lib/merge-feed'

const score = (id: string, at: string): FeedItem => ({
  kind: 'score', id, at, athleteId: 'x', athleteName: 'X',
  wodTitle: 'Fran', scoringType: 'time', scoreValue: 222, rx: true,
})
const pr = (id: string, at: string): FeedItem => ({
  kind: 'pr', id, at, athleteId: 'y', athleteName: 'Y', liftName: 'back_squat', kg: 142.5,
})

describe('mergeTimeline', () => {
  test('interleaves scores and PRs by timestamp, newest first', () => {
    const items = mergeTimeline(
      [score('s1', '2026-06-05T10:00:00Z'), score('s2', '2026-06-07T10:00:00Z')],
      [pr('p1', '2026-06-06T10:00:00Z')],
    )
    expect(items.map((i) => i.id)).toEqual(['s2', 'p1', 's1'])
  })

  test('respects the limit', () => {
    const items = mergeTimeline(
      [score('s1', '2026-06-01T00:00:00Z'), score('s2', '2026-06-02T00:00:00Z')],
      [pr('p1', '2026-06-03T00:00:00Z')],
      2,
    )
    expect(items.map((i) => i.id)).toEqual(['p1', 's2'])
  })

  test('handles empty inputs', () => {
    expect(mergeTimeline([], [])).toEqual([])
    expect(mergeTimeline([score('s1', '2026-06-01T00:00:00Z')], [])).toHaveLength(1)
    expect(mergeTimeline([], [pr('p1', '2026-06-01T00:00:00Z')])).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- merge-feed`
Expected: FAIL — module `merge-feed.ts` does not exist.

- [ ] **Step 3: Implement the pure merge**

Create `src/app/dashboard/feed/_lib/merge-feed.ts`:

```ts
export type ScoreItem = {
  kind: 'score'
  id: string
  at: string // ISO timestamp (logged_at)
  athleteId: string
  athleteName: string
  wodTitle: string
  scoringType: string
  scoreValue: number
  rx: boolean
}

export type PrItem = {
  kind: 'pr'
  id: string
  at: string // ISO timestamp (created_at)
  athleteId: string
  athleteName: string
  liftName: string
  kg: number
}

export type FeedItem = ScoreItem | PrItem

// ISO timestamps sort correctly as strings. Newest first.
export function mergeTimeline(scores: FeedItem[], prs: FeedItem[], limit = 30): FeedItem[] {
  return [...scores, ...prs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- merge-feed`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Wire the feed page**

Replace the entire contents of `src/app/dashboard/feed/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { FistBumpButton } from './_components/fist-bump-button'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import { mergeTimeline, type FeedItem, type ScoreItem, type PrItem } from './_lib/merge-feed'

function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function liftLabel(value: string): string {
  return LIFT_NAMES.find((l) => l.value === value)?.label ?? value
}

export default async function FeedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: scores } = await supabase
    .from('workout_scores')
    .select('id, score_value, rx, logged_at, athlete_id, profiles(full_name), workouts(title, scoring_type)')
    .eq('box_id', profile.box_id)
    .order('logged_at', { ascending: false })
    .limit(30)

  const { data: prs } = await supabase
    .from('athlete_lifts_history')
    .select('id, lift_name, one_rm_grams, created_at, athlete_id, profiles(full_name)')
    .eq('box_id', profile.box_id)
    .eq('is_pr', true)
    .order('created_at', { ascending: false })
    .limit(30)

  const { data: reactions } = await supabase
    .from('score_reactions')
    .select('score_id, athlete_id')
    .eq('box_id', profile.box_id)

  const reactionsByScore = (reactions ?? []).reduce<Record<string, { count: number; reacted: boolean }>>((acc, r) => {
    if (!acc[r.score_id]) acc[r.score_id] = { count: 0, reacted: false }
    acc[r.score_id].count++
    if (r.athlete_id === user.id) acc[r.score_id].reacted = true
    return acc
  }, {})

  const scoreItems: FeedItem[] = (scores ?? []).map((s): ScoreItem => {
    const athlete = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
    const wod = Array.isArray(s.workouts) ? s.workouts[0] : s.workouts
    return {
      kind: 'score', id: s.id, at: s.logged_at,
      athleteId: s.athlete_id, athleteName: athlete?.full_name ?? 'Athlete',
      wodTitle: wod?.title ?? 'WOD', scoringType: wod?.scoring_type ?? '',
      scoreValue: s.score_value, rx: s.rx,
    }
  })

  const prItems: FeedItem[] = (prs ?? []).map((p): PrItem => {
    const athlete = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
    return {
      kind: 'pr', id: p.id, at: p.created_at,
      athleteId: p.athlete_id, athleteName: athlete?.full_name ?? 'Athlete',
      liftName: p.lift_name, kg: p.one_rm_grams / 1000,
    }
  })

  const items = mergeTimeline(scoreItems, prItems)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="feed" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Activity Feed
          </h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.length > 0 ? items.map((item) => (
              item.kind === 'pr'
                ? <PrCard key={`pr-${item.id}`} item={item} isSelf={item.athleteId === user.id} />
                : <ScoreCard key={`score-${item.id}`} item={item} isSelf={item.athleteId === user.id} reaction={reactionsByScore[item.id] ?? { count: 0, reacted: false }} />
            )) : (
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, padding: '48px 24px', textAlign: 'center',
                color: 'var(--c-ink-muted)', fontSize: 13,
              }}>
                No activity yet. Log a WOD result or hit a lift PR to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Avatar({ name, isSelf }: { name: string; isSelf: boolean }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: isSelf ? 'var(--circle-lime)' : 'var(--c-surface-alt)',
      color: isSelf ? 'var(--circle-ink)' : 'var(--c-ink-2)',
      display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13,
    }}>
      {initials(name)}
    </div>
  )
}

function ScoreCard({ item, isSelf, reaction }: { item: ScoreItem; isSelf: boolean; reaction: { count: number; reacted: boolean } }) {
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--c-shadow-sm)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <Avatar name={item.athleteName} isSelf={isSelf} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{item.athleteName}</span>
          <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>{item.wodTitle}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>{formatDate(item.at)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-ink)' }}>
            {formatScore(item.scoreValue, item.scoringType)}
          </span>
          {item.rx && (
            <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>RX</span>
          )}
        </div>
      </div>
      <FistBumpButton scoreId={item.id} initialCount={reaction.count} initialReacted={reaction.reacted} />
    </div>
  )
}

function PrCard({ item, isSelf }: { item: PrItem; isSelf: boolean }) {
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--circle-lime)',
      borderRadius: 14, padding: '16px 18px', boxShadow: 'var(--c-shadow-sm)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <Avatar name={item.athleteName} isSelf={isSelf} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{item.athleteName}</span>
          <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>🏆 {liftLabel(item.liftName)} PR</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>{formatDate(item.at)}</span>
        </div>
        <div style={{ marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>{item.kg} kg</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 warnings.
Run: `npm run build` → succeeds.
Run: `npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/feed/_lib/merge-feed.ts src/__tests__/merge-feed.test.ts src/app/dashboard/feed/page.tsx
git commit -m "$(cat <<'EOF'
feat(feed): merge lift PRs into the activity timeline (display-only)

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

- **Manual deploy step (user only):** run `migrations/025_lift_pr.sql` in the Supabase SQL Editor (prod). Until then, `saveLift` will fail to write `is_pr`/the feed query will error (column missing). The migration is the one prerequisite for this feature going live.
- **Privacy:** only `is_pr = true` rows of `athlete_lifts_history` become box-readable (RLS policy `box_read_lift_prs`). Current 1RMs and non-PR history stay athlete-private.
- **`saveLift` overwrite-on-lower** behavior is intentionally unchanged.
