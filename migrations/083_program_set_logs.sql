-- migrations/083_program_set_logs.sql  (#87 follow-on PR2: per-set logging)
-- A member logs each SET they perform against a program exercise, on a date.
-- exercise_id CASCADEs (program → session → exercise → log), so deleting a
-- program/session/exercise removes its logs; saveProgram's diff only deletes
-- exercises a coach explicitly removed, so normal edits never touch history.
-- box_id + athlete_id denormalized → uniform RLS + single-table history queries.
--
-- Run in the Supabase SQL Editor. Idempotent. Reversible (see ROLLBACKS.md).

CREATE TABLE IF NOT EXISTS program_set_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id  UUID NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
  performed_on DATE NOT NULL,
  set_number   INT NOT NULL,
  weight_grams INT,
  reps         INT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_program_set_logs_unique ON program_set_logs(exercise_id, athlete_id, performed_on, set_number);
CREATE INDEX IF NOT EXISTS idx_program_set_logs_history ON program_set_logs(athlete_id, exercise_id, performed_on);
CREATE INDEX IF NOT EXISTS idx_program_set_logs_box ON program_set_logs(box_id);

ALTER TABLE program_set_logs ENABLE ROW LEVEL SECURITY;

-- All staff read (coaches review history); athletes log + read their OWN sets.
DROP POLICY IF EXISTS set_logs_staff_read ON program_set_logs;
CREATE POLICY set_logs_staff_read ON program_set_logs FOR SELECT
  USING (box_id = auth_box_id() AND auth_is_staff());
DROP POLICY IF EXISTS set_logs_athlete_own ON program_set_logs;
CREATE POLICY set_logs_athlete_own ON program_set_logs FOR ALL
  USING (box_id = auth_box_id() AND athlete_id = auth.uid())
  WITH CHECK (box_id = auth_box_id() AND athlete_id = auth.uid());
