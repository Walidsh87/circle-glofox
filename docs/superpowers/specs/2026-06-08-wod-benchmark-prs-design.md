# WOD / Benchmark PRs — Design

**Date:** 2026-06-08
**Feature:** Detect when an athlete logs a WOD score that beats their previous best on the same benchmark (same title, same Rx bracket), celebrate it on logging, and badge it on the activity feed and the WOD leaderboard.
**Roadmap:** v2 Tier 2 #12 — the WOD/benchmark half of auto-PR detection (the lift-PR half shipped 2026-06-07).

---

## Problem

Logging a benchmark score (Fran, Cindy, a repeated strength piece) is silent — there's no recognition when an athlete beats their previous time/score. The lift-PR feature already does this for 1RMs; this extends the same pattern to WOD scores, which are the daily-engagement surface.

## Why this is the "fuzzy" half

Lift 1RMs have a clean identity (`lift_name`). WOD scores are tied to a specific `workout_id` (one date) with **no shared identity across repeats** — the only link between two "Fran" days is the workout **title**. So benchmark identity is title-based and inherently fuzzy (see §5). Direction also varies: For Time → lower is better; Load/AMRAP/Rounds → higher.

## Scope decisions (locked during brainstorming)

1. **Separate Rx and Scaled PRs.** A score only competes against the athlete's prior scores in the **same `rx` bracket**. "Rx Fran PR" and "Scaled Fran PR" are distinct.
2. **Surfaces = celebration + feed + leaderboard.** Immediate celebration on logging, a 🏆 on the score's activity-feed entry, and a 🏆 on the WOD-page leaderboard row. No new pages. (Member-page badge and whiteboard explicitly out — the whiteboard doesn't render scores.)
3. **Approach A** — an `is_pr` flag on `workout_scores`, computed at log time by a pure detector, badging existing score surfaces. Mirrors the lift-PR shape.

## Approach (chosen: A)

`logScore` looks up the athlete's prior same-benchmark, same-Rx scores and a pure `decideWodPr` decides PR-ness; the score is flagged `is_pr` on upsert and `logScore` returns PR info for the celebration. Migration 027 adds the column. The feed and leaderboard read `is_pr` and render a 🏆.

Rejected: **B** a benchmark-registry table (precise identity, but needs a benchmarks table + per-workout tagging workflow — large scope; the future fix if title-match proves noisy); **C** compute-on-read (expensive per render; can't represent "was a PR when logged").

---

## 1. Detection rule — pure `src/app/dashboard/wod/_lib/pr.ts`

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

Pure, unit-tested. Direction: `time` → lower beats; everything else (`load_kg`, `amrap`, `rounds_reps`) → higher beats. Strict (ties are not PRs).

## 2. Migration `027_wod_pr.sql`

```sql
-- migrations/027_wod_pr.sql
-- WOD/benchmark PR detection (#12). Flags a score that beat the athlete's prior
-- best on the same benchmark + same Rx bracket. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE workout_scores
  ADD COLUMN IF NOT EXISTS is_pr boolean NOT NULL DEFAULT false;
```

No RLS change — `workout_scores` is already box-readable (the feed and leaderboard already read it). No backfill (existing scores keep `is_pr = false`; only new/edited scores get flagged). + ROLLBACKS entry. **Manual deploy step (user only): run `027_wod_pr.sql` in Supabase before this goes live** — `logScore` writes `is_pr` and the feed/leaderboard read it. The page degrades gracefully without it (badges just never show; logging still works once the column exists).

## 3. Hook — `src/app/dashboard/wod/_actions/log-score.ts`

The current action reads only `workout.box_id`. Change it to also read the workout's `title` and `scoring_type`, then before the upsert:

1. **Same-benchmark workouts:** query `workouts.select('id').eq('box_id', profile.box_id)` matched case-insensitively on `title` (exact, not substring — see §5 for the wildcard-escaping note), collect ids, and **exclude the current `workoutId`**.
2. **Prior scores (same Rx bracket):** if there are other ids, `workout_scores.select('score_value').eq('box_id', profile.box_id).in('workout_id', otherIds).eq('athlete_id', user.id).eq('rx', rx)` → `priorScores = rows.map(r => r.score_value)`.
3. `const { isPr, prevBest } = decideWodPr(workout.scoring_type, scoreValue, priorScores)`.
4. Upsert `workout_scores` (unchanged shape) **plus `is_pr: isPr`**, same `onConflict: 'workout_id,athlete_id'`.
5. `revalidatePath('/dashboard/wod')` (existing) + `revalidatePath('/dashboard/feed')` (new).
6. Return type changes from `{ error: string | null }` to:
   ```ts
   type State = { error: string | null; pr: WodPrInfo | null }
   export type WodPrInfo = { benchmark: string; rx: boolean; scoringType: string; newScore: number; prevBest: number }
   ```
   On a PR (and only when the upsert succeeded), `pr = { benchmark: workout.title, rx, scoringType: workout.scoring_type, newScore: scoreValue, prevBest: prevBest! }`; otherwise `pr: null`. Every early-return error path includes `pr: null`.

The existing validation (`!workoutId || isNaN(scoreValue) || scoreValue < 0`) and the workout-not-found guard are unchanged.

## 4. Surfaces

### a) Celebration — `src/app/dashboard/wod/_components/score-section.tsx`
`useFormState(logScore, { error: null, pr: null })`; State type extended with `pr: WodPrInfo | null`. On `state.pr`, render a celebratory line near the submit button: `🏆 {Rx|Scaled} {benchmark} PR! {improvement}`, where `improvement` is formatted by direction:
- `time`: `−{prevBest − newScore}s` (faster), reusing the seconds→`m:ss` idea for large deltas (a small local `formatDelta` helper; for time show `−Xs` or `−m:ss`).
- else: `+{newScore − prevBest}{unit}` (`reps` or `kg`).

The existing form behaviour (the leaderboard reflects the saved score after revalidation) is preserved.

### b) Feed badge — `src/app/dashboard/feed/page.tsx` + `src/app/dashboard/feed/_lib/merge-feed.ts`
- `ScoreItem` gains `isPr: boolean`.
- The feed's `workout_scores` select adds `is_pr`; the score→`ScoreItem` map sets `isPr: s.is_pr`.
- The score card (`ScoreCard`) renders a 🏆 next to the score when `isPr`. PR scores remain fist-bumpable (no behaviour change there).

### c) Leaderboard badge — `src/app/dashboard/wod/_components/score-section.tsx` + `src/app/dashboard/wod/page.tsx`
- The WOD page's scores select (`'athlete_id, score_value, rx, notes, profiles(full_name)'`) adds `is_pr`; `myScore` is derived from the same rows, so both get it.
- `ScoreSection`'s `Score` type gains `is_pr: boolean`; the leaderboard row shows a 🏆 (next to the RX chip) when `s.is_pr`.

## 5. Benchmark identity (documented fuzziness)

A benchmark = the workout **title**, matched **case-insensitively within the box**. Consequences, accepted for v1:
- Two unrelated workouts that happen to share a title are treated as one benchmark → possible false PRs.
- Generic reused titles ("Conditioning", "Metcon") produce noisy PRs.
- A workout whose title is never repeated simply never PRs (correct).

**Wildcard note:** `ilike` treats `%`/`_` as wildcards. The match must be exact-case-insensitive, so the implementation escapes `%` and `_` in the title before `ilike` (or normalizes/compares in JS). The plan specifies the exact query.

The benchmark-registry (Approach B) is the future upgrade if title-match proves too noisy.

## 6. Testing

- **Pure `decideWodPr`** (`wod-pr.test.ts`): empty prior → baseline (not PR); `time` — faster beats, equal not, slower not; non-time — higher beats, equal not, lower not; `prevBest` is the correct min/max.
- **`logScore` integration** (`log-score.integration.test.ts`): PR path (sets `is_pr: true`, returns `pr` with correct `prevBest`); non-PR (slower → `is_pr: false`, `pr: null`); first-time (no prior → `false`); **Rx-bracket isolation** (a Scaled prior is excluded when logging an Rx score — assert the prior-scores query filters `rx`); **title scoping** (the candidate-workouts query is box-scoped and title-matched); validation error path returns `pr: null`.

## 7. Out of scope (YAGNI)

Benchmark registry / explicit benchmark tagging · cross-bracket PRs · whiteboard badge (no score render there) · member-page score badge · partial/tiebreak scoring · recomputing other scores' `is_pr` when a new best lands (a flag means "was a PR when logged") · notifications.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/027_wod_pr.sql` | create | `is_pr` column on `workout_scores` |
| `migrations/ROLLBACKS.md` | modify | `### 027_wod_pr` reverse entry |
| `src/app/dashboard/wod/_lib/pr.ts` | create, pure | `decideWodPr` |
| `src/app/dashboard/wod/_actions/log-score.ts` | modify | prior-best lookup, flag `is_pr`, return `pr` |
| `src/app/dashboard/wod/_components/score-section.tsx` | modify | celebration + leaderboard 🏆 |
| `src/app/dashboard/wod/page.tsx` | modify (+`is_pr` select) | pass `is_pr` to the leaderboard |
| `src/app/dashboard/feed/_lib/merge-feed.ts` | modify | `ScoreItem.isPr` |
| `src/app/dashboard/feed/page.tsx` | modify | select + render feed 🏆 |
| `src/__tests__/wod-pr.test.ts` | create | `decideWodPr` unit tests |
| `src/__tests__/log-score.integration.test.ts` | create | hook integration tests |
