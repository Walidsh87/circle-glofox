# Committed Club / Consistency Gamification — Design

**Date:** 2026-06-08
**Feature:** Recognize attendance consistency — a weekly-streak + lifetime-milestone system surfaced on the member page, a Committed Club leaderboard, the activity feed, and the live whiteboard.
**Roadmap:** v2 Tier 3 #20 (last Tier 3 wedge).

---

## Problem

The gym has rich attendance data (`bookings.checked_in`) but nothing that recognizes or motivates consistency. Two-Brain's "Committed Club" turns showing-up into something members can see, chase, and be celebrated for. This adds a streak + milestone system across four surfaces, all driven by one shared computation.

## Scope decisions (locked during brainstorming)

1. **Both mechanics** — a *committed-week streak* AND lifetime *check-in milestones*.
2. **Four surfaces** — member page card, Committed Club leaderboard, activity-feed posts, whiteboard streak badge.
3. **Approach A (hybrid)** — display surfaces compute live from checked-in bookings; a thin `member_achievements` table records each crossing once, purely to drive idempotent feed posts.
4. **Leaderboard visible to all members** of the box (same audience as the feed).
5. **Calibration:** committed week = ≥3 check-ins in a Monday-start week; streak = consecutive committed weeks (current in-progress week is grace); milestones = 25/50/100/250/500/1000; streak landmarks (feed-worthy) = 4/8/12/26/52 weeks.

## Approach (chosen: A — hybrid)

One pure module (`src/lib/consistency.ts`) computes streak + total + badges from a list of check-in dates. Member page, leaderboard, and whiteboard call it live (always correct, no staleness). A `member_achievements` table (migration 032) records milestone/streak crossings the **first time they happen**, written best-effort inside the existing check-in actions; the feed reads from it. Display badges are computed live, so the table is a pure feed event-log — milestones award only on *exact* crossing, so pre-launch attendance never floods the feed.

Rejected: **B** denormalize streak/total onto profiles (more write paths, staleness, leaderboard reads stale); **C** no table (feed posts can't dedupe / have no earned-at — fails the feed surface).

---

## 1. Pure core — `src/lib/consistency.ts`

Operates on `dates: string[]` (`'YYYY-MM-DD'`, gym timezone) for ONE athlete.

```ts
export const WEEK_TARGET = 3
export const MILESTONES = [25, 50, 100, 250, 500, 1000]
export const STREAK_LANDMARKS = [4, 8, 12, 26, 52]

// Monday-start integer week index (adjacency only; no ISO-year label needed).
export function weekIndex(date: string): number
// Per-week check-in counts keyed by weekIndex.
export function weeklyCounts(dates: string[]): Map<number, number>
// Consecutive committed weeks. Current in-progress week counts only if already met;
// if not met it's "grace" and does not break the streak.
export function currentStreakWeeks(dates: string[], today: string, target?: number): number
export function totalCheckins(dates: string[]): number               // = dates.length
export function currentMilestone(total: number): number | null       // highest reached (live badge)
export function nextMilestone(total: number): { threshold: number; remaining: number } | null
export function crossedMilestone(newTotal: number): number | null    // newTotal iff exactly a threshold
export function reachedStreakLandmark(streak: number): number | null // streak iff exactly a landmark
```

`weekIndex(date)` = `Math.floor((floor(ms/86400000) + 3) / 7)` (the `+3` shifts the Thursday epoch to Monday-start weeks). Streak walk: from `weekIndex(today)`, count it if committed; whether or not the current week is committed, step to the previous week and count consecutive committed weeks. Pure, no I/O, exhaustively unit-tested.

## 2. Migration 032 — `member_achievements.sql`

```sql
CREATE TABLE IF NOT EXISTS member_achievements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('milestone','streak')),
  threshold   integer NOT NULL,
  earned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, kind, threshold)
);
ALTER TABLE member_achievements ENABLE ROW LEVEL SECURITY;
-- Box members read (feed shows these to everyone, like scores/PRs).
CREATE POLICY box_read_achievements ON member_achievements
  FOR SELECT USING (box_id = auth_box_id());
-- No INSERT/UPDATE/DELETE policy: written via service role at check-in only.
CREATE INDEX idx_member_achievements_box ON member_achievements (box_id, earned_at);
```

+ ROLLBACKS entry. **Manual deploy step (user only): run `032_member_achievements.sql` in Supabase.**

## 3. Award at check-in — `_award.ts` helper

`awardConsistency(service, boxId, athleteId, today)`:
1. Load the athlete's checked-in booking dates (box-scoped) via the service client (joined `class_instances(starts_at)`; each date = `starts_at.slice(0,10)` — the UTC date; Gulf classes never cross midnight UTC, so no per-row tz conversion is needed). This is the single date convention used everywhere (`_award`, leaderboard, member card, whiteboard).
2. `total = totalCheckins(dates)`; `streak = currentStreakWeeks(dates, today)`.
3. If `crossedMilestone(total)` → insert `{kind:'milestone', threshold}`. If `reachedStreakLandmark(streak)` → insert `{kind:'streak', threshold}`. UNIQUE dedups re-climbs; ignore `23505`.
4. The whole helper is wrapped in try/catch by the caller — **it must never fail the check-in**.

Called at the tail of both `checkIn` and `overrideCheckIn` (after the `bookings` update succeeds), best-effort. Both already hold a service client + `profile.box_id`. `today` from the box timezone.

Because the milestone awards only when `total` lands *exactly* on a threshold (this check-in added exactly one), no historical backfill spam: pre-launch members only start earning feed posts on their next genuine crossing.

## 4. Feed integration — `merge-feed.ts` + `feed/page.tsx`

Add to the union:
```ts
export type AchievementItem = {
  kind: 'achievement'; id: string; at: string; athleteId: string; athleteName: string
  achievementKind: 'milestone' | 'streak'; threshold: number
}
export type FeedItem = ScoreItem | PrItem | AchievementItem
```
Generalize `mergeTimeline` to merge a third array (still newest-first by `at`, same `limit`). Feed page loads `member_achievements` (box-scoped, joined `profiles(full_name)`) → maps to `AchievementItem` → renders "🏅 {name} joined the {threshold} Club" (milestone) / "🔥 {name} hit a {threshold}-week streak" (streak).

## 5. Committed Club leaderboard — `committed-club/page.tsx`

New page at `/dashboard/committed-club`, visible to **all logged-in members** of the box. Loads one box-wide query of checked-in bookings (`athlete_id, class_instances(starts_at)`, joined `profiles(full_name)`), groups dates by athlete, computes `currentStreakWeeks` + `totalCheckins` + `currentMilestone` each, ranks by **streak desc, then total desc**, renders rows (🔥 streak · badge · total). Sidebar nav "Committed Club" for everyone — add a new `trophy` icon to the icon map (`flame` is already taken by Daily WOD).

## 6. Member page card + whiteboard badge

- **Member page** (`/dashboard/members/[memberId]`): a "Consistency" card — current streak (🔥N weeks), total check-ins, current badge, and next-milestone progress (`nextMilestone`). Computed from that member's checked-in dates (the page already loads the member; add the attendance query). This card is also each athlete's own profile (the `/dashboard/profile` redirect).
- **Whiteboard** (`whiteboard/page.tsx`): a small 🔥N badge next to a rostered athlete's name when streak > 0. Add one box-wide checked-in-bookings query for the page's `athleteIds`, group → `currentStreakWeeks` per athlete → badge in the booking row render.

## 7. Testing

- **`consistency.test.ts`** (pure, heavy): `weekIndex` adjacency (same week vs Monday boundary); `weeklyCounts`; `currentStreakWeeks` — clean streak, grace (current week below target doesn't break), a gap breaks it, target boundary (exactly 3 counts, 2 doesn't); `totalCheckins`; `currentMilestone`/`nextMilestone` at/below/above thresholds; `crossedMilestone` exact-only; `reachedStreakLandmark` exact-only.
- **`merge-feed` test**: achievement items sort/merge with scores+PRs by `at`.
- **`check-in-award.integration.test.ts`**: `checkIn` on an exact crossing inserts the achievement (assert insert args); a throwing `awardConsistency` still returns `{ error: null }` from `checkIn`; no crossing → no insert.

## 8. Out of scope (YAGNI)

Points/levels/XP · configurable per-gym weekly target (hardcode 3) · badge-icon library · push/email on achievement · redeemable rewards · backfilling pre-launch milestones into the feed · streak freezes/vacations · per-class-type streaks.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `src/lib/consistency.ts` | create, pure | streak/milestone computation |
| `src/__tests__/consistency.test.ts` | create | unit tests |
| `migrations/032_member_achievements.sql` | create | feed event-log table + RLS |
| `migrations/ROLLBACKS.md` | modify | `### 032_member_achievements` |
| `src/app/dashboard/whiteboard/_actions/_award.ts` | create | `awardConsistency` helper |
| `src/app/dashboard/whiteboard/_actions/check-in.ts` | modify | award tail |
| `src/app/dashboard/whiteboard/_actions/override-check-in.ts` | modify | award tail |
| `src/__tests__/check-in-award.integration.test.ts` | create | award integration |
| `src/app/dashboard/feed/_lib/merge-feed.ts` | modify | `AchievementItem` + merge |
| `src/__tests__/merge-feed.test.ts` | modify | achievement ordering |
| `src/app/dashboard/feed/page.tsx` | modify | load + render achievements |
| `src/app/dashboard/committed-club/page.tsx` | create | leaderboard (all members) |
| `src/app/dashboard/members/[memberId]/page.tsx` | modify | consistency card |
| `src/app/dashboard/whiteboard/page.tsx` | modify | streak badge |
| `src/components/sidebar.tsx` | modify | "Committed Club" nav + icon |

**One migration (032).** Reuses `bookings.checked_in`, the feed/merge pattern, the check-in actions, and dashboard tokens.
