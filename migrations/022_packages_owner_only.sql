-- migrations/022_packages_owner_only.sql
-- Tighten package-catalog management to OWNER ONLY (was owner+coach).
-- Packages set prices/revenue, so they're treated like Payments & Settings
-- (owner-only). The app layer already enforces this; this aligns the RLS
-- backstop so no layer is broader than the stated access policy.
-- Run in Supabase SQL Editor. Requires 020. Idempotent.
DROP POLICY IF EXISTS packages_staff_all ON packages;
DROP POLICY IF EXISTS packages_owner_all ON packages;
CREATE POLICY packages_owner_all ON packages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

-- Athlete read policy (packages_athlete_select) is unchanged: members still
-- browse active packages for the storefront in PR-2.
