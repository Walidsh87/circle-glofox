-- migrations/029_workout_scaling.sql
-- Scaling tiers (Rx/Scaled/Beginner…) for a day's WOD (#17, scaling-variations scope).
-- JSONB array of { label, description }. NULL/[] = no tiers. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS scaling jsonb;
