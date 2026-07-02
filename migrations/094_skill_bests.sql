-- migrations/094_skill_bests.sql
-- Skill bests redesign (#36 rework, spec 2026-07-03): belts are OUT everywhere, replaced by a
-- self-logged numeric skill-bests log (mirrors the athlete_lifts 1RM pattern).
--   * NEW athlete_skill_bests — append-only history; value semantics per catalog measure
--     (src/lib/skill-bests.ts): reps | grams (weight) | meters (distance) | seconds (time).
--     Current best = MAX per skill_key (MIN for time) — computed at read time, never stored.
--   * member_goals: goal_type 'skill_belt' → 'skill_best' (CHECK re-pinned; 081 hard-coded the
--     old list, so without this every new skill_best insert would 23514). Existing skill_belt
--     rows are DELETED (user-approved data loss — belts have no numeric equivalent).
--   * DROP skill_levels (the belt table, mig 040) — user-approved data loss.
--
-- ⚠️ DEPLOY ORDER: merge + deploy the web code FIRST (it removes every skill_levels reader and
-- adds the bests surfaces), THEN apply this migration immediately after. Until 094 lands the new
-- bests card shows a fetch error (minutes-long window, acceptable at pilot scale).
-- ⚠️ MOBILE: the circle-mobile companion (skill-bests card + goals rework) must be MERGED before
-- applying this — the old mobile bundle reads skill_levels inside its Goals-card Promise.all
-- (dropping the table error-states the WHOLE goals card, not just skills) and still creates
-- skill_belt goals (23514 under the re-pinned CHECK). Distribution is Expo dev (no store
-- binaries), so merged-to-main = live on next bundle load.
--
-- Run in the Supabase SQL Editor. Idempotent. New table is reversible; the DROP TABLE and the
-- skill_belt DELETE are forward-only (see migrations/ROLLBACKS.md).

-- 1) Self-logged bests. value is a per-measure integer (reps / grams / meters / seconds); the
--    app validates the tight per-measure range — the CHECK here is a generous DB-level sanity
--    cap across all measures (grams is the widest legitimate unit).
CREATE TABLE IF NOT EXISTS athlete_skill_bests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_key  TEXT NOT NULL CHECK (char_length(skill_key) <= 40),
  value      INTEGER NOT NULL CHECK (value > 0 AND value <= 43200000),
  logged_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE athlete_skill_bests ENABLE ROW LEVEL SECURITY;

-- Athlete manages their OWN log (insert/read; delete kept for typo fixes — the v1 UI is
-- append-only and ships no delete). House self-manage shape (member_goals_athlete_own, mig 081).
DROP POLICY IF EXISTS bests_self_manage ON athlete_skill_bests;
CREATE POLICY bests_self_manage ON athlete_skill_bests
  FOR ALL
  USING (athlete_id = auth.uid() AND box_id = auth_box_id())
  WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

-- All staff read box-wide (goal progress on the member profile must not silent-empty for
-- any staff tier). No staff write — bests are athlete-owned.
DROP POLICY IF EXISTS bests_staff_read ON athlete_skill_bests;
CREATE POLICY bests_staff_read ON athlete_skill_bests
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

CREATE INDEX IF NOT EXISTS idx_skill_bests_athlete ON athlete_skill_bests (box_id, athlete_id, skill_key);

-- 2) member_goals: delete belt goals FIRST (they'd violate the re-pinned CHECK), then swap
--    'skill_belt' → 'skill_best' in the goal_type constraint (inline CHECK from mig 081).
DELETE FROM member_goals WHERE goal_type = 'skill_belt';

ALTER TABLE member_goals DROP CONSTRAINT IF EXISTS member_goals_goal_type_check;
ALTER TABLE member_goals ADD CONSTRAINT member_goals_goal_type_check
  CHECK (goal_type IN ('lift_1rm','skill_best','attendance','custom'));

-- 3) The belt table dies with the feature.
DROP TABLE IF EXISTS skill_levels;

-- ---- PROBES ----
--   SELECT policyname, cmd FROM pg_policies WHERE tablename='athlete_skill_bests';
--     -- expect: bests_self_manage | ALL  ·  bests_staff_read | SELECT
--   SELECT relrowsecurity FROM pg_class WHERE relname='athlete_skill_bests';  -- t
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='member_goals'::regclass AND conname='member_goals_goal_type_check';
--     -- expect: ... 'skill_best' ... (no 'skill_belt')
--   SELECT to_regclass('skill_levels');  -- NULL
