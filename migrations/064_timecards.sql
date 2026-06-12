-- migrations/064_timecards.sql
-- #59 part 2: staff clock-in/out. Hours are informational (no pay math).
-- Self ops via RLS; owner manages everyone's cards. Idempotent.

CREATE TABLE IF NOT EXISTS timecards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clock_in   timestamptz NOT NULL DEFAULT now(),
  clock_out  timestamptz,                -- null = on the clock
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timecards_box_staff ON timecards (box_id, staff_id, clock_in DESC);

ALTER TABLE timecards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timecards_self_select ON timecards;
CREATE POLICY timecards_self_select ON timecards
  FOR SELECT USING (staff_id = auth.uid() AND auth_is_staff());

DROP POLICY IF EXISTS timecards_self_insert ON timecards;
CREATE POLICY timecards_self_insert ON timecards
  FOR INSERT WITH CHECK (staff_id = auth.uid() AND box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS timecards_self_update ON timecards;
CREATE POLICY timecards_self_update ON timecards
  FOR UPDATE USING (staff_id = auth.uid() AND auth_is_staff())
  WITH CHECK (staff_id = auth.uid() AND auth_is_staff());

DROP POLICY IF EXISTS timecards_owner_all ON timecards;
CREATE POLICY timecards_owner_all ON timecards
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');
