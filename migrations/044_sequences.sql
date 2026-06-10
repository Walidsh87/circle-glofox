-- migrations/044_sequences.sql
-- Automated sequences (#44): multi-step email drips on top of #37 triggers.
-- A sequence = trigger + ordered jsonb steps; enrollments + sends are stateful.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS sequences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  trigger_type text NOT NULL,            -- 'joined' | 'trial_ending' | 'no_checkin' | 'birthday'
  trigger_days integer,                  -- N days; NULL for 'birthday'
  steps        jsonb NOT NULL,           -- [{ offset_days:int, subject:text, body_blocks:jsonb[] }]
  enabled      boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sequences_box ON sequences (box_id, created_at DESC);

ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sequences_owner_all ON sequences;
CREATE POLICY sequences_owner_all ON sequences
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_on date NOT NULL,
  enroll_key  text NOT NULL,
  status      text NOT NULL DEFAULT 'active',   -- 'active' | 'completed' | 'exited'
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, athlete_id, enroll_key)
);
CREATE INDEX IF NOT EXISTS idx_seq_enrollments_active ON sequence_enrollments (sequence_id, status);

ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seq_enrollments_owner_read ON sequence_enrollments;
CREATE POLICY seq_enrollments_owner_read ON sequence_enrollments
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS sequence_sends (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  step_index    integer NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  resend_id     text,
  UNIQUE (enrollment_id, step_index)
);
CREATE INDEX IF NOT EXISTS idx_seq_sends_enrollment ON sequence_sends (enrollment_id);

ALTER TABLE sequence_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seq_sends_owner_read ON sequence_sends;
CREATE POLICY seq_sends_owner_read ON sequence_sends
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');
