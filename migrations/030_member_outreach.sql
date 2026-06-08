-- migrations/030_member_outreach.sql
-- Outreach log for the retention / at-risk reach-out workflow (#18). One row per
-- contact; the latest per athlete drives the 14-day snooze. Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS member_outreach (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contacted_at  timestamptz NOT NULL DEFAULT now(),
  contacted_by  uuid REFERENCES profiles(id),
  note          text
);

ALTER TABLE member_outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_manage_outreach ON member_outreach;
CREATE POLICY staff_manage_outreach ON member_outreach
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

CREATE INDEX IF NOT EXISTS idx_member_outreach_box ON member_outreach (box_id, athlete_id, contacted_at DESC);
