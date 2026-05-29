-- Smart dunning + failed-card recovery
-- Run this in Supabase SQL Editor

-- Per-box dunning policy
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS max_payment_retries INT NOT NULL DEFAULT 3;

-- Per-membership dunning state
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS failed_charge_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_dunning_email_at TIMESTAMPTZ;

-- Index for "memberships in dunning" filter on payments page
CREATE INDEX IF NOT EXISTS idx_memberships_dunning
  ON memberships(box_id)
  WHERE failed_charge_attempts > 0;
