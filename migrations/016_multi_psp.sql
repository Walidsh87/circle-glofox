-- Multi-PSP support — provider abstraction (PR-1: Stripe-only refactor)
-- Run this in Supabase SQL Editor.
--
-- This migration is idempotent and tolerant of partial prior state:
--   - It will rename Stripe-specific columns to provider-agnostic ones if the
--     old names still exist; if the new names already exist it's a no-op.
--   - Requires migrations 012 and 013 to have run first (creates invoices and
--     credit_notes). If those tables are missing, this migration will skip the
--     renames silently — re-run after 012/013 land.

-- 1) Which PSP this gym is using. Backfill existing Stripe-connected boxes.
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS psp_provider TEXT
    CHECK (psp_provider IN ('stripe','telr','tap','checkout','ni','paytabs')),
  ADD COLUMN IF NOT EXISTS psp_credentials JSONB;

UPDATE boxes
   SET psp_provider = 'stripe'
 WHERE psp_provider IS NULL
   AND stripe_secret_key IS NOT NULL;

UPDATE boxes
   SET psp_credentials = jsonb_build_object(
         'secret_key',     stripe_secret_key,
         'webhook_secret', stripe_webhook_secret
       )
 WHERE psp_provider = 'stripe'
   AND psp_credentials IS NULL
   AND stripe_secret_key IS NOT NULL;

-- 2) Rename provider-specific reference columns to provider-agnostic names.
-- Each rename is wrapped so it skips if the old column is missing OR the
-- new column already exists. Order: only rename when (old exists AND new does not).
DO $$
DECLARE
  pairs TEXT[][] := ARRAY[
    ['invoices',     'stripe_invoice_id',        'provider_charge_ref'],
    ['invoices',     'stripe_payment_intent_id', 'provider_payment_ref'],
    ['credit_notes', 'stripe_refund_id',         'provider_refund_ref'],
    ['memberships',  'stripe_subscription_id',   'provider_subscription_ref'],
    ['memberships',  'stripe_customer_id',       'provider_customer_ref'],
    ['memberships',  'stripe_price_id',          'provider_plan_ref']
  ];
  t TEXT;
  old_col TEXT;
  new_col TEXT;
  has_old BOOLEAN;
  has_new BOOLEAN;
  i INT;
BEGIN
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    t       := pairs[i][1];
    old_col := pairs[i][2];
    new_col := pairs[i][3];

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = old_col
    ) INTO has_old;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = new_col
    ) INTO has_new;

    IF has_old AND NOT has_new THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', t, old_col, new_col);
      RAISE NOTICE 'Renamed %.% -> %', t, old_col, new_col;
    ELSIF has_new THEN
      RAISE NOTICE 'Skip %.%: target column % already exists', t, old_col, new_col;
    ELSE
      RAISE NOTICE 'Skip %.%: neither old nor new column exists (run earlier migration?)', t, old_col;
    END IF;
  END LOOP;
END $$;

-- 3) Rename the old Stripe index if present.
ALTER INDEX IF EXISTS idx_invoices_stripe_pi RENAME TO idx_invoices_provider_payment_ref;

-- Note: `boxes.stripe_secret_key` and `boxes.stripe_webhook_secret` are retained
-- as a transitional fallback. A follow-up migration will drop them once all
-- adapters read exclusively from psp_credentials.
