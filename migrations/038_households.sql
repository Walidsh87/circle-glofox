-- migrations/038_households.sql
-- Family / household memberships (#30): a household has a primary payer whose membership
-- covers all household members. Dependents have no membership of their own. Run in Supabase. Idempotent.
CREATE TABLE IF NOT EXISTS households (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id             uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name               text NOT NULL,
  primary_athlete_id uuid NOT NULL REFERENCES profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Any box member READS households (a dependent resolves their primary through it).
DROP POLICY IF EXISTS households_box_read ON households;
CREATE POLICY households_box_read ON households
  FOR SELECT USING (box_id = auth_box_id());

-- Owners manage households.
DROP POLICY IF EXISTS households_owner_write ON households;
CREATE POLICY households_owner_write ON households
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households(id);
CREATE INDEX IF NOT EXISTS idx_profiles_household ON profiles (household_id);
