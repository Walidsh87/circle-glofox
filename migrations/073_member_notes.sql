-- migrations/073_member_notes.sql
-- Member notes (#92 + #105): per-member, staff-only, categorized interaction log
-- (call/visit/post-class/general). Append + delete, never member-visible.
-- Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS member_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note            text NOT NULL,
  note_type       text NOT NULL DEFAULT 'general'
                  CHECK (note_type IN ('call','visit','post_class','general')),
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT 'Staff',  -- author snapshot; survives staff deletion, no join needed
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_notes_member ON member_notes (box_id, athlete_id, created_at DESC);

ALTER TABLE member_notes ENABLE ROW LEVEL SECURITY;

-- Staff (owner/admin/coach/receptionist) read + write their gym's notes. Not member-visible.
DROP POLICY IF EXISTS member_notes_staff_all ON member_notes;
CREATE POLICY member_notes_staff_all ON member_notes
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());
