# Auto-PR Detection (Lift PRs) — Design

**Date:** 2026-06-07
**Feature:** Automatically detect when an athlete logs a new lift 1RM that beats their previous best, celebrate it to the athlete, mark it on their progression chart, and broadcast it to the box-wide activity feed.
**Roadmap:** v2 Tier 2 #12 (auto-PR detection), scoped to **lift PRs only**. WOD/benchmark PRs are a separate, fuzzier problem (title-matching across snapshot days) — deferred.

---

## Problem

Logging a new 1RM is a milestone, but today it is silent: `saveLift` overwrites the current 1RM and appends to history with no notion of whether it was a personal record. Athletes get no recognition and coaches have no visibility into who is progressing.

## Why lifts (not WODs)

Lift data is perfectly structured for PR detection: `athlete_lifts` holds one current 1RM per `(athlete_id, lift_name)`, and `athlete_lifts_history` already records every save. A new max is unambiguously a PR — `new > previous`. WOD scores, by contrast, are tied to a specific `workout_id` (one date) with no shared identity across repeats of the same benchmark; detecting "you beat your Fran" needs fuzzy title-matching and scoring-direction logic. Out of scope here.

## Scope decisions (locked during brainstorming)

1. **Lift PRs only.** WOD/benchmark PRs deferred.
2. **Surfaces = all three:** immediate athlete celebration on save, a persistent PR marker on the athlete's own progression chart, and a box-wide entry in the activity feed.
3. **Visibility = box-wide social feed.** PR rows (including the weight) are visible to all box members and coaches in `/dashboard/feed`. Non-PR history and current 1RMs stay private to the athlete.
4. **PRs are display-only in the feed (v1)** — not fist-bumpable. Reactions key on `score_id`; generalizing them to PRs is a follow-on.

## Approach (chosen: A)

An `is_pr` flag on `athlete_lifts_history` (set at save time by a pure detector), plus a feed that merges its existing scores query with a new PR-rows query. Reuses existing tables; no generic event table. Privacy is preserved by construction: an RLS policy exposes **only `is_pr = true` rows** box-wide.

Rejected: **B** a generic `activity_events` table (more work for a single event type — would still have to union events+scores; revisit when a 2nd event type lands); **C** compute PRs on-read (expensive for the feed, and requires exposing all history box-wide, breaking privacy).

---

## 1. Data model — migration `025_lift_pr.sql`

`athlete_lifts_history` is an out-of-band table (created directly in Supabase for #23/#25, not in `schema.sql` or any migration). Its assumed columns: `id, box_id, athlete_id, lift_name, one_rm_grams, recorded_on (date)`, with RLS enabled and an own-rows policy. Migration 025:

```sql
-- Add PR flag + an orderable timestamp (recorded_on is date-only; the feed
-- interleaves PRs with scores by time).
ALTER TABLE athlete_lifts_history
  ADD COLUMN IF NOT EXISTS is_pr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Box members may read ONLY PR rows of other members (full history stays private).
-- Additive/permissive — OR'd with the existing own-rows policy.
DROP POLICY IF EXISTS box_read_lift_prs ON athlete_lifts_history;
CREATE POLICY box_read_lift_prs ON athlete_lifts_history
  FOR SELECT
  USING (box_id = auth_box_id() AND is_pr = true);
```

- **No backfill.** Existing rows keep `is_pr = false`, so the feed is not flooded with historical lifts; only new saves get flagged. (`created_at` for existing rows defaults to ALTER-time `now()`, which is fine — those rows are `is_pr = false` and never surface in the feed.)
- **Manual deploy step (user only): run `025_lift_pr.sql` in the Supabase SQL Editor (prod)** before the feature goes live — `saveLift` writes `is_pr` and the feed reads it.

## 2. Detection rule — pure `src/app/dashboard/lifts/_lib/pr.ts`

```ts
export type PrResult = { isPr: boolean; deltaGrams: number }

// previousGrams === null means first-ever entry for this lift → baseline, not a PR.
export function detectPr(previousGrams: number | null, newGrams: number): PrResult {
  if (previousGrams === null) return { isPr: false, deltaGrams: 0 }
  if (newGrams > previousGrams) return { isPr: true, deltaGrams: newGrams - previousGrams }
  return { isPr: false, deltaGrams: 0 }
}
```

Pure, unit-tested: first entry (null) → not PR; higher → PR with delta; equal → not PR; lower → not PR.

## 3. Detection hook — `src/app/dashboard/lifts/_actions/save-lift.ts`

Modify `saveLift`:
- Change the return type to `{ error: string | null; pr: PrInfo | null }` where `PrInfo = { liftName: string; newKg: number; prevKg: number; deltaKg: number }`.
- After resolving the profile and BEFORE the `athlete_lifts` upsert, read the previous current 1RM:
  ```ts
  const { data: prev } = await supabase
    .from('athlete_lifts')
    .select('one_rm_grams')
    .eq('athlete_id', user.id)
    .eq('lift_name', liftName)
    .maybeSingle()
  const newGrams = Math.round(weightKg * 1000)
  const { isPr, deltaGrams } = detectPr(prev ? prev.one_rm_grams : null, newGrams)
  ```
- The `athlete_lifts` upsert stays **unchanged** (still overwrites current with the new value, even when lower — pre-existing behavior, not touched).
- The `athlete_lifts_history` insert now carries `is_pr: isPr` (and `created_at` defaults to `now()`).
- Return:
  ```ts
  return {
    error: null,
    pr: isPr
      ? { liftName, newKg: newGrams / 1000, prevKg: (prev!.one_rm_grams) / 1000, deltaKg: deltaGrams / 1000 }
      : null,
  }
  ```
- All early-return error paths must include `pr: null` to satisfy the new return type.

## 4. Surface 1 — athlete celebration (`lifts/_components/lift-form.tsx`)

- `useFormState(saveLift, { error: null, pr: null })`; State type extended to `{ error: string | null; pr: PrInfo | null }` (import `PrInfo` from the action).
- On a PR (`state.pr`), render a celebratory line near the submit button: `🏆 New PR! {newKg}kg — +{deltaKg}kg over your previous best`, lime accent. The lift label comes from `LIFT_NAMES` (already imported in the lifts module).
- The existing success behavior (`formRef.reset()` on `!state.error`) is preserved. A non-PR save shows nothing extra (current behavior).

## 5. Surface 2 — athlete chart/table badge (`lifts/page.tsx` + `lifts/_components/lift-chart.tsx`)

- `lifts/page.tsx`: add `is_pr` to the `athlete_lifts_history` select; carry it into `historyByLift` entries (`{ recorded_on, one_rm_grams, is_pr }`).
- `lift-chart.tsx`: the `entries` prop type gains `is_pr: boolean`; PR points are drawn with a distinct marker (filled lime star/dot) vs normal points. Non-PR points render as today.
- `lifts/page.tsx` current-1RM table: show a small `🏆` next to a lift when its most-recent history entry `is_pr` is true (i.e. the current 1RM is itself a PR).

## 6. Surface 3 — activity feed (`feed/page.tsx` + pure `feed/_lib/merge-feed.ts`)

- New query in `feed/page.tsx` (RLS now permits box read of PR rows):
  ```ts
  const { data: prs } = await supabase
    .from('athlete_lifts_history')
    .select('id, lift_name, one_rm_grams, created_at, athlete_id, profiles(full_name)')
    .eq('box_id', profile.box_id)
    .eq('is_pr', true)
    .order('created_at', { ascending: false })
    .limit(30)
  ```
- Pure merge in `feed/_lib/merge-feed.ts`:
  ```ts
  export type FeedItem =
    | { kind: 'score'; id: string; at: string; /* score fields */ }
    | { kind: 'pr';    id: string; at: string; athleteName: string; liftName: string; kg: number; athleteId: string }

  export function mergeTimeline(scores: FeedItem[], prs: FeedItem[], limit = 30): FeedItem[]
  ```
  Concatenate, sort by `at` descending, slice to `limit`. Unit-tested (interleaving by timestamp, limit, empty inputs). The page maps each raw row into a `FeedItem` (score → `at = logged_at`, PR → `at = created_at`) before calling `mergeTimeline`.
- Render: PR items show the athlete avatar (lime if self), `🏆 {name} — {Lift} PR`, the weight `{kg} kg` in mono, and a subtle lime accent border. **No fist-bump button** on PR items (display-only v1). Score items render exactly as today, including `FistBumpButton`.

## 7. Privacy

Only `is_pr = true` rows of `athlete_lifts_history` become box-readable (RLS). The PR's lift name + weight are shown box-wide (approved). Current 1RMs (`athlete_lifts`) and non-PR history remain athlete-private — unchanged.

## 8. Out of scope (YAGNI)

- WOD/benchmark PRs (separate spec; needs title-matching + scoring direction).
- Fist-bump / reactions on PRs (display-only v1).
- Backfilling historical `athlete_lifts_history` rows as PRs.
- Changing `saveLift`'s overwrite-on-lower behavior.
- A generic `activity_events` table (Approach B; revisit when a 2nd event type arrives).
- Push notifications / emails.

## 9. Testing

- **Pure `detectPr`** (`pr.test.ts`): first-entry/null → not PR; higher → PR + delta; equal → not PR; lower → not PR.
- **Pure `mergeTimeline`** (`merge-feed.test.ts`): interleave score+PR by `at` desc; respects `limit`; handles empty scores, empty PRs, both empty.
- **`saveLift` integration** (`save-lift.integration.test.ts`): PR path (new > previous → history insert has `is_pr: true`, returns `pr` with correct delta); non-PR path (new ≤ previous → `is_pr: false`, `pr: null`); first-entry (no previous row → `is_pr: false`, `pr: null`); box-scoping (`athlete_lifts`/history writes carry `box_id`); validation error path returns `pr: null`.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/025_lift_pr.sql` | create | `is_pr` + `created_at` columns + box-read-PR RLS policy |
| `src/app/dashboard/lifts/_lib/pr.ts` | create, pure | `detectPr(prev, new)` |
| `src/app/dashboard/lifts/_actions/save-lift.ts` | modify | read prev, detect, flag history, return `pr` |
| `src/app/dashboard/lifts/_components/lift-form.tsx` | modify | celebration on PR |
| `src/app/dashboard/lifts/page.tsx` | modify | `is_pr` in history query + table 🏆 |
| `src/app/dashboard/lifts/_components/lift-chart.tsx` | modify | highlight PR points |
| `src/app/dashboard/feed/_lib/merge-feed.ts` | create, pure | `mergeTimeline(scores, prs, limit)` |
| `src/app/dashboard/feed/page.tsx` | modify | PR query + merge + PR rendering |
| `src/__tests__/lift-pr.test.ts` | create | `detectPr` unit tests |
| `src/__tests__/merge-feed.test.ts` | create | `mergeTimeline` unit tests |
| `src/__tests__/save-lift.integration.test.ts` | create | detection + flag + return |

ROLLBACKS.md: add a `### 025_lift_pr` entry (`ALTER TABLE athlete_lifts_history DROP COLUMN is_pr, DROP COLUMN created_at; DROP POLICY box_read_lift_prs ON athlete_lifts_history;`).
