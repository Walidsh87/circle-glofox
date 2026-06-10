-- migrations/048_follow_up_tasks.sql
-- Follow-up tasks (#47): shared staff to-dos with a due date, optionally linked to
-- a lead or a member. Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  title        text NOT NULL,
  due_date     date NOT NULL,
  lead_id      uuid REFERENCES leads(id) ON DELETE CASCADE,
  member_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  done         boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES profiles(id),
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_box ON follow_up_tasks (box_id, done, due_date);

ALTER TABLE follow_up_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_tasks ON follow_up_tasks;
CREATE POLICY staff_manage_tasks ON follow_up_tasks
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
