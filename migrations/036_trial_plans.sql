-- migrations/036_trial_plans.sql
-- Trial passes / intro offers (#32): a trial is a plan-catalog type with a duration.
-- Assigning a trial plan creates a time-limited membership (end_date computed). Idempotent.
ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS is_trial   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_days integer CHECK (trial_days IS NULL OR trial_days > 0);

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS is_trial   boolean NOT NULL DEFAULT false;
