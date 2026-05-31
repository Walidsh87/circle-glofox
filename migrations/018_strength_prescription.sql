-- migrations/018_strength_prescription.sql
-- Run in Supabase SQL Editor.
-- Adds the structured percentage prescription that powers "the Wedge".
-- Additive and idempotent: existing WODs keep working (both columns nullable).

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS strength_lift text,
  ADD COLUMN IF NOT EXISTS strength_sets jsonb;

-- strength_lift: canonical lift value (e.g. 'back_squat') or NULL when the WOD
--   has no percentage prescription.
-- strength_sets: jsonb array of lines, each { "sets": int, "reps": int, "percentage": int }.
--   Example: [{"sets":5,"reps":3,"percentage":80}]
