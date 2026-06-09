-- migrations/037_member_tags.sql
-- Member tags (#33): free-form, staff-managed labels on members. Staff-only (not member-visible).
-- Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS member_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, tag)
);

ALTER TABLE member_tags ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage + read their gym's tags. Not visible to members.
DROP POLICY IF EXISTS member_tags_staff_all ON member_tags;
CREATE POLICY member_tags_staff_all ON member_tags
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

CREATE INDEX IF NOT EXISTS idx_member_tags_box ON member_tags (box_id, tag);
