-- migrations/040_skill_levels.sql
-- Skill/belt progression (#36): one belt per athlete per skill. Staff assess; athlete reads own.
-- Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS skill_levels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_key  text NOT NULL,
  belt       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, skill_key)
);
ALTER TABLE skill_levels ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage all belts in their box.
DROP POLICY IF EXISTS skill_levels_staff_all ON skill_levels;
CREATE POLICY skill_levels_staff_all ON skill_levels
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- An athlete reads their OWN belts.
DROP POLICY IF EXISTS skill_levels_athlete_read ON skill_levels;
CREATE POLICY skill_levels_athlete_read ON skill_levels
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE INDEX IF NOT EXISTS idx_skill_levels_athlete ON skill_levels (athlete_id);
