-- migrations/010_billing_reminders.sql
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS billing_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  stage         TEXT NOT NULL CHECK (stage IN ('pre','due','overdue')),
  due_date      DATE NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  email         TEXT NOT NULL,
  resend_id     TEXT,
  UNIQUE (membership_id, stage, due_date)
);

ALTER TABLE billing_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_reminders_owner_read ON billing_reminders;
CREATE POLICY billing_reminders_owner_read ON billing_reminders
  FOR SELECT USING (auth_role() = 'owner' AND auth_box_id() = box_id);

ALTER TABLE boxes ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT true;

-- Helper RPC for the daily cron route
CREATE OR REPLACE FUNCTION cron_eligible_memberships(p_today DATE)
RETURNS TABLE (
  id UUID,
  box_id UUID,
  start_date DATE,
  last_paid_date DATE,
  end_date DATE,
  monthly_price_aed NUMERIC,
  athlete_full_name TEXT,
  athlete_email TEXT,
  gym_name TEXT,
  reminders_enabled BOOLEAN,
  owner_email TEXT
) LANGUAGE sql SECURITY DEFINER AS $func$
  SELECT
    m.id, m.box_id, m.start_date, m.last_paid_date, m.end_date, m.monthly_price_aed,
    a.full_name, a.email,
    b.name, b.reminders_enabled,
    (SELECT o.email FROM profiles o WHERE o.box_id = m.box_id AND o.role = 'owner' LIMIT 1)
  FROM memberships m
  JOIN profiles a ON a.id = m.athlete_id
  JOIN boxes    b ON b.id = m.box_id
  WHERE b.reminders_enabled = true
    AND (m.end_date IS NULL OR m.end_date >= p_today)
$func$;
