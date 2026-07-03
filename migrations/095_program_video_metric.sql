-- migrations/095_program_video_metric.sql — program UX upgrade: per-exercise demo
-- video + coach-chosen logging metric + cardio set-log fields.
--
-- video_url: optional per-exercise demo link. Display precedence in the app is
--   exercise.video_url ?? movement_videos[lift_name] (mig 085 library stays the
--   catalog-lift fallback; this column covers custom movements + overrides).
-- metric: how the athlete logs this exercise — 'load' (weight×reps, the default,
--   matches all existing rows), 'time' (duration_seconds), 'distance'
--   (distance_meters), 'calories' (calories). The log form renders exactly the
--   matching input; program_set_logs gains the three cardio columns (nullable —
--   existing weight/reps rows are untouched).
--
-- No RLS change: all columns ride the existing row policies. program_exercises /
-- program_set_logs have plain table grants (column-level allowlists exist only on
-- boxes/profiles/bookings — migs 089/090/093), so new columns are readable without
-- a GRANT sweep.
--
-- Run in the Supabase SQL Editor. Idempotent. Reversible (see ROLLBACKS.md).

ALTER TABLE program_exercises ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE program_exercises DROP CONSTRAINT IF EXISTS program_exercises_video_url_check;
ALTER TABLE program_exercises ADD CONSTRAINT program_exercises_video_url_check
  CHECK (video_url IS NULL OR (video_url LIKE 'https://%' AND length(video_url) <= 300));

ALTER TABLE program_exercises ADD COLUMN IF NOT EXISTS metric TEXT NOT NULL DEFAULT 'load';
ALTER TABLE program_exercises DROP CONSTRAINT IF EXISTS program_exercises_metric_check;
ALTER TABLE program_exercises ADD CONSTRAINT program_exercises_metric_check
  CHECK (metric IN ('load','time','distance','calories'));

ALTER TABLE program_set_logs ADD COLUMN IF NOT EXISTS duration_seconds INT
  CHECK (duration_seconds IS NULL OR duration_seconds > 0);
ALTER TABLE program_set_logs ADD COLUMN IF NOT EXISTS distance_meters INT
  CHECK (distance_meters IS NULL OR distance_meters > 0);
ALTER TABLE program_set_logs ADD COLUMN IF NOT EXISTS calories INT
  CHECK (calories IS NULL OR calories > 0);
