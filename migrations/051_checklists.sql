-- migrations/051_checklists.sql
-- Onboarding/offboarding checklists (#38): owner-defined step templates + per-member
-- completion. Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS checklist_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  kind       text NOT NULL,                 -- 'onboarding' | 'offboarding'
  label      text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_box ON checklist_items (box_id, kind, position);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS checklist_items_staff_read ON checklist_items;
CREATE POLICY checklist_items_staff_read ON checklist_items
  FOR SELECT USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
DROP POLICY IF EXISTS checklist_items_owner_all ON checklist_items;
CREATE POLICY checklist_items_owner_all ON checklist_items
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS member_checklist_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES profiles(id),
  UNIQUE (member_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_member_checklist_progress_member ON member_checklist_progress (member_id);

ALTER TABLE member_checklist_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_checklist_progress_staff_all ON member_checklist_progress;
CREATE POLICY member_checklist_progress_staff_all ON member_checklist_progress
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
