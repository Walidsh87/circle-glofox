-- UAE VAT-compliant invoicing
-- Run this in Supabase SQL Editor

-- TRN (Tax Registration Number) on boxes
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS trn TEXT,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_address TEXT;

-- Invoices: one row per successful Stripe payment.
-- Sequence is per-box, monotonically increasing, no gaps (FTA requirement).
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  sequence INT NOT NULL,
  invoice_number TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal_aed NUMERIC(10,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL,
  vat_aed NUMERIC(10,2) NOT NULL,
  total_aed NUMERIC(10,2) NOT NULL,
  trn_snapshot TEXT,
  legal_name_snapshot TEXT,
  billing_address_snapshot TEXT,
  customer_name_snapshot TEXT,
  customer_email_snapshot TEXT,
  description TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (box_id, sequence),
  UNIQUE (box_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_box ON invoices(box_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_athlete ON invoices(athlete_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_pi ON invoices(stripe_payment_intent_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS box_isolation ON invoices;
CREATE POLICY box_isolation ON invoices
  USING (box_id = auth_box_id());

-- Athletes can read their own invoices
DROP POLICY IF EXISTS athlete_own_invoices ON invoices;
CREATE POLICY athlete_own_invoices ON invoices
  FOR SELECT
  USING (athlete_id = auth.uid());

-- Atomic next-sequence function (gap-free per box).
-- Locks the box row, computes max+1, returns it. Callers insert in same txn.
CREATE OR REPLACE FUNCTION next_invoice_sequence(p_box_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  next_seq INT;
BEGIN
  -- Lock the box row to serialize concurrent webhooks for the same box
  PERFORM 1 FROM boxes WHERE id = p_box_id FOR UPDATE;
  SELECT COALESCE(MAX(sequence), 0) + 1 INTO next_seq
    FROM invoices WHERE box_id = p_box_id;
  RETURN next_seq;
END;
$$;
