-- migrations/020_packages.sql
-- Packages (one-shot, credit-based): catalog + purchased credit batches.
-- Run in Supabase SQL Editor. Idempotent. Requires 012 (invoices) to have run.

-- 1) Catalog: what a gym offers for sale.
CREATE TABLE IF NOT EXISTS packages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('class_pack','drop_in','pt_block')),
  credit_count  INTEGER NOT NULL CHECK (credit_count > 0),
  price_aed     NUMERIC(10,2) NOT NULL CHECK (price_aed >= 0),
  expiry_days   INTEGER CHECK (expiry_days IS NULL OR expiry_days > 0),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage their gym's catalog.
DROP POLICY IF EXISTS packages_staff_all ON packages;
CREATE POLICY packages_staff_all ON packages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- Athletes browse active packages in their gym (storefront, read-only).
DROP POLICY IF EXISTS packages_athlete_select ON packages;
CREATE POLICY packages_athlete_select ON packages
  FOR SELECT
  USING (box_id = auth_box_id() AND active = true);

-- 2) Purchased credit batches owned by a member.
CREATE TABLE IF NOT EXISTS package_credits (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id               UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- ON DELETE RESTRICT by default (intentional): a catalog row with sold
  -- credits cannot be deleted; delete-package.ts catches the 23503 and tells
  -- the owner to deactivate instead.
  package_id           UUID NOT NULL REFERENCES packages(id),
  kind                 TEXT NOT NULL CHECK (kind IN ('class','pt_session')),
  credits_total        INTEGER NOT NULL CHECK (credits_total > 0),
  credits_remaining    INTEGER NOT NULL CHECK (credits_remaining >= 0),
  expires_at           DATE,
  invoice_id           UUID REFERENCES invoices(id),
  provider_charge_ref  TEXT UNIQUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE package_credits ENABLE ROW LEVEL SECURITY;

-- Athlete reads own credit batches.
DROP POLICY IF EXISTS package_credits_athlete_select ON package_credits;
CREATE POLICY package_credits_athlete_select ON package_credits
  FOR SELECT
  USING (athlete_id = auth.uid() AND box_id = auth_box_id());

-- Staff read all batches in their gym.
DROP POLICY IF EXISTS package_credits_staff_select ON package_credits;
CREATE POLICY package_credits_staff_select ON package_credits
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- NOTE: no INSERT/UPDATE/DELETE policy. Grant/consume/refund run via the SERVICE
-- ROLE in server actions (RLS bypassed there), matching the booking-count pattern.
-- This keeps credit mutation off the client entirely.

CREATE INDEX IF NOT EXISTS idx_package_credits_athlete
  ON package_credits (athlete_id, kind, credits_remaining);
