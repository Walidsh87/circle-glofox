-- migrations/027_wod_pr.sql
-- WOD/benchmark PR detection (#12). Flags a score that beat the athlete's prior
-- best on the same benchmark + same Rx bracket. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE workout_scores
  ADD COLUMN IF NOT EXISTS is_pr boolean NOT NULL DEFAULT false;
