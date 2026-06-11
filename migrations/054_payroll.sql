-- migrations/054_payroll.sql
-- Payroll report (#55): per-coach pay setup + PT-session attribution log.
-- Pay data is OWNER-ONLY (coaches must not read each other's rates).
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS coach_pay_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  base_type     text CHECK (base_type IN ('per_class','monthly')),
  base_rate_aed numeric(10,2) CHECK (base_rate_aed IS NULL OR base_rate_aed >= 0),
  pt_rate_aed   numeric(10,2) CHECK (pt_rate_aed IS NULL OR pt_rate_aed >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, coach_id)
);

ALTER TABLE coach_pay_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_pay_rates_owner_all ON coach_pay_rates;
CREATE POLICY coach_pay_rates_owner_all ON coach_pay_rates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

-- One row per delivered 1:1 session, written at redeem time (service role).
CREATE TABLE IF NOT EXISTS pt_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES profiles(id),
  athlete_id  uuid NOT NULL REFERENCES profiles(id),
  credit_id   uuid REFERENCES package_credits(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by uuid REFERENCES profiles(id)
);

ALTER TABLE pt_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pt_sessions_owner_all ON pt_sessions;
CREATE POLICY pt_sessions_owner_all ON pt_sessions
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE INDEX IF NOT EXISTS idx_pt_sessions_box_coach ON pt_sessions (box_id, coach_id, redeemed_at);
