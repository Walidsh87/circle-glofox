-- Stripe Billing Migration
-- Run this in Supabase SQL Editor

-- Add Stripe keys to boxes
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret TEXT;

-- Add Stripe IDs to memberships
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- Payment event log (audit trail per payment)
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  membership_id UUID REFERENCES memberships(id),
  stripe_event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  amount_aed NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS box_isolation ON payment_events;
CREATE POLICY box_isolation ON payment_events
  USING (box_id = auth_box_id());
