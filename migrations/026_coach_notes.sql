-- migrations/026_coach_notes.sql
-- Per-member, staff-only scaling/coaching note for the coach prep view (#13).
-- One standing note per athlete; owners/coaches manage it, athletes never see it.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS athlete_coach_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note        text NOT NULL,
  updated_by  uuid REFERENCES profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, athlete_id)
);

ALTER TABLE athlete_coach_notes ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage their gym's notes. No athlete policy → RLS denies
-- athlete reads by default (staff-only).
DROP POLICY IF EXISTS staff_manage_coach_notes ON athlete_coach_notes;
CREATE POLICY staff_manage_coach_notes ON athlete_coach_notes
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

CREATE INDEX IF NOT EXISTS idx_coach_notes_box ON athlete_coach_notes (box_id, athlete_id);
