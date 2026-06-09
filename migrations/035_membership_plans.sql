-- migrations/035_membership_plans.sql
-- Membership plan catalog (#27): reusable recurring plans (owner-defined). A membership
-- references the plan it came from but keeps its own plan_name/price as the billing snapshot.
-- Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS membership_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id             uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name               text NOT NULL,
  monthly_price_aed  numeric(10,2) CHECK (monthly_price_aed IS NULL OR monthly_price_aed >= 0),
  provider_plan_ref  text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;

-- Owners manage + read their gym's plans (payments + membership creation are owner-only).
DROP POLICY IF EXISTS membership_plans_owner_all ON membership_plans;
CREATE POLICY membership_plans_owner_all ON membership_plans
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE INDEX IF NOT EXISTS idx_membership_plans_box ON membership_plans (box_id, active);

-- A membership references the plan it came from. Default RESTRICT on delete: a plan with
-- memberships can't be deleted → deactivate. Existing memberships keep plan_id NULL.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES membership_plans(id);
