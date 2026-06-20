-- migrations/082_member_programs.sql  (#87 follow-on: structured training programs)
-- Per-member structured programs: program → sessions → exercises (sets/reps/%1RM).
-- Coaches author; members read. Per-set logging lands in 083 (separate migration).
-- box_id + athlete_id are denormalized onto every table → uniform RLS + single-table
-- per-exercise history queries. `client_uid` is the stable diff-save key (and the
-- target of per-set logs in 083); `program_exercises.archived_at` is a soft-delete
-- escape hatch for exercises that later have logs.
--
-- Run in the Supabase SQL Editor. Idempotent. Reversible (see ROLLBACKS.md).

CREATE TABLE IF NOT EXISTS member_programs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_programs_athlete ON member_programs(athlete_id);
CREATE INDEX IF NOT EXISTS idx_member_programs_box ON member_programs(box_id);
CREATE INDEX IF NOT EXISTS idx_member_programs_created_by ON member_programs(created_by);

CREATE TABLE IF NOT EXISTS program_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id  UUID NOT NULL REFERENCES member_programs(id) ON DELETE CASCADE,
  client_uid  UUID NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_program_sessions_uid ON program_sessions(program_id, client_uid);
CREATE INDEX IF NOT EXISTS idx_program_sessions_program ON program_sessions(program_id, position);
CREATE INDEX IF NOT EXISTS idx_program_sessions_box ON program_sessions(box_id);

CREATE TABLE IF NOT EXISTS program_exercises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL REFERENCES program_sessions(id) ON DELETE CASCADE,
  client_uid    UUID NOT NULL,
  position      INT NOT NULL DEFAULT 0,
  name          TEXT NOT NULL,
  lift_name     TEXT,
  sets          INT,
  reps          TEXT,
  percentage    INT,
  target_note   TEXT,
  rest_seconds  INT,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_program_exercises_uid ON program_exercises(session_id, client_uid);
CREATE INDEX IF NOT EXISTS idx_program_exercises_session ON program_exercises(session_id, position);
CREATE INDEX IF NOT EXISTS idx_program_exercises_box ON program_exercises(box_id);

ALTER TABLE member_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;

-- RLS triad per table: all-staff read (so the profile card never silent-empties for
-- a receptionist), programming-tier manage, athletes read their own (coaches author).
DROP POLICY IF EXISTS member_programs_staff_read ON member_programs;
CREATE POLICY member_programs_staff_read ON member_programs FOR SELECT
  USING (box_id = auth_box_id() AND auth_is_staff());
DROP POLICY IF EXISTS member_programs_programming_manage ON member_programs;
CREATE POLICY member_programs_programming_manage ON member_programs FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());
DROP POLICY IF EXISTS member_programs_athlete_read ON member_programs;
CREATE POLICY member_programs_athlete_read ON member_programs FOR SELECT
  USING (box_id = auth_box_id() AND athlete_id = auth.uid());

DROP POLICY IF EXISTS program_sessions_staff_read ON program_sessions;
CREATE POLICY program_sessions_staff_read ON program_sessions FOR SELECT
  USING (box_id = auth_box_id() AND auth_is_staff());
DROP POLICY IF EXISTS program_sessions_programming_manage ON program_sessions;
CREATE POLICY program_sessions_programming_manage ON program_sessions FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());
DROP POLICY IF EXISTS program_sessions_athlete_read ON program_sessions;
CREATE POLICY program_sessions_athlete_read ON program_sessions FOR SELECT
  USING (box_id = auth_box_id() AND athlete_id = auth.uid());

DROP POLICY IF EXISTS program_exercises_staff_read ON program_exercises;
CREATE POLICY program_exercises_staff_read ON program_exercises FOR SELECT
  USING (box_id = auth_box_id() AND auth_is_staff());
DROP POLICY IF EXISTS program_exercises_programming_manage ON program_exercises;
CREATE POLICY program_exercises_programming_manage ON program_exercises FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());
DROP POLICY IF EXISTS program_exercises_athlete_read ON program_exercises;
CREATE POLICY program_exercises_athlete_read ON program_exercises FOR SELECT
  USING (box_id = auth_box_id() AND athlete_id = auth.uid());
