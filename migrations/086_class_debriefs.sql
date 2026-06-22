-- migrations/086_class_debriefs.sql  (#98 class debrief / recap → activity feed)
-- A coach posts a short class recap that appears in the box-wide activity feed.
-- Every member may read (box-read); the programming tier posts/deletes.
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only (RLS).

CREATE TABLE IF NOT EXISTS class_debriefs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  wod_title   TEXT,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_class_debriefs_box_created ON class_debriefs(box_id, created_at DESC);

ALTER TABLE class_debriefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_debriefs_box_read ON class_debriefs;
CREATE POLICY class_debriefs_box_read ON class_debriefs
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS class_debriefs_programming_manage ON class_debriefs;
CREATE POLICY class_debriefs_programming_manage ON class_debriefs
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());
