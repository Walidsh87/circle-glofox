-- migrations/043_automations.sql
-- Automation builder (#37): single-step lifecycle rules (trigger → send email),
-- evaluated by a daily cron, with a per-occurrence idempotency ledger.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS automations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  trigger_type text NOT NULL,            -- 'no_checkin' | 'joined' | 'trial_ending' | 'birthday'
  trigger_days integer,                  -- N days; NULL for 'birthday'
  subject      text NOT NULL,
  body_blocks  jsonb NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automations_box ON automations (box_id, created_at DESC);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automations_owner_all ON automations;
CREATE POLICY automations_owner_all ON automations
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS automation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  athlete_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fire_key      text NOT NULL,
  resend_id     text,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, athlete_id, fire_key)
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs (automation_id);

ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_runs_owner_read ON automation_runs;
CREATE POLICY automation_runs_owner_read ON automation_runs
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');
