-- migrations/031_class_waitlist.sql
-- Waitlist for full classes (#26). One row per athlete per class; the earliest
-- created_at is "next in line". Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS class_waitlist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id            uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  class_instance_id uuid NOT NULL REFERENCES class_instances(id) ON DELETE CASCADE,
  athlete_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_instance_id, athlete_id)
);

ALTER TABLE class_waitlist ENABLE ROW LEVEL SECURITY;

-- Box members may READ their gym's waitlist (to compute count/position; no names shown).
DROP POLICY IF EXISTS box_read_waitlist ON class_waitlist;
CREATE POLICY box_read_waitlist ON class_waitlist
  FOR SELECT USING (box_id = auth_box_id());

-- Athletes manage their OWN waitlist entries.
DROP POLICY IF EXISTS athlete_manage_waitlist ON class_waitlist;
CREATE POLICY athlete_manage_waitlist ON class_waitlist
  FOR ALL
  USING (athlete_id = auth.uid() AND box_id = auth_box_id())
  WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE INDEX IF NOT EXISTS idx_class_waitlist_instance ON class_waitlist (class_instance_id, created_at);
