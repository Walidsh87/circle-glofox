# WOD / Benchmark PRs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag a WOD score that beats the athlete's previous best on the same benchmark (same title, same Rx bracket), celebrate it on logging, and badge it on the activity feed + the WOD leaderboard.

**Architecture:** `logScore` looks up the athlete's prior same-benchmark, same-Rx scores via one joined query and a pure `decideWodPr` decides PR-ness; the score is flagged `is_pr` on upsert and `logScore` returns PR info for the celebration. Migration 027 adds the column. Feed + leaderboard read `is_pr` → 🏆. Mirrors the lift-PR shape.

**Tech Stack:** Next.js 16 App Router (server actions, `useFormState`), Supabase RLS client, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-08-wod-benchmark-prs-design.md`.

**Conventions reused (read once):**
- Current action: `src/app/dashboard/wod/_actions/log-score.ts` (being modified). Lift-PR precedent for the detect-flag-return shape: `src/app/dashboard/lifts/_actions/save-lift.ts`.
- Tests FLAT in `src/__tests__/`. Integration harness: `src/__tests__/save-lift.integration.test.ts`. Mock: `src/__tests__/helpers/supabase-mock.ts` — returns the SAME builder per table (`.builder(table)`); awaiting a chain resolves to `results[table]`. **The mock does NOT yet have `.ilike` — Task 3 adds it.**
- Feed: `src/app/dashboard/feed/_lib/merge-feed.ts` (`ScoreItem`), `src/app/dashboard/feed/page.tsx` (score select + `scoreItems` map + `ScoreCard`). WOD page: `src/app/dashboard/wod/page.tsx:141` (scores select), `src/app/dashboard/wod/_components/score-section.tsx`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky runs `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `migrations/027_wod_pr.sql` | create | `is_pr` column on `workout_scores` |
| `migrations/ROLLBACKS.md` | modify | `### 027_wod_pr` reverse entry |
| `src/app/dashboard/wod/_lib/pr.ts` | create, pure | `decideWodPr` |
| `src/__tests__/wod-pr.test.ts` | create | `decideWodPr` unit tests |
| `src/__tests__/helpers/supabase-mock.ts` | modify (+`ilike`) | mock builder gains `.ilike` |
| `src/app/dashboard/wod/_actions/log-score.ts` | modify | prior-best lookup, flag `is_pr`, return `pr` |
| `src/__tests__/log-score.integration.test.ts` | create | hook integration tests |
| `src/app/dashboard/wod/_components/score-section.tsx` | modify | celebration + leaderboard 🏆 |
| `src/app/dashboard/wod/page.tsx` | modify (+`is_pr`) | pass `is_pr` to the leaderboard |
| `src/app/dashboard/feed/_lib/merge-feed.ts` | modify | `ScoreItem.isPr` |
| `src/app/dashboard/feed/page.tsx` | modify | select + map + render feed 🏆 |

---

## Task 1: Migration 027 + rollback

**Files:** Create `migrations/027_wod_pr.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Write the migration**

Create `migrations/027_wod_pr.sql`:

```sql
-- migrations/027_wod_pr.sql
-- WOD/benchmark PR detection (#12). Flags a score that beat the athlete's prior
-- best on the same benchmark + same Rx bracket. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE workout_scores
  ADD COLUMN IF NOT EXISTS is_pr boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, change the header range `008`–`026` to `008`–`027`. Add this entry immediately above the `### 026_coach_notes` heading:

```markdown
### 027_wod_pr
```sql
ALTER TABLE workout_scores DROP COLUMN IF EXISTS is_pr;
```

```

- [ ] **Step 3: Commit**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add migrations/027_wod_pr.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(wod): migration 027 — is_pr flag on workout_scores

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure `decideWodPr`

**Files:** Create `src/app/dashboard/wod/_lib/pr.ts`; Test `src/__tests__/wod-pr.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/wod-pr.test.ts`:

```ts
import { decideWodPr } from '@/app/dashboard/wod/_lib/pr'

describe('decideWodPr', () => {
  test('first time (no priors) is a baseline, not a PR', () => {
    expect(decideWodPr('time', 200, [])).toEqual({ isPr: false, prevBest: null })
    expect(decideWodPr('amrap', 200, [])).toEqual({ isPr: false, prevBest: null })
  })

  describe('time (lower is better)', () => {
    test('a faster time is a PR; prevBest is the min', () => {
      expect(decideWodPr('time', 210, [222, 240])).toEqual({ isPr: true, prevBest: 222 })
    })
    test('an equal time is not a PR', () => {
      expect(decideWodPr('time', 222, [222, 240])).toEqual({ isPr: false, prevBest: 222 })
    })
    test('a slower time is not a PR', () => {
      expect(decideWodPr('time', 230, [222, 240])).toEqual({ isPr: false, prevBest: 222 })
    })
  })

  describe('non-time (higher is better)', () => {
    test('more reps is a PR; prevBest is the max', () => {
      expect(decideWodPr('amrap', 150, [120, 140])).toEqual({ isPr: true, prevBest: 140 })
    })
    test('equal is not a PR', () => {
      expect(decideWodPr('rounds_reps', 140, [120, 140])).toEqual({ isPr: false, prevBest: 140 })
    })
    test('more load is a PR', () => {
      expect(decideWodPr('load_kg', 102, [100, 95])).toEqual({ isPr: true, prevBest: 100 })
    })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- wod-pr`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/wod/_lib/pr.ts`:

```ts
export type WodPrResult = { isPr: boolean; prevBest: number | null }

// priorScores = the athlete's prior scores for the SAME benchmark + SAME rx bracket,
// excluding the current workout. Empty (first time) → baseline, not a PR.
export function decideWodPr(scoringType: string, newScore: number, priorScores: number[]): WodPrResult {
  if (priorScores.length === 0) return { isPr: false, prevBest: null }
  const lowerBetter = scoringType === 'time'
  const prevBest = lowerBetter ? Math.min(...priorScores) : Math.max(...priorScores)
  const isPr = lowerBetter ? newScore < prevBest : newScore > prevBest
  return { isPr, prevBest }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- wod-pr`
Expected: PASS — all green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/wod/_lib/pr.ts src/__tests__/wod-pr.test.ts
git commit -m "$(cat <<'EOF'
feat(wod): pure decideWodPr — beat prior best by scoring direction

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `logScore` hook + WOD-page surfaces

The action's return type, the score form that consumes it, and the leaderboard all live on the WOD page and are type-coupled, so they ship together.

**Files:**
- Modify: `src/__tests__/helpers/supabase-mock.ts` (add `ilike`)
- Modify: `src/app/dashboard/wod/_actions/log-score.ts`
- Modify: `src/app/dashboard/wod/_components/score-section.tsx`
- Modify: `src/app/dashboard/wod/page.tsx`
- Test: `src/__tests__/log-score.integration.test.ts`

- [ ] **Step 1: Add `.ilike` to the shared mock**

In `src/__tests__/helpers/supabase-mock.ts`, find the builder method list:
```ts
    for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'order', 'limit', 'is', 'not', 'gte', 'gt']) {
```
Add `'ilike'` to the array:
```ts
    for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'order', 'limit', 'is', 'not', 'gte', 'gt', 'ilike']) {
```

- [ ] **Step 2: Write the failing integration tests**

Create `src/__tests__/log-score.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { logScore } from '@/app/dashboard/wod/_actions/log-score'

function fd(o: { workoutId: string; scoreValue: string; rx?: boolean; notes?: string }) {
  const f = new FormData()
  f.set('workoutId', o.workoutId)
  f.set('scoreValue', o.scoreValue)
  if (o.rx) f.set('rx', 'on')
  if (o.notes) f.set('notes', o.notes)
  return f
}

function mockWith(priors: { score_value: number; workout_id: string }[], scoringType = 'time') {
  return makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { box_id: 'b1' }, error: null },
      workouts: { data: { title: 'Fran', scoring_type: scoringType }, error: null },
      workout_scores: { data: priors, error: null },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

test('flags a PR when the new time beats the prior best in the same rx bracket', async () => {
  const rls = mockWith([{ score_value: 222, workout_id: 'w-old' }])
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w-today', scoreValue: '210', rx: true }))
  expect(res.error).toBeNull()
  expect(res.pr).toEqual({ benchmark: 'Fran', rx: true, scoringType: 'time', newScore: 210, prevBest: 222 })
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(true)
})

test('a slower time is not a PR', async () => {
  const rls = mockWith([{ score_value: 222, workout_id: 'w-old' }])
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w-today', scoreValue: '230', rx: true }))
  expect(res.pr).toBeNull()
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(false)
})

test('first time on a benchmark is not a PR', async () => {
  const rls = mockWith([])
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w1', scoreValue: '200', rx: true }))
  expect(res.pr).toBeNull()
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(false)
})

test('the current workout is excluded from its own prior-best', async () => {
  // The only "prior" row is this very workout → no genuine prior → not a PR.
  const rls = mockWith([{ score_value: 100, workout_id: 'w-today' }])
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: 'w-today', scoreValue: '90', rx: true }))
  expect(res.pr).toBeNull()
  expect(rls.builder('workout_scores').upsert.mock.calls[0][0].is_pr).toBe(false)
})

test('scopes the prior-best lookup to same rx bracket, box, athlete, and title', async () => {
  const rls = mockWith([])
  serverCreate.mockResolvedValue(rls)
  await logScore({ error: null, pr: null }, fd({ workoutId: 'w1', scoreValue: '200', rx: true }))
  const ws = rls.builder('workout_scores')
  expect(ws.eq).toHaveBeenCalledWith('rx', true)
  expect(ws.eq).toHaveBeenCalledWith('athlete_id', 'a1')
  expect(ws.eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(ws.ilike).toHaveBeenCalledWith('workouts.title', 'Fran')
})

test('validation error returns pr: null before any DB call', async () => {
  const rls = makeSupabaseMock({ user: { id: 'a1' }, results: {} })
  serverCreate.mockResolvedValue(rls)
  const res = await logScore({ error: null, pr: null }, fd({ workoutId: '', scoreValue: '200' }))
  expect(res).toEqual({ error: 'Enter a valid score.', pr: null })
  expect(rls.builder('workout_scores')).toBeUndefined()
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -- log-score.integration`
Expected: FAIL — `logScore` has no `pr`, no prior-best lookup, no `is_pr`.

- [ ] **Step 4: Implement the hook**

Replace the entire contents of `src/app/dashboard/wod/_actions/log-score.ts` with:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { decideWodPr } from '../_lib/pr'

export type WodPrInfo = { benchmark: string; rx: boolean; scoringType: string; newScore: number; prevBest: number }
type State = { error: string | null; pr: WodPrInfo | null }

// Escape ILIKE wildcards so a title is matched literally (case-insensitive).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

export async function logScore(prevState: State, formData: FormData): Promise<State> {
  const workoutId = formData.get('workoutId') as string
  const scoreValue = parseFloat(formData.get('scoreValue') as string)
  const rx = formData.get('rx') === 'on'
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!workoutId || isNaN(scoreValue) || scoreValue < 0) {
    return { error: 'Enter a valid score.', pr: null }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', pr: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.', pr: null }

  const { data: workout } = await supabase
    .from('workouts')
    .select('title, scoring_type')
    .eq('id', workoutId)
    .single()
  if (!workout) return { error: 'Workout not found.', pr: null }

  // Prior scores on the SAME benchmark (title, case-insensitive) in the SAME rx
  // bracket — one joined query (workout_scores → workouts), this workout excluded in JS.
  const { data: priors } = await supabase
    .from('workout_scores')
    .select('score_value, workout_id, workouts!inner(title)')
    .eq('box_id', profile.box_id)
    .eq('athlete_id', user.id)
    .eq('rx', rx)
    .ilike('workouts.title', escapeLike(workout.title))

  const priorScores = ((priors ?? []) as { score_value: number; workout_id: string }[])
    .filter((p) => p.workout_id !== workoutId)
    .map((p) => p.score_value)

  const { isPr, prevBest } = decideWodPr(workout.scoring_type, scoreValue, priorScores)

  const { error } = await supabase.from('workout_scores').upsert(
    {
      box_id: profile.box_id,
      workout_id: workoutId,
      athlete_id: user.id,
      score_value: scoreValue,
      rx,
      notes,
      is_pr: isPr,
    },
    { onConflict: 'workout_id,athlete_id' }
  )

  if (error) return { error: error.message, pr: null }

  revalidatePath('/dashboard/wod')
  revalidatePath('/dashboard/feed')
  return {
    error: null,
    pr: isPr
      ? { benchmark: workout.title, rx, scoringType: workout.scoring_type, newScore: scoreValue, prevBest: prevBest as number }
      : null,
  }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test -- log-score.integration`
Expected: PASS — 6 tests green. Fix the implementation (not the tests) if any fail.

- [ ] **Step 6: Wire the score form (celebration + leaderboard 🏆)**

In `src/app/dashboard/wod/_components/score-section.tsx`:

(a) Update the import:
```tsx
import { logScore, type WodPrInfo } from '../_actions/log-score'
```

(b) Add a PR-blurb helper after `formatScore` (before `inputStyle`):
```tsx
function prBlurb(pr: WodPrInfo): string {
  const bracket = pr.rx ? 'Rx' : 'Scaled'
  if (pr.scoringType === 'time') {
    return `🏆 ${bracket} ${pr.benchmark} PR! −${Math.round(pr.prevBest - pr.newScore)}s`
  }
  const unit = pr.scoringType === 'load_kg' ? 'kg' : 'reps'
  return `🏆 ${bracket} ${pr.benchmark} PR! +${pr.newScore - pr.prevBest} ${unit}`
}
```

(c) Extend the `Score` type to include `is_pr`:
```tsx
type Score = {
  athlete_id: string
  score_value: number
  rx: boolean
  is_pr: boolean
  notes: string | null
  profiles: { full_name: string } | { full_name: string }[] | null
}
```

(d) Change the `useFormState` initial state:
```tsx
  const [state, formAction] = useFormState(logScore, { error: null, pr: null })
```

(e) After the existing error `<p>` inside the form, add the celebration:
```tsx
          {state.error && (
            <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--c-danger)' }}>{state.error}</p>
          )}
          {state.pr && (
            <p style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>{prBlurb(state.pr)}</p>
          )}
```

(f) In the leaderboard row, badge a PR score. Find the score `<td>` that renders `{formatScore(s.score_value, scoringType)}` and add a 🏆 before the score span (still inside that `<td>`):
```tsx
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      {s.is_pr && <span title="PR when logged" style={{ marginRight: 6 }}>🏆</span>}
                      <span className="mono" style={{
                        fontSize: isFirst ? 17 : 15, fontWeight: 700,
                        color: isFirst ? 'var(--circle-lime-ink)' : 'var(--c-ink)',
                        letterSpacing: '-0.01em',
                      }}>
                        {formatScore(s.score_value, scoringType)}
                      </span>
                    </td>
```

- [ ] **Step 7: Add `is_pr` to the WOD page scores query**

In `src/app/dashboard/wod/page.tsx`, find the scores select (line ~141):
```tsx
        .select('athlete_id, score_value, rx, notes, profiles(full_name)')
```
Change it to include `is_pr`:
```tsx
        .select('athlete_id, score_value, rx, notes, is_pr, profiles(full_name)')
```

- [ ] **Step 8: Type-check, lint, full suite, commit**

Run: `npm run type-check` → 0 errors. `npm run lint` → 0 warnings. `npm test` → all green.

```bash
git add src/__tests__/helpers/supabase-mock.ts src/app/dashboard/wod/_actions/log-score.ts src/__tests__/log-score.integration.test.ts src/app/dashboard/wod/_components/score-section.tsx src/app/dashboard/wod/page.tsx
git commit -m "$(cat <<'EOF'
feat(wod): logScore detects benchmark PRs + celebration + leaderboard badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Feed badge

**Files:** Modify `src/app/dashboard/feed/_lib/merge-feed.ts`, `src/app/dashboard/feed/page.tsx`. No new tests (UI; verified by type-check + build).

- [ ] **Step 1: Add `isPr` to `ScoreItem`**

In `src/app/dashboard/feed/_lib/merge-feed.ts`, add `isPr` to the `ScoreItem` type:
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
  isPr: boolean
}
```

- [ ] **Step 2: Select + map + render in the feed page**

In `src/app/dashboard/feed/page.tsx`:

(a) Add `is_pr` to the scores select (line ~48):
```tsx
    .select('id, score_value, rx, is_pr, logged_at, athlete_id, profiles(full_name), workouts(title, scoring_type)')
```

(b) Set `isPr` in the `scoreItems` map (the `return { kind: 'score', ... }` object):
```tsx
    return {
      kind: 'score', id: s.id, at: s.logged_at,
      athleteId: s.athlete_id, athleteName: athlete?.full_name ?? 'Athlete',
      wodTitle: wod?.title ?? 'WOD', scoringType: wod?.scoring_type ?? '',
      scoreValue: s.score_value, rx: s.rx, isPr: s.is_pr,
    }
```

(c) In `ScoreCard`, badge a PR. Find the score row (the `<div>` containing `formatScore(item.scoreValue, item.scoringType)` and the RX chip) and add a 🏆 after the RX chip:
```tsx
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-ink)' }}>
            {formatScore(item.scoreValue, item.scoringType)}
          </span>
          {item.rx && (
            <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>RX</span>
          )}
          {item.isPr && <span title="Personal record" style={{ fontSize: 13 }}>🏆</span>}
        </div>
```

- [ ] **Step 3: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0 errors. `npm run lint` → 0 warnings. `npm run build` → succeeds. `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/feed/_lib/merge-feed.ts src/app/dashboard/feed/page.tsx
git commit -m "$(cat <<'EOF'
feat(feed): 🏆 badge on WOD-PR score entries

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

- **Manual deploy step (user only):** run `migrations/027_wod_pr.sql` in Supabase (prod). Until then `logScore` writing `is_pr` and the feed/leaderboard reading it will error on the missing column — run it before logging scores. (This is the 3rd pending migration alongside 025 + 026.)
- **`is_pr` means "was a PR when logged"** — a later better score doesn't recompute earlier flags (matches the lift-PR semantics).
- **Benchmark identity = title (case-insensitive), Rx-bracketed.** Documented fuzziness in the spec §5. `escapeLike` prevents `%`/`_` in a title from acting as wildcards.
