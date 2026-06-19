-- migrations/077_invoice_charge_ref_unique.sql
-- Idempotency backstop for invoice issuance.
--
-- issueInvoice() (src/app/api/webhooks/stripe/route.ts) dedups a Stripe charge
-- by a READ-THEN-INSERT on invoices.provider_charge_ref with NO unique
-- constraint behind it. Two concurrent deliveries of the SAME charge (distinct
-- Stripe event ids, so the event-level claimEvent gate doesn't catch them) can
-- both pass the SELECT-none and both INSERT -> a duplicate VAT invoice that
-- consumes an extra gap-free FTA sequence number. The credit-note path already
-- has UNIQUE(provider_refund_ref) as its backstop; this gives invoices the same
-- guarantee, so the second concurrent insert fails with 23505 instead.
--
-- Partial (NULL allowed) so manual / cash invoices issued without a provider
-- charge are unaffected (Postgres treats NULLs as distinct anyway; the WHERE
-- makes the intent explicit).
--
-- ⚠️ BEFORE APPLYING IN PROD: confirm there are no existing duplicates, or the
-- index creation will fail. Run this first and expect ZERO rows:
--   SELECT provider_charge_ref, count(*) FROM invoices
--    WHERE provider_charge_ref IS NOT NULL
--    GROUP BY provider_charge_ref HAVING count(*) > 1;
-- If any rows come back, reconcile those duplicate invoices before applying.
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only.

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_provider_charge_ref
  ON invoices (provider_charge_ref)
  WHERE provider_charge_ref IS NOT NULL;
