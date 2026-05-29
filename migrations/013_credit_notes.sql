-- Refunds workflow — UAE FTA-compliant credit notes
-- Run this in Supabase SQL Editor

-- Credit notes: one row per refund (partial or full) against an invoice.
-- Sequence is per-box, gap-free, independent of invoice sequence (FTA requirement).
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  athlete_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sequence INT NOT NULL,
  credit_note_number TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- All amounts positive; document type implies they reduce the original.
  subtotal_aed NUMERIC(10,2) NOT NULL,
  vat_rate NUMERIC(5,2) NOT NULL,
  vat_aed NUMERIC(10,2) NOT NULL,
  total_aed NUMERIC(10,2) NOT NULL,
  reason TEXT,
  refunded_by UUID REFERENCES profiles(id),
  -- Snapshots so historical docs survive setting changes
  trn_snapshot TEXT,
  legal_name_snapshot TEXT,
  billing_address_snapshot TEXT,
  customer_name_snapshot TEXT,
  customer_email_snapshot TEXT,
  invoice_number_snapshot TEXT NOT NULL,
  stripe_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (box_id, sequence),
  UNIQUE (box_id, credit_note_number),
  UNIQUE (stripe_refund_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_box ON credit_notes(box_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_athlete ON credit_notes(athlete_id);

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS box_isolation ON credit_notes;
CREATE POLICY box_isolation ON credit_notes
  USING (box_id = auth_box_id());

DROP POLICY IF EXISTS athlete_own_credit_notes ON credit_notes;
CREATE POLICY athlete_own_credit_notes ON credit_notes
  FOR SELECT
  USING (athlete_id = auth.uid());

-- Atomic next-sequence for credit notes (mirrors next_invoice_sequence).
CREATE OR REPLACE FUNCTION next_credit_note_sequence(p_box_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  next_seq INT;
BEGIN
  PERFORM 1 FROM boxes WHERE id = p_box_id FOR UPDATE;
  SELECT COALESCE(MAX(sequence), 0) + 1 INTO next_seq
    FROM credit_notes WHERE box_id = p_box_id;
  RETURN next_seq;
END;
$$;
