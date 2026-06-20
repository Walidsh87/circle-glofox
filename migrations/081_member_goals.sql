-- migrations/081_member_goals.sql  (#87 goal-setting + assigned training plans)
-- Per-athlete goals (auto-tracked from 1RM / belt / attendance, or custom) and
-- coach-assigned training plans. Both box-scoped with RLS.
--
-- RLS model:
--   member_goals          — all staff READ; programming tier (owner/admin/coach)
--                           manage any; athletes manage their OWN.
--   member_training_plans — all staff READ; programming tier manage any;
--                           athletes READ their own (coaches author, athletes view).
-- All-staff read (not just programming) so the member-profile card never returns
-- silent-empty for a receptionist viewing it.
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only.

CREATE TABLE IF NOT EXISTS member_goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  goal_type    TEXT NOT NULL CHECK (goal_type IN ('lift_1rm','skill_belt','attendance','custom')),
  title        TEXT NOT NULL,
  lift_name    TEXT,
  target_grams INTEGER,
  skill_key    TEXT,
  target_belt  TEXT,
  target_count INTEGER,
  target_date  DATE,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  achieved_at  TIMESTAMPTZ,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_goals_athlete ON member_goals(athlete_id);
CREATE INDEX IF NOT EXISTS idx_member_goals_box ON member_goals(box_id);

ALTER TABLE member_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_goals_staff_read ON member_goals;
CREATE POLICY member_goals_staff_read ON member_goals
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS member_goals_programming_manage ON member_goals;
CREATE POLICY member_goals_programming_manage ON member_goals
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS member_goals_athlete_own ON member_goals;
CREATE POLICY member_goals_athlete_own ON member_goals
  FOR ALL
  USING (box_id = auth_box_id() AND athlete_id = auth.uid())
  WITH CHECK (box_id = auth_box_id() AND athlete_id = auth.uid());


CREATE TABLE IF NOT EXISTS member_training_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_training_plans_athlete ON member_training_plans(athlete_id);
CREATE INDEX IF NOT EXISTS idx_member_training_plans_box ON member_training_plans(box_id);

ALTER TABLE member_training_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_plans_staff_read ON member_training_plans;
CREATE POLICY training_plans_staff_read ON member_training_plans
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS training_plans_programming_manage ON member_training_plans;
CREATE POLICY training_plans_programming_manage ON member_training_plans
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS training_plans_athlete_read ON member_training_plans;
CREATE POLICY training_plans_athlete_read ON member_training_plans
  FOR SELECT USING (box_id = auth_box_id() AND athlete_id = auth.uid());
