-- migrations/097_bar_speed.sql
-- Bar Speed (camera VBT, mobile): append-only per-SET velocity results logged by the athlete
-- from the phone after an on-device analysis (plan 2026-07-06). Mirrors the athlete_skill_bests
-- shape (mig 094): athlete self-manages own rows, staff read box-wide, no staff write.
--   * Summary metrics are denormalized columns (history/trend charts are set-level queries);
--     per-rep detail lives in reps JSONB [{mcv_mm_s, peak_mm_s, rom_mm, dur_ms}] and is only
--     read on the set-detail screen. Bar-path traces are display-only on device — never stored.
--   * Units: integers per the house grams rule — velocities in mm/s, load in grams.
--   * capture JSONB is a schema-free debugging aid (achieved fps, quality gate outcome,
--     app version); never rendered to members.
--
-- Run in the Supabase SQL Editor. Idempotent. Reversible (see migrations/ROLLBACKS.md).

CREATE TABLE IF NOT EXISTS athlete_bar_speed_sets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id            UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lift_name         TEXT NOT NULL CHECK (char_length(lift_name) <= 40),
  load_grams        INTEGER NOT NULL CHECK (load_grams > 0 AND load_grams <= 500000),
  rep_count         INTEGER NOT NULL CHECK (rep_count >= 1 AND rep_count <= 100),
  -- mm/s sanity caps: 10 m/s is far above any human barbell velocity.
  best_mcv_mm_s     INTEGER NOT NULL CHECK (best_mcv_mm_s > 0 AND best_mcv_mm_s <= 10000),
  mean_mcv_mm_s     INTEGER NOT NULL CHECK (mean_mcv_mm_s > 0 AND mean_mcv_mm_s <= 10000),
  peak_v_mm_s       INTEGER NOT NULL CHECK (peak_v_mm_s > 0 AND peak_v_mm_s <= 10000),
  velocity_loss_pct SMALLINT NOT NULL CHECK (velocity_loss_pct >= 0 AND velocity_loss_pct <= 100),
  reps              JSONB NOT NULL CHECK (jsonb_typeof(reps) = 'array'),
  capture           JSONB CHECK (capture IS NULL OR jsonb_typeof(capture) = 'object'),
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE athlete_bar_speed_sets ENABLE ROW LEVEL SECURITY;

-- Athlete manages their OWN log (insert/read; delete kept for typo/garbage-capture fixes).
-- House self-manage shape (bests_self_manage, mig 094).
DROP POLICY IF EXISTS bar_speed_self_manage ON athlete_bar_speed_sets;
CREATE POLICY bar_speed_self_manage ON athlete_bar_speed_sets
  FOR ALL
  USING (athlete_id = auth.uid() AND box_id = auth_box_id())
  WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

-- All staff read box-wide (coach/prep surfaces later; must not silent-empty for any staff tier).
-- No staff write — velocity sets are athlete-owned.
DROP POLICY IF EXISTS bar_speed_staff_read ON athlete_bar_speed_sets;
CREATE POLICY bar_speed_staff_read ON athlete_bar_speed_sets
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

-- History chart per lift + velocity-at-load over time both filter by athlete+lift, order by time.
CREATE INDEX IF NOT EXISTS idx_bar_speed_athlete_lift
  ON athlete_bar_speed_sets (box_id, athlete_id, lift_name, logged_at);

-- ---- PROBES ----
--   SELECT policyname, cmd FROM pg_policies WHERE tablename='athlete_bar_speed_sets';
--     -- expect: bar_speed_self_manage | ALL  ·  bar_speed_staff_read | SELECT
--   SELECT relrowsecurity FROM pg_class WHERE relname='athlete_bar_speed_sets';  -- t
--   SELECT indexname FROM pg_indexes WHERE tablename='athlete_bar_speed_sets';
--     -- expect: athlete_bar_speed_sets_pkey · idx_bar_speed_athlete_lift
