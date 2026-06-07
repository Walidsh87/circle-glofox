-- migrations/024_workout_templates.sql
-- Reusable WOD library for the programming calendar (v2 Tier 2 #11). Same shape
-- as `workouts` minus the date. Staff-only; scheduling snapshots a template into
-- a `workouts` row, so nothing downstream (whiteboard / scores / athlete WOD)
-- changes. Run in Supabase SQL Editor. Idempotent. Requires the workouts table.

CREATE TABLE IF NOT EXISTS workout_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id                UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  scoring_type          TEXT NOT NULL CHECK (scoring_type IN ('time','rounds_reps','load_kg','amrap')),
  strength_title        TEXT,
  strength_description  TEXT,
  strength_lift         TEXT,
  strength_sets         JSONB,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage their gym's library. Mirrors staff_write_workouts.
DROP POLICY IF EXISTS staff_write_templates ON workout_templates;
CREATE POLICY staff_write_templates ON workout_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- No athlete policy: templates are a staff tool (RLS denies by default).

CREATE INDEX IF NOT EXISTS idx_workout_templates_box ON workout_templates (box_id, title);
