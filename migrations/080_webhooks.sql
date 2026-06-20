-- migrations/080_webhooks.sql  (#65 public API, Phase 3 — outbound webhooks)
-- Per-gym webhook subscriptions + a delivery queue. Both service-role-only
-- (RLS on, no policies): owners manage subscriptions through server actions, and
-- the delivery cron + emit helper run as the service role. The per-subscription
-- `secret` signs deliveries (HMAC-SHA256) and is shown to the owner once.
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only.

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,
  event_types TEXT[] NOT NULL DEFAULT '{}',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_box ON webhook_subscriptions(box_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  box_id          UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  event_id        UUID NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending | delivered | dead
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_status INT,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The cron drains due pending rows: partial index keeps that query cheap.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due ON webhook_deliveries(next_attempt_at) WHERE status = 'pending';

-- RLS on, no policies → service-role only.
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
