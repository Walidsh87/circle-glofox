# Achievements / Badges Page (#86) — Design

**Date:** 2026-06-19 · **Roadmap:** v2 #86 (Tier 10) [Kept]. **Status:** allowlist-approved (supervised loop build).

## Goal
A member-facing **"My achievements"** page: the logged-in member's earned badges — check-in **milestones** (25/50/100/250/500/1000) and **streak landmarks** (4/8/12/26/52 committed weeks) — as a card collection, plus a hint toward the next badge. Distinct from the live Committed-Club leaderboard (#20, which ranks current streak/total) — this is the personal *badge collection* of what you've earned.

## Why this shape
- The `member_achievements` table (mig 032) already records each milestone/streak crossing (service-written at check-in, one row per crossing, `UNIQUE(athlete_id,kind,threshold)`), with `box_read_achievements` RLS (any box member reads). The feed already renders these. **No migration, no RLS change.**
- `MILESTONES` + `STREAK_LANDMARKS` (and `consistency.ts`) give the badge thresholds + "next" logic — reuse them; no new constants.
- Read-only over an existing, RLS-protected table → the cleanest migration-free slice.

## Scope (YAGNI)
- New page `src/app/dashboard/achievements/page.tsx` (`requirePage` — any signed-in member; shows **their own** badges).
- Pure `src/lib/achievements.ts` — `buildAchievements(rows)` groups `member_achievements` rows into milestones + streaks (sorted by threshold), and derives `nextMilestone`/`nextStreak` (the lowest `MILESTONES`/`STREAK_LANDMARKS` value strictly above the highest earned threshold, or null if all earned). Unit-tested. Reuses `MILESTONES`/`STREAK_LANDMARKS` from `@/lib/consistency`.
- Render: two sections — **Milestones** (🏆, "N check-ins" + earned date) and **Streaks** (🔥, "N-week streak" + earned date) — as badge cards; a small "next: X check-ins / Y-week streak" hint per section; an empty state when no badges ("Keep showing up — your first badge is at 25 check-ins").
- A member-group **"Achievements"** sidebar nav entry (mirror how Skills/Committed Club are added), athlete-visible.

## Data flow
`requirePage()` → `supabase.from('member_achievements').select('kind, threshold, earned_at').eq('athlete_id', profile.id).eq('box_id', profile.box_id).order('threshold')` → `buildAchievements(rows)` → grouped badge cards. Box-scoped by **RLS** (`box_read_achievements`) **and** explicit `.eq('box_id', profile.box_id)`, **and** self-scoped `.eq('athlete_id', profile.id)`. RLS client (never service).

## Guard/RLS alignment (the CI gate requires this on the PR)
| Table | G (guard) | P (RLS policy) | G ⊆ P? |
|---|---|---|---|
| `member_achievements` | `requirePage` → owner, admin, coach, receptionist, athlete | `box_read_achievements` → owner, admin, coach, receptionist, athlete | yes (equal) |

`box_read_achievements` is `box_id = auth_box_id()` with no role filter → all box members read; `requirePage` admits any signed-in member. G = P (hard pass, no exclusion). The page additionally self-scopes `athlete_id = profile.id` so a member sees only their own badges. **NB:** the L2 behavioral gate needs a `member_achievements` seed recipe (added to `.github/scripts/verify-policy-roles-behavioral.mjs` by the controller at PR time).

## Pure-lib interface (`src/lib/achievements.ts`)
```ts
import { MILESTONES, STREAK_LANDMARKS } from '@/lib/consistency'
export type AchievementRecord = { kind: string; threshold: number; earned_at: string }
export type Badge = { threshold: number; earnedLabel: string }   // earnedLabel = YYYY-MM-DD in gym tz
export function nextAbove(values: number[], earnedMax: number): number | null  // lowest value > earnedMax, else null
export function buildAchievements(rows: AchievementRecord[], timeZone: string): {
  milestones: Badge[]; streaks: Badge[]
  nextMilestone: number | null; nextStreak: number | null
  counts: { milestones: number; streaks: number; total: number }
}
```
- `milestones` = rows with `kind==='milestone'` → Badge{threshold, earnedLabel (gym-tz date of `earned_at`)}, sorted ascending by threshold; `streaks` likewise for `kind==='streak'`.
- `nextMilestone` = `nextAbove(MILESTONES, max earned milestone threshold (0 if none))`; `nextStreak` = `nextAbove(STREAK_LANDMARKS, max earned streak threshold)`.

## Security / tenancy
- Any signed-in member, **own** badges only (self-scoped `athlete_id`); box-scoped (RLS + explicit filter); ids from session, never input. RLS client. Read-only. No migration/RLS change.

## Out of scope (deferred)
Viewing another member's badges (staff member-profile badges) · box-wide badge leaderboard (Committed Club covers ranking) · new badge types beyond the existing milestone/streak crossings · sharing/export · live progress bars needing the bookings re-query (we derive "next" from earned thresholds only).

## Testing
- Unit (`achievements.test.ts`): grouping by kind; sort ascending by threshold; `nextAbove` (lowest above max, null when all earned, null on empty values); `nextMilestone`/`nextStreak` from earned set; gym-tz `earnedLabel` (a late-UTC instant → correct gym day); empty input → empty arrays + nextMilestone=25, nextStreak=4 (first thresholds) + zero counts.
- Isolation rests on the existing `member_achievements` RLS + explicit `.eq('box_id')` + `.eq('athlete_id')`; the CI `verify-policy-roles` (with the new recipe) gate proves the role-access.
