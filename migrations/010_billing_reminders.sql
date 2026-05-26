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

CREATE POLICY billing_reminders_owner_read ON billing_reminders
  FOR SELECT USING (auth_role() = 'owner' AND auth_box_id() = box_id);

ALTER TABLE boxes ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT true;
