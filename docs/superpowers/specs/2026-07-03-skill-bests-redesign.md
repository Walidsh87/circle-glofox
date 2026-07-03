# Skill bests redesign — belts out, self-logged numeric bests in (design spec)

**Date:** 2026-07-03 · **Scope agreed with Walid** (grilling session, overnight autonomous build)
**Replaces:** #36 skill progression (belts) end-to-end. **Touches:** web + mobile.

## Decision (user rulings, verbatim intent)

1. Belts are removed **everywhere** — "I need the belt to be out everywhere. I don't want it."
2. Weightlifting leaves the skills catalog (1RM goals already cover barbell targets).
3. Gymnastics skills are tracked as **max unbroken reps**; weighted variants as **kg**; handstand walk as **meters**.
4. Engine skills are **best time for a fixed distance** (row/run/bike × distances).
5. Current value comes from a **self-logged skill-bests log** (option 1, mirrors the 1RM `athlete_lifts` pattern), not goal-embedded values.
6. Defaults Walid can veto at review: ring/bar muscle-up split; bike distances 1K/2K/5K/10K.

## Catalog (`src/lib/skill-bests.ts` web · `src/lib/skill-bests.ts` mobile — verbatim port like goals.ts)

Measure types: `reps` (higher better, integer 1..1000) · `weight` (grams, higher better, 1..300kg)
· `distance_m` (meters, higher better, 1..1000) · `time` (seconds, LOWER better, 1..7200).

| key | label | category | measure |
|---|---|---|---|
| pullup | Pull-up | Gymnastics | reps |
| toes_to_bar | Toes-to-bar | Gymnastics | reps |
| double_under | Double-under | Gymnastics | reps |
| handstand_pu | Handstand push-up | Gymnastics | reps |
| ring_muscle_up | Ring muscle-up | Gymnastics | reps |
| bar_muscle_up | Bar muscle-up | Gymnastics | reps |
| dip | Dip | Gymnastics | reps |
| weighted_pullup | Weighted pull-up | Gymnastics | weight |
| weighted_dip | Weighted dip | Gymnastics | weight |
| handstand_walk | Handstand walk | Gymnastics | distance_m |
| row_500 / row_1k / row_2k / row_5k | Row 500m/1K/2K/5K | Engine | time |
| run_400 / run_1k / run_2k / run_5k | Run 400m/1K/2K/5K | Engine | time |
| bike_1k / bike_2k / bike_5k / bike_10k | Bike 1K/2K/5K/10K | Engine | time |

Old `pullup`/`toes_to_bar`/`double_under`/`handstand_pu` keys reused where identical; `muscle_up`
splits; weightlifting + generic `row/run/bike` keys die with the belt table.

## Schema (migration 094)

```sql
CREATE TABLE athlete_skill_bests (
  id uuid PK default gen_random_uuid(),
  box_id uuid NOT NULL REFERENCES boxes ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  skill_key text NOT NULL,
  value integer NOT NULL,          -- reps | grams | meters | seconds per catalog measure
  logged_at timestamptz NOT NULL DEFAULT now()
);
-- append-only history like athlete_lifts_history; current best = MAX (or MIN for time) per key
```
RLS: enable; `bests_self_manage` (athlete inserts/reads own, `athlete_id = auth.uid() AND box_id = auth_box_id()`),
`bests_staff_read` (auth_is_staff() same box). No UPDATE policy (append-only; DELETE own allowed for typo fixes).
Index `(box_id, athlete_id, skill_key)`.

Also in 094 (forward-only, user-approved data loss):
- `DROP TABLE IF EXISTS skill_levels;`
- `DELETE FROM member_goals WHERE goal_type = 'skill_belt';`
- ROLLBACKS.md entry (new table reversible; drop/delete are not — documented as such).

FK note (memory `fks-to-profiles-need-on-delete`): athlete_id CASCADE (own data) ✅.

## Goals model change (both repos, `lib/goals.ts` kept-in-sync port)

- `GoalType`: `skill_belt` → **`skill_best`**. Columns reused: `skill_key` (existing), `target_count`
  (reps/meters/seconds), `target_grams` (weight). NO new columns → no goals migration beyond the row delete.
- `validateGoal`: `skill_best` requires a catalog key + a positive target in the measure's range
  (time entered mm:ss in UI → seconds).
- `goalProgress`: current best from ctx (`bestValue`); reps/weight/distance = current/target;
  **time inverts** — met when `current <= target`, pct = clamp(target/current) (0 when no best yet).
- Existing `skill_belt` rows are deleted by 094; composer/renderer/validation lose belts entirely.

## Surfaces

**Web (removals):** member-profile Skills editor + BeltChip + `/dashboard/skills` page + nav entry,
`setSkillLevel` action, `skills.ts` BELTS/beltRank/overallBelt. PDPL export: `skill_levels` → `athlete_skill_bests`.
**Web (additions):** `/dashboard/skill-bests` athlete page (parity with mobile: bests grid by category,
log-new-best form, self only). Goals UI (web member profile) composer swaps belt goal for skill-best goal.
**Mobile:** Progress tab `SkillsCard` (belts) → `SkillBestsCard` (bests by category + "Log a best" flow);
goals composer/renderer updated the same way. Reads/writes via direct supabase (RLS self-manage) —
mirrors `athlete_lifts` usage.

**Deferred (explicit):** feed/PR celebrations for bests, coach-entered bests, leaderboards, box-read RLS.

## Deploy order

Two-phase to avoid the window where new code reads a missing table:
1. Apply migration 094 (new table + drop + delete) — old code stops rendering belts data (skills page
   would error) → so: merge web code FIRST (removes all skill_levels readers, adds bests code tolerant
   of an empty/missing table? no — bests table must exist), THEN apply 094 immediately after deploy.
   Window: minutes; bests card shows a fetch error until 094 lands. Acceptable at pilot scale (night).
2. Mobile merges after web deploy + 094 applied.
